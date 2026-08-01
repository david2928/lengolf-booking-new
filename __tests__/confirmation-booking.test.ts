import {
  CONFIRMATION_BOOKING_COLUMNS,
  CONFIRMATION_BOOKING_SELECT,
  canViewBooking,
} from '@/app/[locale]/(features)/bookings/components/booking/confirmationBooking';

/**
 * The confirmation page reads with the service-role key, so `canViewBooking` is
 * the entire access-control decision for a page that renders a customer's name,
 * phone number and email.
 *
 * Booking ids are `BK` + YYMMDD + 4 base36 characters, so with a known date the
 * secret is ~1.68M wide. They are enumerable, not capability tokens, which is
 * what makes this predicate load-bearing rather than belt-and-braces.
 */
describe('canViewBooking', () => {
  const SESSION = 'profile-session';
  const OTHER_PROFILE = 'profile-other';
  const CUSTOMER = 'customer-1';
  const OTHER_CUSTOMER = 'customer-2';

  it('allows the profile that created the booking', () => {
    expect(
      canViewBooking({
        sessionUserId: SESSION,
        profileCustomerId: null,
        bookingUserId: SESSION,
        bookingCustomerId: null,
      })
    ).toBe(true);
  });

  // The regression that a naive `user_id === session.user.id` check breaks.
  // Book as a guest, come back signed in with Google using the same phone, and
  // findOrCreateCustomer links both profiles to one customer. The customer is
  // looking at their own booking under a different profile id.
  it('allows a different profile of the same customer', () => {
    expect(
      canViewBooking({
        sessionUserId: SESSION,
        profileCustomerId: CUSTOMER,
        bookingUserId: OTHER_PROFILE,
        bookingCustomerId: CUSTOMER,
      })
    ).toBe(true);
  });

  it('refuses an unrelated customer', () => {
    expect(
      canViewBooking({
        sessionUserId: SESSION,
        profileCustomerId: CUSTOMER,
        bookingUserId: OTHER_PROFILE,
        bookingCustomerId: OTHER_CUSTOMER,
      })
    ).toBe(false);
  });

  // The most likely implementation slip. customer_id is nullable on BOTH
  // profiles and bookings, so an equality check without non-null guards hands
  // every unlinked guest every unlinked booking — a wider hole than the one
  // being closed.
  it('refuses when both customer ids are null', () => {
    expect(
      canViewBooking({
        sessionUserId: SESSION,
        profileCustomerId: null,
        bookingUserId: OTHER_PROFILE,
        bookingCustomerId: null,
      })
    ).toBe(false);
  });

  it('refuses when both customer ids are undefined', () => {
    expect(
      canViewBooking({
        sessionUserId: SESSION,
        profileCustomerId: undefined,
        bookingUserId: OTHER_PROFILE,
        bookingCustomerId: undefined,
      })
    ).toBe(false);
  });

  it.each([
    ['profile linked, booking not', CUSTOMER, null],
    ['booking linked, profile not', null, CUSTOMER],
  ])('refuses when only one side is linked (%s)', (_label, profileCustomerId, bookingCustomerId) => {
    expect(
      canViewBooking({
        sessionUserId: SESSION,
        profileCustomerId,
        bookingUserId: OTHER_PROFILE,
        bookingCustomerId,
      })
    ).toBe(false);
  });

  it('refuses an empty session id even when the booking is equally empty', () => {
    expect(
      canViewBooking({
        sessionUserId: '',
        profileCustomerId: null,
        bookingUserId: '',
        bookingCustomerId: null,
      })
    ).toBe(false);
  });
});

describe('CONFIRMATION_BOOKING_SELECT', () => {
  // The select must be a string literal for supabase-js to infer the row shape,
  // so it cannot be derived from the array at runtime. This is the guard that
  // stops the two drifting apart.
  it('matches the column list exactly', () => {
    expect(CONFIRMATION_BOOKING_SELECT).toBe(CONFIRMATION_BOOKING_COLUMNS.join(', '));
  });

  // These carry staff identifiers, internal keys and ad attribution. The
  // component is a client component, so anything selected is serialized into
  // the page payload whether or not it is rendered.
  it.each([
    'updated_by_identifier',
    'cancelled_by_identifier',
    'phone_confirmed_by',
    'calendar_events',
    'stable_hash_id',
    'reservation_key',
    'gclid',
    'gbraid',
    'wbraid',
    'utm_source',
  ])('does not publish %s to the browser', (column) => {
    expect(CONFIRMATION_BOOKING_COLUMNS).not.toContain(column);
  });

  it('still carries what the ownership check needs', () => {
    expect(CONFIRMATION_BOOKING_COLUMNS).toContain('user_id');
    expect(CONFIRMATION_BOOKING_COLUMNS).toContain('customer_id');
  });
});
