import type { Booking } from '@/types';

/**
 * The `bookings` columns the confirmation screen is allowed to receive.
 *
 * `ConfirmationContent` is a client component, so whatever the server selects
 * is serialized into the RSC flight payload and is readable in the page source
 * — not just the fields that happen to get rendered. `select('*')` therefore
 * shipped the whole row to the browser, including staff identifiers
 * (`updated_by_identifier`, `cancelled_by_identifier`, `phone_confirmed_by`),
 * internal keys (`stable_hash_id`, `reservation_key`, `calendar_events`) and
 * the ad-attribution fields (`gclid`, `gbraid`, `wbraid`, `utm_*`).
 *
 * Keep this list and `ConfirmationBooking` in step. Adding a column here is a
 * deliberate act: it publishes that column to the customer's browser.
 *
 * `user_id` and `customer_id` are present for the ownership check in
 * `confirmation/page.tsx`, not for display.
 */
export const CONFIRMATION_BOOKING_COLUMNS = [
  'id',
  'user_id',
  'customer_id',
  'name',
  'email',
  'phone_number',
  'date',
  'start_time',
  'duration',
  'number_of_people',
  'bay',
  'status',
  'booking_type',
  'package_name',
  'customer_notes',
  'add_ons',
  'is_new_customer',
] as const;

/** The narrowed shape the confirmation screen actually works with. */
export type ConfirmationBooking = Pick<
  Booking,
  (typeof CONFIRMATION_BOOKING_COLUMNS)[number]
>;

/**
 * The same list as a PostgREST select.
 *
 * This has to be a string LITERAL, not `CONFIRMATION_BOOKING_COLUMNS.join()`.
 * supabase-js parses the select at the type level to infer the row shape, and a
 * value merely typed `string` gives it nothing to parse — the result degrades
 * to an opaque type and every field access downstream fails to compile.
 *
 * `__tests__/confirmation-booking-columns.test.ts` asserts this stays in step
 * with the array above, so the duplication cannot silently drift.
 */
export const CONFIRMATION_BOOKING_SELECT =
  'id, user_id, customer_id, name, email, phone_number, date, start_time, duration, number_of_people, bay, status, booking_type, package_name, customer_notes, add_ons, is_new_customer';

/**
 * May this session see this booking?
 *
 * The confirmation page reads with the service-role key, so RLS is not in play
 * and this predicate is the whole access-control decision.
 *
 * Why not simply `booking.user_id === sessionUserId`: one human accumulates
 * several profile rows — guest, google, line — and `findOrCreateCustomer`
 * (utils/customer-service.ts) links them all to ONE `customers` row by phone.
 * Many-profiles-to-one-customer is the normal, intended state. A profile-id
 * check alone would therefore lock a customer out of a booking they made under
 * a different provider, which is an ordinary thing to do.
 *
 * Both customer ids must be non-null. `customer_id` is nullable on both tables,
 * and `null === null` would hand every unlinked guest every unlinked booking —
 * a worse hole than the one this closes.
 */
export function canViewBooking(args: {
  sessionUserId: string;
  profileCustomerId: string | null | undefined;
  bookingUserId: string | null | undefined;
  bookingCustomerId: string | null | undefined;
}): boolean {
  const { sessionUserId, profileCustomerId, bookingUserId, bookingCustomerId } = args;

  // A session without an id is not a session; refuse before comparing anything.
  if (!sessionUserId) return false;

  const sameCustomer =
    !!profileCustomerId && !!bookingCustomerId && profileCustomerId === bookingCustomerId;

  // Covers the window between booking creation and the customer link being
  // written, and legacy rows that never got one.
  const sameProfile = !!bookingUserId && bookingUserId === sessionUserId;

  return sameCustomer || sameProfile;
}
