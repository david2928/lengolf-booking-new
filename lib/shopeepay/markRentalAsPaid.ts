import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { sendCourseRentalConfirmationEmail, resolveEmailLocale } from '@/lib/emailService';
import { groupAddOns, groupSetNames } from '@/lib/club-rental/order-pricing';
import { resolveRentalCustomer } from '@/lib/club-rental/resolve-customer';
import { resolveRentalDelivery } from '@/lib/club-rental/resolve-delivery';
import { resolveRentalAddOns } from '@/lib/club-rental/resolve-add-ons';
import { resolveRentalWindow } from '@/lib/club-rental/resolve-window';

/**
 * Marks a payment transaction + its rental as paid, and fires the
 * customer confirmation email exactly once across both detection
 * paths (webhook handler and /api/payments/shopeepay/status polling
 * fallback).
 *
 * Email dedup uses a conditional UPDATE on
 * payment_transactions.confirmation_email_sent_at — only the first
 * caller "claims" the send and dispatches the email. The second
 * caller's UPDATE returns no rows and skips.
 *
 * The DB writes (transaction status + rental flip) are still issued
 * by callers so each call site can pass its own status payload (the
 * webhook gets payload.transaction_sn from the wire body; the status
 * route gets it from /transaction/check). This helper handles the
 * email side-effect only.
 */
export async function claimAndSendConfirmationEmail(
  supabase: SupabaseClient,
  txnId: string,
  rentalId: string,
  options: { transactionSn?: string | null } = {}
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

  // 2. Load the rental + customer-language + club set in parallel.
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

  // Order-level FIRST: if this line belongs to an order, send ONE order-summary
  // email (joined set names + rollup totals) with the ORDER-canonical customer.
  // This must run BEFORE the line-email guard below: the order resolves its
  // recipient order-first, so it works even when the bearer LINE's email is null
  // but the header's is set (Option B divergence). The per-txn claim above still
  // dedups it. sendOrderConfirmationEmail returns null ONLY when the order can't be
  // loaded — then we fall through to the single-rental backstop. It has its own
  // !cust.email guard, so a genuinely email-less order returns no_customer_email.
  if (rental.order_id) {
    const orderResult = await sendOrderConfirmationEmail(supabase, rental, options);
    if (orderResult) return orderResult;
  }

  if (!rental.customer_email) {
    // Single-rental (indoor / orphan / order-load-failed backstop) path: nothing
    // to send without a line email — keep the claim so we don't retry forever.
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
      contactPreference:
        rental.contact_preference === 'line' ||
        rental.contact_preference === 'email' ||
        rental.contact_preference === 'whatsapp'
          ? rental.contact_preference
          : null,
      transactionSn: options.transactionSn ?? undefined,
    });
    return { sent: true };
  } catch (err) {
    console.error('[markRentalAsPaid] email send error:', err);
    return { sent: false, reason: 'email_send_error' };
  }
}

/**
 * Send ONE order-summary confirmation email for a paid course-rental ORDER
 * (joined set names + header rollup totals). Returns a result when it handled
 * the send (success OR send error), or null when the order couldn't be loaded
 * so the caller falls back to the single-rental email.
 */
