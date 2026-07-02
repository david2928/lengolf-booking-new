/**
 * Create the 1-line club_rental_orders header for a single COURSE rental,
 * BEFORE its club_rentals line is inserted.
 *
 * Phase 0 (order-authority-inversion, 2026-07-02) made club_rentals.order_id
 * NOT NULL, so the header must exist before the line — this replaces the old
 * insert-line-then-wrap helper (wrapCourseRentalInOrder), preserving its exact
 * header-building semantics (same fields, same defaults).
 *
 * The primary multi-set customer path is POST /api/clubs/order, which creates
 * the header itself. This helper serves the single-set /api/clubs/reserve path —
 * required for the course-only column-DROP model, where the shared
 * customer/delivery/notes fields live ONLY on the order header.
 *
 * Mirrors lengolf-forms src/lib/club-rental/orders.ts — keep the two in step.
 *
 * Returns { id, order_code } or null on failure. NOT best-effort any more: the
 * caller must abort on null — a course line cannot exist without its header.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
export async function createCourseOrderHeader(
  admin: any,
  header: Record<string, any>,
): Promise<{ id: string; order_code: string } | null> {
  try {
    const { data: orderCode, error: codeErr } = await admin.rpc('generate_club_rental_order_code')
    if (codeErr || !orderCode) {
      console.error('[createCourseOrderHeader] order code generation failed:', codeErr)
      return null
    }

    const { data: order, error: orderErr } = await admin
      .from('club_rental_orders')
      .insert({
        order_code: orderCode,
        customer_id: header.customer_id ?? null,
        customer_name: header.customer_name,
        customer_email: header.customer_email ?? null,
        customer_phone: header.customer_phone ?? null,
        user_id: header.user_id ?? null,
        status: header.status ?? 'reserved',
        start_date: header.start_date ?? null,
        end_date: header.end_date ?? null,
        start_time: header.start_time ?? null,
        duration_days: header.duration_days ?? null,
        delivery_requested: header.delivery_requested ?? false,
        delivery_address: header.delivery_address ?? null,
        delivery_lat: header.delivery_lat ?? null,
        delivery_lng: header.delivery_lng ?? null,
        delivery_time: header.delivery_time ?? null,
        return_pickup_address: header.return_pickup_address ?? null,
        return_pickup_lat: header.return_pickup_lat ?? null,
        return_pickup_lng: header.return_pickup_lng ?? null,
        return_time: header.return_time ?? null,
        delivery_fee: header.delivery_fee ?? 0,
        payment_status: header.payment_status ?? 'unpaid',
        payment_transaction_id: header.payment_transaction_id ?? null,
        payment_method_chosen: header.payment_method_chosen ?? null,
        contact_preference: header.contact_preference ?? null,
        expires_at: header.expires_at ?? null,
        rental_subtotal: header.rental_price ?? 0,
        add_ons_total: header.add_ons_total ?? 0,
        add_ons: header.add_ons ?? [],
        discount_amount: header.discount_amount ?? 0,
        total_price: header.total_price ?? 0,
        source: header.source ?? 'booking_app',
        notes: header.notes ?? null,
      })
      .select('id, order_code')
      .single()
    if (orderErr || !order) {
      console.error('[createCourseOrderHeader] header insert failed:', orderErr)
      return null
    }

    return order
  } catch (e) {
    console.error('[createCourseOrderHeader] error:', e)
    return null
  }
}

/**
 * For a LINE-message composer that reads the (denormalised) shared columns off a
 * single club_rentals row, return that row with the shared DROP columns resolved
 * ORDER-FIRST (the order header value when the line belongs to an order; the line
 * value as fallback for order-less rows). Keeps staff refund/lifecycle pings
 * correct after those columns are dropped from the line.
 *
 * Best-effort: on a header-load miss it returns the row unchanged.
 */
export async function resolveLineMessageRental<T extends Record<string, any>>(
  admin: any,
  rental: T,
): Promise<T> {
  if (!rental?.order_id) return rental
  const { data: hdr, error } = await admin
    .from('club_rental_orders')
    .select(
      'customer_name, customer_phone, customer_email, delivery_requested, delivery_address, delivery_time, notes, contact_preference, payment_method_chosen',
    )
    .eq('id', rental.order_id)
    .maybeSingle()
  if (error) console.warn('[resolveLineMessageRental] header load failed:', error)
  if (!hdr) return rental
  return {
    ...rental,
    customer_name: hdr.customer_name ?? rental.customer_name,
    customer_phone: hdr.customer_phone ?? rental.customer_phone,
    customer_email: hdr.customer_email ?? rental.customer_email,
    delivery_requested: hdr.delivery_requested ?? rental.delivery_requested,
    delivery_address: hdr.delivery_address ?? rental.delivery_address,
    delivery_time: hdr.delivery_time ?? rental.delivery_time,
    notes: hdr.notes ?? rental.notes,
    contact_preference: hdr.contact_preference ?? rental.contact_preference,
    payment_method_chosen: hdr.payment_method_chosen ?? rental.payment_method_chosen,
  } as T
}
