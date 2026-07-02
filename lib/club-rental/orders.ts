/**
 * Wrap a freshly-inserted single COURSE club_rentals row in its own 1-line
 * club_rental_orders header and link it (header rollups = the line's values).
 *
 * The primary multi-set customer path is POST /api/clubs/order, which creates
 * the header itself. This helper keeps the "every course rental belongs to an
 * order" invariant for the single-set /api/clubs/reserve path too — required for
 * the course-only column-DROP model, where the shared customer/delivery/notes
 * fields live ONLY on the order header.
 *
 * Mirrors lengolf-forms src/lib/club-rental/orders.ts — keep the two in step.
 *
 * Best-effort: on failure it logs and returns null rather than failing an
 * already-created rental. Downstream reads treat an order-less course rental as
 * an implicit solo order, so a miss degrades gracefully.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
export async function wrapCourseRentalInOrder(
  admin: any,
  rental: Record<string, any>,
): Promise<string | null> {
  try {
    const { data: orderCode, error: codeErr } = await admin.rpc('generate_club_rental_order_code')
    if (codeErr || !orderCode) {
      console.error('[wrapCourseRentalInOrder] order code generation failed:', codeErr)
      return null
    }

    const { data: order, error: orderErr } = await admin
      .from('club_rental_orders')
      .insert({
        order_code: orderCode,
        customer_id: rental.customer_id ?? null,
        customer_name: rental.customer_name,
        customer_email: rental.customer_email ?? null,
        customer_phone: rental.customer_phone ?? null,
        user_id: rental.user_id ?? null,
        status: rental.status ?? 'reserved',
        start_date: rental.start_date ?? null,
        end_date: rental.end_date ?? null,
        start_time: rental.start_time ?? null,
        duration_days: rental.duration_days ?? null,
        delivery_requested: rental.delivery_requested ?? false,
        delivery_address: rental.delivery_address ?? null,
        delivery_lat: rental.delivery_lat ?? null,
        delivery_lng: rental.delivery_lng ?? null,
        delivery_time: rental.delivery_time ?? null,
        return_pickup_address: rental.return_pickup_address ?? null,
        return_pickup_lat: rental.return_pickup_lat ?? null,
        return_pickup_lng: rental.return_pickup_lng ?? null,
        return_time: rental.return_time ?? null,
        delivery_fee: rental.delivery_fee ?? 0,
        payment_status: rental.payment_status ?? 'unpaid',
        payment_transaction_id: rental.payment_transaction_id ?? null,
        payment_method_chosen: rental.payment_method_chosen ?? null,
        contact_preference: rental.contact_preference ?? null,
        expires_at: rental.expires_at ?? null,
        rental_subtotal: rental.rental_price ?? 0,
        add_ons_total: rental.add_ons_total ?? 0,
        add_ons: rental.add_ons ?? [],
        discount_amount: rental.discount_amount ?? 0,
        total_price: rental.total_price ?? 0,
        source: rental.source ?? 'booking_app',
        notes: rental.notes ?? null,
      })
      .select('id')
      .single()
    if (orderErr || !order) {
      console.error('[wrapCourseRentalInOrder] header insert failed:', orderErr)
      return null
    }

    const { error: linkErr } = await admin
      .from('club_rentals')
      .update({ order_id: order.id })
      .eq('id', rental.id)
    if (linkErr) {
      console.error('[wrapCourseRentalInOrder] link update failed:', linkErr)
      return null
    }

    return order.id
  } catch (e) {
    console.error('[wrapCourseRentalInOrder] error:', e)
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
