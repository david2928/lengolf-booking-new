import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Shape returned to the client for the payment summary card on
 * /payment/start and the receipt on /payment/result. Everything here is
 * already visible to the customer (they entered/chose it) — there's no
 * customer-identifying data beyond the rental_code, which is the
 * implicit capability for accessing this endpoint.
 */
export interface RentalOrderSummary {
  rental_code: string;
  club_set_name: string | null;
  start_date: string;
  end_date: string;
  duration_days: number;
  delivery_requested: boolean;
  delivery_address: string | null;
  rental_price: number;
  delivery_fee: number;
  total_price: number;
  currency: 'THB';
}

/**
 * Loads the order summary for a course rental by code.
 * Returns null if the rental doesn't exist or isn't a course rental.
 */
export async function loadRentalOrderSummary(
  supabase: SupabaseClient,
  rentalCode: string
): Promise<RentalOrderSummary | null> {
  // Use select('*') to keep supabase-js's type inference — multi-column
  // concatenated select strings are typed as GenericStringError.
  const { data: rental, error } = await supabase
    .from('club_rentals')
    .select('*')
    .eq('rental_code', rentalCode)
    .single();

  if (error || !rental || rental.rental_type !== 'course') {
    return null;
  }

  // Order-level: when the line belongs to an order, the receipt reflects the
  // ORDER (joined set names + header rollup totals), not just this bearer line.
  if (rental.order_id) {
    const { data: order } = await supabase
      .from('club_rental_orders')
      .select('rental_subtotal, delivery_fee, total_price, delivery_requested, delivery_address')
      .eq('id', rental.order_id)
      .maybeSingle();
    const { data: lineRows } = await supabase
      .from('club_rentals')
      .select('rental_club_sets ( name )')
      .eq('order_id', rental.order_id);
    if (order && lineRows && lineRows.length > 0) {
      const names = lineRows
        .map((r) => (r.rental_club_sets as { name?: string } | null)?.name)
        .filter(Boolean)
        .join(', ');
      return {
        rental_code: rental.rental_code,
        club_set_name: names || null,
        start_date: rental.start_date,
        end_date: rental.end_date,
        duration_days: rental.duration_days || 1,
        delivery_requested: !!order.delivery_requested,
        delivery_address: order.delivery_address ?? null,
        rental_price: Number(order.rental_subtotal),
        delivery_fee: Number(order.delivery_fee || 0),
        total_price: Number(order.total_price),
        currency: 'THB',
      };
    }
    // Order load failed — fall through to the single-line summary.
  }

  let clubSetName: string | null = null;
  if (rental.rental_club_set_id) {
    const { data: clubSet } = await supabase
      .from('rental_club_sets')
      .select('name')
      .eq('id', rental.rental_club_set_id)
      .single();
    clubSetName = clubSet?.name ?? null;
  }

  return {
    rental_code: rental.rental_code,
    club_set_name: clubSetName,
    start_date: rental.start_date,
    end_date: rental.end_date,
    duration_days: rental.duration_days || 1,
    delivery_requested: !!rental.delivery_requested,
    delivery_address: rental.delivery_address ?? null,
    rental_price: Number(rental.rental_price),
    delivery_fee: Number(rental.delivery_fee || 0),
    total_price: Number(rental.total_price),
    currency: 'THB',
  };
}
