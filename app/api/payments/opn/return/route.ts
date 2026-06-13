import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/utils/supabase/admin';
import { retrieveCharge } from '@/lib/opn/client';
import { classifyFailure, isChargeTerminal } from '@/lib/opn/types';
import { loadRentalOrderSummary } from '@/lib/payments/order-summary';
import { processChargeResult } from '@/lib/opn/processChargeResult';

/**
 * GET /api/payments/opn/return?ref=CR...
 *
 * Polled by /payment/return. Reads the latest Opn transaction for the
 * rental; while the local row is still pending it probes the gateway
 * (charges.retrieve) as the webhook fallback. Terminal probe results
 * are recorded through the shared processChargeResult writer — the
 * same code path the webhook and the intent route use, so the rental
 * flip + email + staff LINE happen exactly once regardless of which
 * trigger lands first.
 */

type PublicStatus =
  | 'pending'
  | 'redirected'
  | 'success'
  | 'failed'
  | 'refunded'
  | 'partially_refunded';

function getBaseUrl(): string {
  if (process.env.VERCEL_ENV && process.env.VERCEL_ENV !== 'development' && process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL}`;
  }
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.NEXTAUTH_URL || '';
  if (baseUrl && !baseUrl.startsWith('http')) return `http://${baseUrl}`;
  if (!baseUrl && process.env.NODE_ENV !== 'production') return 'http://localhost:3000';
  return baseUrl;
}

export async function GET(request: NextRequest) {
  const ref = request.nextUrl.searchParams.get('ref');
  if (!ref || ref.length > 32 || !/^[A-Za-z0-9-]+$/.test(ref)) {
    return NextResponse.json({ error: 'Invalid ref' }, { status: 400 });
  }

  const supabase = createAdminClient();

  const { data: rental, error: rentalErr } = await supabase
    .from('club_rentals')
    .select('id, rental_code, total_price, payment_status, rental_type')
    .eq('rental_code', ref)
    .single();

  if (rentalErr || !rental) {
    return NextResponse.json({ error: 'Rental not found' }, { status: 404 });
  }
  if (rental.rental_type !== 'course') {
    return NextResponse.json({ error: 'Not applicable' }, { status: 400 });
  }

  const txnColumns =
    'id, status, gateway_charge_id, amount, paid_at, failure_code, card_brand, card_last4, auth_code';

  const { data: txn } = await supabase
    .from('payment_transactions')
    .select(txnColumns)
    .eq('club_rental_id', rental.id)
    .eq('gateway', 'opn')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  const summary = await loadRentalOrderSummary(supabase, ref);

  if (!txn) {
    return NextResponse.json({
      ref,
      status: 'unpaid' as const,
      total_price: Number(rental.total_price),
      failure_reason: null,
      summary,
    });
  }

  let current = txn;

  // Webhook fallback: while the local row is pending, probe the gateway.
  if ((current.status === 'pending' || current.status === 'redirected') && current.gateway_charge_id) {
    try {
      const charge = await retrieveCharge(current.gateway_charge_id);
      if (isChargeTerminal(charge)) {
        await processChargeResult(supabase, charge, { baseUrl: getBaseUrl() });
        // Re-read so the response reflects whatever the writer recorded.
        const { data: freshTxn } = await supabase
          .from('payment_transactions')
          .select(txnColumns)
          .eq('id', current.id)
          .maybeSingle();
        if (freshTxn) current = freshTxn;
      }
      // else: still processing — leave as pending; client polls again.
    } catch (e) {
      console.warn('[opn/return] charge probe failed:', e);
    }
  }

  const status = current.status as PublicStatus;
  const failureReason = status === 'failed' ? classifyFailure(current.failure_code) : null;

  return NextResponse.json({
    ref,
    status,
    total_price: Number(rental.total_price),
    gateway_charge_id: current.gateway_charge_id,
    paid_at: current.paid_at || null,
    failure_reason: failureReason,
    card_brand: current.card_brand,
    card_last4: current.card_last4,
    auth_code: current.auth_code,
    summary,
  });
}
