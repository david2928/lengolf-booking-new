import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/utils/supabase/admin';
import { checkTransaction } from '@/lib/shopeepay/client';
import { isFinalSuccess } from '@/lib/shopeepay/types';
import { loadRentalOrderSummary } from '@/lib/shopeepay/order-summary';
import { claimAndSendConfirmationEmail } from '@/lib/shopeepay/markRentalAsPaid';

/**
 * GET /api/payments/shopeepay/status?ref=<rental_code>
 *
 * Frontend polls this from /payment/result. Returns the current
 * payment_transactions.status, calling ShopeePay's /transaction/check
 * as a fallback when the webhook is delayed or the row is still
 * pending. Per the partner UAT contract, the redirect back to
 * /payment/result is NOT trusted as proof of success.
 *
 * Modern UX requirements:
 *  - On poll-detected success, fire the customer confirmation email
 *    via claimAndSendConfirmationEmail() (idempotent vs the webhook).
 *  - Return a normalized failure_reason so the client can render
 *    decline-vs-cancelled-vs-expired UX, not a generic "failed".
 *  - Return the order summary so /payment/result can render a real
 *    receipt without a separate roundtrip.
 */

type PublicStatus = 'pending' | 'redirected' | 'success' | 'failed' | 'refunded';
type FailureReason = 'declined' | 'cancelled' | 'expired' | 'unknown' | null;

const SHOPEEPAY_DECLINED_CODES = new Set([3, 4]); // ShopeePay's declined-by-issuer / failure codes
const SHOPEEPAY_CANCELLED_CODES = new Set([5]); // user-initiated cancel

function classifyFailure(errcode: number | null | undefined): FailureReason {
  if (errcode == null) return 'unknown';
  if (SHOPEEPAY_DECLINED_CODES.has(errcode)) return 'declined';
  if (SHOPEEPAY_CANCELLED_CODES.has(errcode)) return 'cancelled';
  return 'unknown';
}

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
    .select('id, status, payment_reference_id, transaction_sn, amount, paid_at, error_code')
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
      failure_reason: null as FailureReason,
    });
  }

  let status = txn.status as PublicStatus;
  let transactionSn = txn.transaction_sn;
  let paidAt = txn.paid_at;
  let failureReason: FailureReason = status === 'failed' ? classifyFailure(txn.error_code) : null;

  // If still pending, ask ShopeePay directly. /transaction/check is the
  // documented fallback when the webhook is delayed.
  if (status === 'pending' || status === 'redirected') {
    try {
      const probe = await checkTransaction({
        request_id: `check-${rental.rental_code}-${Date.now()}`,
        reference_id: txn.payment_reference_id,
        amount: txn.amount,
      });

      if (probe.errcode === 0 && isFinalSuccess(probe)) {
        // Promote to success locally. The webhook handler is the
        // source of truth for staff LINE notification — we only
        // claim-and-send the customer email here, which is idempotent
        // via confirmation_email_sent_at.
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
        failureReason = null;

        // Fire the customer confirmation email (idempotent — webhook
        // arrival later will see the email already claimed and skip).
        // Don't await — keep the polling response fast.
        void claimAndSendConfirmationEmail(supabase, txn.id, rental.id, {
          transactionSn: transactionSn,
        });
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
        // The probe's terminal status code can hint at failure reason.
        failureReason = classifyFailure(
          typeof probe.status === 'number' ? probe.status : probe.errcode
        );
      }
      // else: still processing — leave as pending and let the client poll again.
    } catch (e) {
      // Don't fail the response just because the gateway probe didn't
      // come back. The client will poll again.
      console.warn('[ShopeePay/status] /transaction/check probe failed:', e);
    }
  }

  // Also load the order summary so the /payment/result page can render
  // a full receipt on success without an extra roundtrip.
  const summary = await loadRentalOrderSummary(supabase, ref);

  return NextResponse.json({
    ref,
    status,
    total_price: Number(rental.total_price),
    transaction_sn: transactionSn || null,
    paid_at: paidAt || null,
    failure_reason: failureReason,
    summary,
  });
}
