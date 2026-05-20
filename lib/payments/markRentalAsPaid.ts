import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { sendCourseRentalConfirmationEmail, resolveEmailLocale } from '@/lib/emailService';

/**
 * Gateway-agnostic helper that:
 *  1. Atomically claims the customer-confirmation email send via a
 *     conditional UPDATE on payment_transactions.confirmation_email_sent_at.
 *  2. On successful claim, loads the rental + club set + customer
 *     language, then sends the confirmation email.
 *
 * Race-safe across detection paths (webhook handler + polling endpoint).
 * The first caller wins the claim and dispatches; the second sees
 * confirmation_email_sent_at != null and returns { sent: false, reason:
 * 'already_claimed' }.
 *
 * gatewayMetadata is the only gateway-specific surface — callers pass
 * whatever identifier the email should display as the "transaction
 * reference" for support lookup. ShopeePay passes transaction_sn
 * ('1600...'); Opn passes the chrg_* id.
 */
export interface GatewayMetadata {
  /** Display string for the email's "Transaction reference" line. */
  transactionRef?: string | null;
}

export async function claimAndSendConfirmationEmail(
  supabase: SupabaseClient,
  txnId: string,
  rentalId: string,
  gatewayMetadata: GatewayMetadata = {}
): Promise<{ sent: boolean; reason?: string }> {
  // 1. Atomically claim the email send.
  const { data: claimed, error: claimError } = await supabase
    .from('payment_transactions')
    .update({ confirmation_email_sent_at: new Date().toISOString() })
    .eq('id', txnId)
    .is('confirmation_email_sent_at', null)
    .select('id')
    .maybeSingle();

  if (claimError) {
    console.error('[markRentalAsPaid] email claim failed:', claimError);
    return { sent: false, reason: 'claim_error' };
  }

  if (!claimed) {
    // Already claimed by a parallel caller (webhook + polling can race).
    return { sent: false, reason: 'already_claimed' };
  }

  // 2. Load the rental + customer-language + club set.
  const { data: rental, error: rentalError } = await supabase
    .from('club_rentals')
    .select('*')
    .eq('id', rentalId)
    .single();

  if (rentalError || !rental) {
    console.error('[markRentalAsPaid] rental load failed:', rentalError);
    // Roll back the claim so the next attempt can re-try.
    await supabase
      .from('payment_transactions')
      .update({ confirmation_email_sent_at: null })
      .eq('id', txnId);
    return { sent: false, reason: 'rental_not_found' };
  }

  if (!rental.customer_email) {
    // Nothing to send — but keep the claim so we don't retry forever.
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

  const { data: clubSet } = await supabase
    .from('rental_club_sets')
    .select('name, tier, gender')
    .eq('id', rental.rental_club_set_id)
    .single();

  if (!clubSet) {
    return { sent: false, reason: 'club_set_not_found' };
  }

  const addOns = Array.isArray(rental.add_ons)
    ? (rental.add_ons as Array<{ label: string; price: number }>).map(a => ({
        label: a.label,
        price: a.price,
      }))
    : [];

  const deliveryTimeStr = [
    rental.delivery_time
      ? `${rental.delivery_requested ? 'Delivery' : 'Pickup'}: ${rental.delivery_time}`
      : '',
    rental.return_time ? `Return: ${rental.return_time}` : '',
  ]
    .filter(Boolean)
    .join(', ');

  // Best-effort: log but don't roll back the claim. A failed send
  // means the customer doesn't get the email this attempt; resending
  // requires a manual support touch (which is the existing behavior).
  try {
    await sendCourseRentalConfirmationEmail({
      customerName: rental.customer_name,
      email: rental.customer_email,
      rentalCode: rental.rental_code,
      clubSetName: clubSet.name,
      clubSetTier: clubSet.tier,
      clubSetGender: clubSet.gender,
      startDate: rental.start_date,
      endDate: rental.end_date,
      durationDays: rental.duration_days || 1,
      deliveryRequested: !!rental.delivery_requested,
      deliveryAddress: rental.delivery_address ?? undefined,
      deliveryTime: deliveryTimeStr || undefined,
      addOns,
      rentalPrice: Number(rental.rental_price),
      deliveryFee: Number(rental.delivery_fee || 0),
      totalPrice: Number(rental.total_price),
      notes: rental.notes ?? undefined,
      language: emailLocale,
      paymentStatus: 'paid',
      // transactionSn is the existing emailService param name — we pass
      // gatewayMetadata.transactionRef through it unchanged.
      transactionSn: gatewayMetadata.transactionRef ?? undefined,
    });
    return { sent: true };
  } catch (err) {
    console.error('[markRentalAsPaid] email send error:', err);
    return { sent: false, reason: 'email_send_error' };
  }
}
