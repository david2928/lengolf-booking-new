import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/utils/supabase/admin';
import { checkTransaction } from '@/lib/shopeepay/client';
import { isFinalSuccess } from '@/lib/shopeepay/types';

/**
 * GET /api/payments/shopeepay/status?ref=<rental_code>
 *
 * Frontend polls this from /payment/result. Returns the current
 * payment_transactions.status, calling ShopeePay's /transaction/check
 * as a fallback when the webhook is delayed or the row is still
 * pending. Per the partner UAT contract, the redirect back to
 * /payment/result is NOT trusted as proof of success.
 *
 * The endpoint keeps its read surface minimal: status, the rental's
 * total_price (so /payment/result can show the receipt), and nothing
 * customer-identifying. Knowledge of rental_code is the implicit
 * capability — same threat model as /payment/start.
 */

type PublicStatus = 'pending' | 'redirected' | 'success' | 'failed' | 'refunded';

export async function GET(request: NextRequest) {
  const ref = request.nextUrl.searchParams.get('ref');
  if (!ref || ref.length > 32 || !/^[A-Za-z0-9-]+$/.test(ref)) {
    return NextResponse.json({ error: 'Invalid ref' }, { status: 400 });
  }

  const supabase = createAdminClient();

  // Find the rental + its most recent payment_transactions row.
  const { data: rental, error: rentalError } = await supabase
    .from('club_rentals')
    .select('id, rental_code, total_price, payment_status, rental_type')
    .eq('rental_code', ref)
    .single();

  if (rentalError || !rental) {
    return NextResponse.json({ error: 'Rental not found' }, { status: 404 });
  }
  if (rental.rental_type !== 'course') {
    return NextResponse.json({ error: 'Not applicable' }, { status: 400 });
  }

  const { data: txn } = await supabase
    .from('payment_transactions')
    .select('id, status, payment_reference_id, transaction_sn, amount, paid_at')
    .eq('club_rental_id', rental.id)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!txn) {
    // No payment was ever attempted for this rental.
    return NextResponse.json({
      ref,
      status: 'unpaid' as const,
      total_price: Number(rental.total_price),
    });
  }

  // If still pending, ask ShopeePay directly. /transaction/check is the
  // documented fallback when the webhook is delayed.
  let status = txn.status as PublicStatus;
  let transactionSn = txn.transaction_sn;
  let paidAt = txn.paid_at;

  if (status === 'pending' || status === 'redirected') {
    try {
      const probe = await checkTransaction({
        request_id: `check-${rental.rental_code}-${Date.now()}`,
        reference_id: txn.payment_reference_id,
        amount: txn.amount,
      });

      if (probe.errcode === 0 && isFinalSuccess(probe)) {
        // Promote to success locally. The webhook handler is the
        // source of truth for side effects (email + LINE) — we don't
        // re-fire those here. Worst case, the webhook arrives a few
        // seconds later and is idempotent.
        const updates: Record<string, unknown> = {
          status: 'success',
          paid_at: new Date().toISOString(),
        };
        if (probe.transaction_sn) updates.transaction_sn = probe.transaction_sn;
        if (typeof probe.payment_channel === 'number') {
          updates.payment_channel = probe.payment_channel;
        }
        if (probe.payment_method) updates.payment_method = probe.payment_method;

        await supabase.from('payment_transactions').update(updates).eq('id', txn.id);
        await supabase
          .from('club_rentals')
          .update({ payment_status: 'paid', expires_at: null })
          .eq('id', rental.id);

        status = 'success';
        transactionSn = probe.transaction_sn ?? transactionSn;
        paidAt = new Date().toISOString();
      } else if (probe.errcode === 0 && (probe.status !== undefined || probe.transaction_status !== undefined)) {
        // Terminal non-success.
        await supabase
          .from('payment_transactions')
          .update({ status: 'failed', error_code: probe.errcode })
          .eq('id', txn.id);
        await supabase
          .from('club_rentals')
          .update({ payment_status: 'failed' })
          .eq('id', rental.id);
        status = 'failed';
      }
      // else: still processing — leave as pending and let the client poll again.
    } catch (e) {
      // Don't fail the response just because the gateway probe didn't
      // come back. The client will poll again.
      console.warn('[ShopeePay/status] /transaction/check probe failed:', e);
    }
  }

  return NextResponse.json({
    ref,
    status,
    total_price: Number(rental.total_price),
    transaction_sn: transactionSn || null,
    paid_at: paidAt || null,
  });
}
