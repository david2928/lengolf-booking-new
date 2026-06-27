import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Order-level payment helpers.
 *
 * Course-rental payment is ORDER-level: one ShopeePay charge covers the whole
 * club_rental_orders header (all its club_rentals lines). The customer-facing
 * payment pages still key off the order's bearer-line `rental_code` (the
 * payment_transactions row points at that line), so nothing on /payment/* needs
 * to change — but the server charges `order.total_price` and propagates the
 * payment state to the header + every line.
 *
 * Per-line payment columns stay denormalised (forms Option A) so the not-yet-
 * migrated readers (forms order/list UI, payment-link lookup, refund) keep
 * working. A line with order_id = NULL (legacy /api/clubs/reserve rental) is
 * handled by the caller as a single row — these helpers are no-ops without an
 * order id.
 */

export interface OrderPaymentFields {
  payment_status: string;
  /** Pass `null` to clear the expiry (on paid); omit to leave it untouched. */
  expires_at?: string | null;
  payment_transaction_id?: string | null;
}

/**
 * Propagate a payment state to the WHOLE order — the club_rental_orders header
 * AND every club_rentals line sharing order_id.
 *
 * Returns `true` only when BOTH the line update and the header update succeed.
 * Callers on the authoritative webhook success path MUST inspect the result and
 * return non-zero (so ShopeePay retries) on `false`, otherwise a partial
 * propagation (e.g. bearer line paid but header/siblings not) would be acked and
 * never reconciled. Logs on failure regardless.
 */
export async function applyOrderPaymentState(
  supabase: SupabaseClient,
  orderId: string,
  fields: OrderPaymentFields,
): Promise<boolean> {
  const shared: Record<string, unknown> = { payment_status: fields.payment_status };
  if ('expires_at' in fields) shared.expires_at = fields.expires_at ?? null;
  if (fields.payment_transaction_id !== undefined) {
    shared.payment_transaction_id = fields.payment_transaction_id;
  }

  const { error: lineErr } = await supabase
    .from('club_rentals')
    .update(shared)
    .eq('order_id', orderId);
  if (lineErr) console.error('[orderPayment] line propagation failed:', lineErr);

  const { error: headerErr } = await supabase
    .from('club_rental_orders')
    .update({ ...shared, updated_at: new Date().toISOString() })
    .eq('id', orderId);
  if (headerErr) console.error('[orderPayment] header propagation failed:', headerErr);

  return !lineErr && !headerErr;
}

export interface OrderChargeContext {
  orderId: string;
  orderCode: string;
  /** Authoritative amount to charge for the whole order (THB). */
  totalPrice: number;
  paymentStatus: string;
}

/**
 * Resolve the order a course-rental line belongs to (for charging the order
 * total instead of the single line). Returns null for order-less lines.
 */
export async function loadOrderChargeContext(
  supabase: SupabaseClient,
  orderId: string | null | undefined,
): Promise<OrderChargeContext | null> {
  if (!orderId) return null;
  const { data: order, error } = await supabase
    .from('club_rental_orders')
    .select('id, order_code, total_price, payment_status')
    .eq('id', orderId)
    .maybeSingle();
  if (error || !order) {
    console.error('[orderPayment] order lookup failed:', error);
    return null;
  }
  return {
    orderId: order.id,
    orderCode: order.order_code,
    totalPrice: Number(order.total_price),
    paymentStatus: order.payment_status,
  };
}