async function sendOrderConfirmationEmail(
  supabase: SupabaseClient,
  rental: Record<string, unknown>,
  options: { transactionSn?: string | null },
): Promise<{ sent: boolean; reason?: string } | null> {
  const orderId = rental.order_id as string;
  const { data: order } = await supabase
    .from('club_rental_orders')
    .select(
      'order_code, rental_subtotal, delivery_fee, total_price, delivery_requested, delivery_address, delivery_time, return_time, start_date, end_date, start_time, duration_days, customer_id, customer_name, customer_email, add_ons, notes, contact_preference',
    )
    .eq('id', orderId)
    .maybeSingle();

  const { data: lineRows } = await supabase
    .from('club_rentals')
    .select('add_ons, rental_club_sets ( name, tier, gender )')
    .eq('order_id', orderId);

  if (!order || !lineRows || lineRows.length === 0) return null;

  type SetRef = { name?: string; tier?: string; gender?: string } | null;
  const setNames = groupSetNames(lineRows.map((r) => (r.rental_club_sets as SetRef)?.name));
  const firstSet = (lineRows[0].rental_club_sets as SetRef) ?? {};
  // Add-ons are order-canonical now (Option B, add-ons family): read them off the
  // header, not by flat-mapping the lines. The lineRows query stays for set names.
  const rawAddOns = resolveRentalAddOns({ order: order as { add_ons?: Array<{ key?: string; label: string; price: number }> | null } });
  const addOns = groupAddOns(rawAddOns).map((g) => ({
    label: g.quantity > 1 ? `${g.label} ×${g.quantity}` : g.label,
    price: g.price,
  }));

  // Customer is order-canonical for course rentals: read it off the loaded header,
  // falling back to the bearer line. (resolveRentalCustomer — Option B, customer family.)
  const cust = resolveRentalCustomer({
    customer_id: rental.customer_id as string | null,
    customer_name: rental.customer_name as string | null,
    customer_email: rental.customer_email as string | null,
    order,
  });

  if (!cust.email) {
    // No order-canonical email — keep the claim (no point retrying). Mirrors the
    // refund path's guard; load-bearing now that the order path runs before the
    // caller's line-email guard.
    return { sent: false, reason: 'no_customer_email' };
  }

  let language: string | null = null;
  if (cust.id) {
    const { data: customerLang } = await supabase
      .from('customers')
      .select('preferred_language')
      .eq('id', cust.id)
      .single();
    language = customerLang?.preferred_language ?? null;
  }

  // Delivery is order-canonical for course rentals (Option B): read it off the
  // header, falling back per-field to the bearer line. (resolveRentalDelivery.)
  const delivery = resolveRentalDelivery({
    delivery_requested: rental.delivery_requested as boolean | null,
    delivery_address: rental.delivery_address as string | null,
    delivery_time: rental.delivery_time as string | null,
    return_time: rental.return_time as string | null,
    order,
  });
  const deliveryTimeStr = [
    delivery.deliveryTime
      ? `${delivery.requested ? 'Delivery' : 'Pickup'}: ${delivery.deliveryTime}`
      : '',
    delivery.returnTime ? `Return: ${delivery.returnTime}` : '',
  ]
    .filter(Boolean)
    .join(', ');

  const contactPref = (order.contact_preference as string | null) ?? (rental.contact_preference as string | null);

  // Window is order-canonical for course rentals (Option B incr 3b): read it off
  // the header, falling back per-field to the line.
  const window = resolveRentalWindow({
    start_date: rental.start_date as string | null,
    end_date: rental.end_date as string | null,
    start_time: rental.start_time as string | null,
    return_time: rental.return_time as string | null,
    duration_days: rental.duration_days as number | null,
    order,
  });

  try {
    await sendCourseRentalConfirmationEmail({
      customerName: (cust.name ?? rental.customer_name) as string,
      email: (cust.email ?? rental.customer_email) as string,
      rentalCode: order.order_code,
      clubSetName: setNames,
      clubSetTier: (firstSet.tier as string) ?? 'premium',
      clubSetGender: (firstSet.gender as string) ?? 'mens',
      startDate: (window.startDate ?? rental.start_date) as string,
      endDate: (window.endDate ?? rental.end_date) as string,
      durationDays: window.durationDays ?? ((rental.duration_days as number) || 1),
      deliveryRequested: delivery.requested,
      deliveryAddress: delivery.address ?? undefined,
      deliveryTime: deliveryTimeStr || undefined,
      addOns,
      rentalPrice: Number(order.rental_subtotal),
      deliveryFee: Number(order.delivery_fee || 0),
      totalPrice: Number(order.total_price),
      notes: ((order.notes as string | null) ?? (rental.notes as string | null)) ?? undefined,
      language: resolveEmailLocale(language),
      paymentStatus: 'paid',
      contactPreference:
        contactPref === 'line' || contactPref === 'email' || contactPref === 'whatsapp'
          ? contactPref
          : null,
      transactionSn: options.transactionSn ?? undefined,
    });
    return { sent: true };
  } catch (err) {
    console.error('[markRentalAsPaid] order email send error:', err);
    return { sent: false, reason: 'email_send_error' };
  }
}
