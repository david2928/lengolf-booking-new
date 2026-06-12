import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { sendCourseRentalRefundEmail, resolveEmailLocale } from '@/lib/emailService';

/**
 * Atomically claims the refund-email send and dispatches the customer
 * notification. Mirrors `claimAndSendConfirmationEmail` exactly:
 * the conditional UPDATE on `payment_refunds.refund_email_sent_at`
 * ensures only the first caller wins, so webhook deliveries that
 * race (or that retry) never double-send.
 *
 * The DB writes that flip refund/transaction/rental status are issued
 * by the webhook caller — this helper handles the email side-effect
 * only, mirroring the markRentalAsPaid contract.
 */
export async function claimAndSendRefundEmail(
  supabase: SupabaseClient,
  refundId: string,
  context: {
    refundSn?: string | null;
  } = {}
): Promise<{ sent: boolean; reason?: string }> {
  // 1. Atomically claim the email send.
  const { data: claimed, error: claimError } = await supabase
    .from('payment_refunds')
    .update({ refund_email_sent_at: new Date().toISOString() })
    .eq('id', refundId)
    .is('refund_email_sent_at', null)
    .select('id, payment_transaction_id, amount, refunded_at')
    .maybeSingle();

  if (claimError) {
    console.error('[markRefundAsRefunded] email claim failed:', claimError);
    return { sent: false, reason: 'claim_error' };
  }

  if (!claimed) {
    return { sent: false, reason: 'already_claimed' };
  }

  // 2. Load the parent transaction + rental in parallel.
  const { data: txn, error: txnErr } = await supabase
    .from('payment_transactions')
    .select('id, club_rental_id, amount, refunded_amount')
    .eq('id', claimed.payment_transaction_id)
    .single();

  if (txnErr || !txn) {
    console.error('[markRefundAsRefunded] txn load failed:', txnErr);
    // Roll back the claim so the next webhook retry can re-attempt.
    await supabase
      .from('payment_refunds')
      .update({ refund_email_sent_at: null })
      .eq('id', refundId);
    return { sent: false, reason: 'txn_not_found' };
  }

  if (!txn.club_rental_id) {
    return { sent: false, reason: 'no_rental_linked' };
  }

  const { data: rental, error: rentalErr } = await supabase
    .from('club_rentals')
    .select('rental_code, customer_name, customer_email, customer_id, total_price')
    .eq('id', txn.club_rental_id)
    .single();

  if (rentalErr || !rental) {
    console.error('[markRefundAsRefunded] rental load failed:', rentalErr);
    await supabase
      .from('payment_refunds')
      .update({ refund_email_sent_at: null })
      .eq('id', refundId);
    return { sent: false, reason: 'rental_not_found' };
  }

  if (!rental.customer_email) {
    // Keep the claim — no point retrying when there's no address.
    return { sent: false, reason: 'no_customer_email' };
  }

  let language: string | null = null;
  if (rental.customer_id) {
    const { data: customerLang } = await supabase
      .from('customers')
      .select('preferred_language')
      .eq('id', rental.customer_id)
      .single();
    language = customerLang?.preferred_language ?? null;
  }
  const emailLocale = resolveEmailLocale(language);

  // Money arrives as satang in DB; the email is in display THB.
  const originalAmountThb = Math.round(Number(txn.amount) / 100);
  const refundAmountThb = Math.round(Number(claimed.amount) / 100);
  const totalRefundedThb = Math.round(Number(txn.refunded_amount) / 100);
  const isPartial = totalRefundedThb < originalAmountThb;

  try {
    await sendCourseRentalRefundEmail({
      customerName: rental.customer_name,
      email: rental.customer_email,
      rentalCode: rental.rental_code,
      refundSn: context.refundSn ?? undefined,
      originalAmountThb,
      refundAmountThb,
      totalRefundedThb,
      refundedAt: claimed.refunded_at ?? new Date().toISOString(),
      isPartial,
      language: emailLocale,
    });
    return { sent: true };
  } catch (err) {
    console.error('[markRefundAsRefunded] email send error:', err);
    return { sent: false, reason: 'email_send_error' };
  }
}
