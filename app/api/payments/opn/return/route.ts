import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/utils/supabase/admin';
import { retrieveCharge } from '@/lib/opn/client';
import { classifyFailure, isChargeSuccessful, isChargeTerminal } from '@/lib/opn/types';
import { loadRentalOrderSummary } from '@/lib/payments/order-summary';
import { claimAndSendConfirmationEmail } from '@/lib/payments/markRentalAsPaid';

type PublicStatus = 'pending' | 'redirected' | 'success' | 'failed' | 'refunded';

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

  const { data: txn } = await supabase
    .from('payment_transactions')
    .select('id, status, gateway_charge_id, amount, paid_at, failure_code, card_brand, card_last4, auth_code')
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

  let status = txn.status as PublicStatus;
  let paidAt = txn.paid_at;
  let failureReason = status === 'failed' ? classifyFailure(txn.failure_code) : null;
  const gatewayChargeId = txn.gateway_charge_id;
  let cardBrand = txn.card_brand;
  let cardLast4 = txn.card_last4;
  let authCode = txn.auth_code;

  if ((status === 'pending' || status === 'redirected') && txn.gateway_charge_id) {
    try {
      const charge = await retrieveCharge(txn.gateway_charge_id);

      if (isChargeSuccessful(charge)) {
        const nowIso = new Date().toISOString();
        const updates: Record<string, unknown> = {
          status: 'success',
          paid_at: nowIso,
          card_brand: charge.card?.brand ?? null,
          card_last4: charge.card?.last_digits ?? null,
          auth_code: (charge as { authorization_code?: string | null }).authorization_code ?? null,
          is_3ds: charge.authorize_uri !== null,
          transaction_fee_rate: charge.transaction_fees?.fee_rate ?? null,
          transaction_vat_rate: charge.transaction_fees?.vat_rate ?? null,
        };
        await supabase.from('payment_transactions').update(updates).eq('id', txn.id);
        await supabase
          .from('club_rentals')
          .update({ payment_status: 'paid', expires_at: null })
          .eq('id', rental.id);

        status = 'success';
        paidAt = nowIso;
        failureReason = null;
        cardBrand = charge.card?.brand ?? cardBrand;
        cardLast4 = charge.card?.last_digits ?? cardLast4;
        authCode = (charge as { authorization_code?: string | null }).authorization_code ?? authCode;

        try {
          await claimAndSendConfirmationEmail(supabase, txn.id, rental.id, {
            transactionSn: charge.id,
          });
        } catch (emailErr) {
          // Email must never fail the poll response; dedup claim means a
          // later webhook delivery can still pick it up if we lost the race.
          console.error('[opn/return] confirmation email error:', emailErr);
        }
      } else if (isChargeTerminal(charge) && charge.status === 'failed') {
        await supabase
          .from('payment_transactions')
          .update({
            status: 'failed',
            failure_code: charge.failure_code,
            failure_message: charge.failure_message,
          })
          .eq('id', txn.id);
        await supabase
          .from('club_rentals')
          .update({ payment_status: 'failed' })
          .eq('id', rental.id);

        status = 'failed';
        failureReason = classifyFailure(charge.failure_code);
      }
      // else: still processing — leave as pending; client polls again.
    } catch (e) {
      console.warn('[opn/return] charge probe failed:', e);
    }
  }

  return NextResponse.json({
    ref,
    status,
    total_price: Number(rental.total_price),
    gateway_charge_id: gatewayChargeId,
    paid_at: paidAt || null,
    failure_reason: failureReason,
    card_brand: cardBrand,
    card_last4: cardLast4,
    auth_code: authCode,
    summary,
  });
}
