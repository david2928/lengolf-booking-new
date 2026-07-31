/**
 * @jest-environment node
 *
 * The booking-create response must not wait on its side effects.
 *
 * Confirmation used to take ~13s at p50 for a first-time customer because the
 * route awaited the confirmation email, the staff LINE message and the
 * review-request scheduling before answering — work that either the customer
 * never sees or that does not fire until 30 minutes after their session ends.
 *
 * The fix is `after()` from `next/server`, NOT a floating `void promise()`:
 * a bare promise gets its sockets torn down the moment the response is sent on
 * Vercel, which is exactly what CLAUDE.md forbids.
 *
 * These tests pin both halves of that:
 *   1. the response resolves while the side effects are still un-run, and
 *   2. the side effects DO run when the deferred callback is invoked.
 *
 * Without (2) this suite would pass just as happily against code that dropped
 * the notifications entirely.
 */

const capturedAfterCallbacks: Array<() => Promise<void> | void> = [];

jest.mock('next/server', () => {
  const actual = jest.requireActual('next/server');
  return {
    ...actual,
    after: jest.fn((cb: () => Promise<void> | void) => {
      capturedAfterCallbacks.push(cb);
    }),
  };
});

const sendBookingConfirmationEmail = jest.fn().mockResolvedValue(undefined);
jest.mock('@/lib/notifications/bookingEmail', () => ({
  sendBookingConfirmationEmail: (...args: unknown[]) => sendBookingConfirmationEmail(...args),
}));

const pushToStaffGroup = jest.fn().mockResolvedValue(undefined);
jest.mock('@/lib/notifications/staffLine', () => ({
  ...jest.requireActual('@/lib/notifications/staffLine'),
  pushToStaffGroup: (...args: unknown[]) => pushToStaffGroup(...args),
}));

const scheduleReviewRequest = jest.fn().mockResolvedValue(true);
jest.mock('@/lib/reviewRequestScheduler', () => ({
  scheduleReviewRequest: (...args: unknown[]) => scheduleReviewRequest(...args),
}));

jest.mock('next-auth/jwt', () => ({
  getToken: jest.fn().mockResolvedValue({ sub: 'profile-uuid-1' }),
}));

jest.mock('@/utils/customer-service', () => ({
  findOrCreateCustomer: jest.fn().mockResolvedValue({
    customer: {
      id: 'customer-uuid-1',
      customer_code: 'CUS-00001',
      customer_name: 'Somchai Prasert',
      email: 'somchai@example.com',
    },
    is_new_customer: true,
    match_method: 'new_customer_created',
    confidence: 1,
  }),
  getPackageInfoForCustomer: jest.fn().mockResolvedValue({
    packageInfo: 'Normal Bay Rate',
    packageId: undefined,
    packageTypeName: undefined,
  }),
}));

const isB1G1GrantEligible = jest.fn().mockResolvedValue({
  eligible: false,
  phoneNew: false,
  profileHasPriorBooking: false,
});
const grantB1G1NewCustomerCredit = jest.fn().mockResolvedValue({ created: true, grantId: 'grant-1' });
jest.mock('@/lib/b1g1-credit', () => ({
  ...jest.requireActual('@/lib/b1g1-credit'),
  isB1G1GrantEligible: (...args: unknown[]) => isB1G1GrantEligible(...args),
  grantB1G1NewCustomerCredit: (...args: unknown[]) => grantB1G1NewCustomerCredit(...args),
}));

/**
 * An active auto-apply new-customer B1G1. `grants_credit` is what gates the
 * credit branch, and a 1-hour booking makes the offer advice-only — it promises
 * a free hour to redeem later rather than discounting this booking, which is
 * the case that actually mints a grant.
 */
const B1G1_PROMO_ROW = {
  id: '11111111-1111-4111-8111-111111111111',
  promotion_type: 'bogo',
  discount_value: null,
  free_hours: 1,
  applies_to: 'bay_rate',
  conditions: {},
  title_en: 'First-timer: buy 1 hour get 1 free',
  title_th: 'ลูกค้าใหม่: ซื้อ 1 ชม. ฟรี 1 ชม.',
  pos_discount_id: null,
  grants_credit: true,
};

const BOOKING_ROW = {
  id: 'BK260731TEST',
  user_id: 'profile-uuid-1',
  name: 'Somchai Prasert',
  email: 'somchai@example.com',
  phone_number: '0812345678',
  date: '2026-08-03',
  start_time: '14:00',
  duration: 1,
  number_of_people: 2,
  bay: 'Bay 2',
  status: 'confirmed',
  language: 'en',
  booking_type: 'Normal Bay Rate',
  package_name: null,
  is_new_customer: true,
  rental_club_set_id: null,
};

/**
 * Minimal PostgREST-shaped stub. Only the calls this route actually makes need
 * to resolve; everything else returns an empty result so the route's own
 * defensive branches take over.
 */
/**
 * Rows a test wants a given table to return from an awaited query builder.
 * Empty by default so the route takes its own "nothing found" branches.
 */
const tableRows: Record<string, unknown> = {};

function makeSupabaseStub() {
  const insertedBooking = { data: BOOKING_ROW, error: null };

  const builder = (table: string) => {
    const result: Record<string, unknown> = { data: tableRows[table] ?? null, error: null };
    const chain: Record<string, unknown> = {};
    const self = () => chain;

    for (const method of ['select', 'eq', 'not', 'update', 'limit', 'order']) {
      chain[method] = jest.fn(self);
    }
    chain.insert = jest.fn(() => ({
      select: jest.fn(() => ({ single: jest.fn().mockResolvedValue(insertedBooking) })),
    }));
    chain.single = jest.fn().mockResolvedValue(
      table === 'profiles'
        ? { data: { display_name: 'Somchai', phone_number: null, email: 'somchai@example.com' }, error: null }
        : result
    );
    chain.maybeSingle = jest.fn().mockResolvedValue({ data: null, error: null });
    // `await supabase.from(x).update(...).eq(...)` resolves the builder itself.
    chain.then = (resolve: (v: unknown) => unknown) => Promise.resolve(result).then(resolve);
    return chain;
  };

  return {
    from: jest.fn(builder),
    rpc: jest.fn((fn: string) => {
      if (fn === 'check_all_bays_availability') {
        return Promise.resolve({
          data: { 'Bay 1': false, 'Bay 2': true, 'Bay 3': false, 'Bay 4': false },
          error: null,
        });
      }
      return Promise.resolve({ data: null, error: null });
    }),
  };
}

const supabaseStub = makeSupabaseStub();
jest.mock('@/utils/supabase/admin', () => ({
  createAdminClient: () => supabaseStub,
}));

import { NextRequest } from 'next/server';

const REQUEST_BODY = {
  name: 'Somchai Prasert',
  email: 'somchai@example.com',
  phone_number: '0812345678',
  date: '2026-08-03',
  start_time: '14:00',
  duration: '1',
  number_of_people: '2',
  language: 'en',
};

function buildRequest() {
  return new NextRequest('http://localhost:3000/api/bookings/create', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(REQUEST_BODY),
  });
}

describe('POST /api/bookings/create defers its side effects', () => {
  let POST: (req: NextRequest) => Promise<Response>;

  beforeAll(async () => {
    ({ POST } = await import('@/app/api/bookings/create/route'));
  });

  beforeEach(() => {
    capturedAfterCallbacks.length = 0;
    sendBookingConfirmationEmail.mockClear();
    pushToStaffGroup.mockClear();
    scheduleReviewRequest.mockClear();
    grantB1G1NewCustomerCredit.mockClear();
    isB1G1GrantEligible.mockClear();
    for (const key of Object.keys(tableRows)) delete tableRows[key];
  });

  it('answers the customer before sending anything', async () => {
    const response = await POST(buildRequest());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.bookingId).toBe('BK260731TEST');

    // The whole point: none of this has happened yet.
    expect(sendBookingConfirmationEmail).not.toHaveBeenCalled();
    expect(pushToStaffGroup).not.toHaveBeenCalled();
    expect(scheduleReviewRequest).not.toHaveBeenCalled();

    // ...but it has been handed to `after()` rather than dropped.
    expect(capturedAfterCallbacks).toHaveLength(1);
  });

  it('still sends everything once the deferred callback runs', async () => {
    await POST(buildRequest());
    expect(capturedAfterCallbacks).toHaveLength(1);

    await capturedAfterCallbacks[0]();

    expect(sendBookingConfirmationEmail).toHaveBeenCalledTimes(1);
    expect(pushToStaffGroup).toHaveBeenCalledTimes(1);
    expect(pushToStaffGroup).toHaveBeenCalledWith(expect.stringContaining('Booking Notification'));

    // New customer on the website flow, so the review request is scheduled —
    // and it carries the booking's own fields so the scheduler doesn't have to
    // read back the row we just wrote.
    expect(scheduleReviewRequest).toHaveBeenCalledTimes(1);
    expect(scheduleReviewRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        bookingId: 'BK260731TEST',
        booking: { date: '2026-08-03', start_time: '14:00', duration: 1 },
      })
    );
  });

  /**
   * The free-hour credit is a financial promise, and it is the most
   * consequential thing this change deferred. Pin that it really is deferred —
   * and that deferring it did not quietly stop it happening.
   */
  it('defers the B1G1 free-hour credit without dropping it', async () => {
    tableRows.promotions = [B1G1_PROMO_ROW];
    isB1G1GrantEligible.mockResolvedValueOnce({
      eligible: true,
      phoneNew: true,
      profileHasPriorBooking: false,
    });

    await POST(buildRequest());

    // Not on the customer's clock...
    expect(isB1G1GrantEligible).not.toHaveBeenCalled();
    expect(grantB1G1NewCustomerCredit).not.toHaveBeenCalled();

    await capturedAfterCallbacks[0]();

    // ...but recorded all the same.
    expect(grantB1G1NewCustomerCredit).toHaveBeenCalledTimes(1);
    expect(grantB1G1NewCustomerCredit).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ customerId: 'customer-uuid-1', bookingId: 'BK260731TEST' })
    );

    // And staff are told about the hour the customer was promised.
    expect(pushToStaffGroup).toHaveBeenCalledWith(expect.stringContaining('free hr to redeem within 7 days'));
  });

  /**
   * The inverse: an ineligible customer must not mint a grant even though the
   * same promo row is active. Without this the test above would pass against
   * code that granted unconditionally.
   */
  it('does not grant a credit to an ineligible customer', async () => {
    tableRows.promotions = [B1G1_PROMO_ROW];
    isB1G1GrantEligible.mockResolvedValueOnce({
      eligible: false,
      phoneNew: false,
      profileHasPriorBooking: true,
    });

    await POST(buildRequest());
    await capturedAfterCallbacks[0]();

    expect(grantB1G1NewCustomerCredit).not.toHaveBeenCalled();
  });

  it('does not report a notification outcome it cannot know', async () => {
    const response = await POST(buildRequest());
    const body = await response.json();

    // `notificationsSuccess` was a promise the route can no longer keep: the
    // sends happen after this response. The client toast that read it is gone.
    expect(body).not.toHaveProperty('notificationsSuccess');
  });

  it('survives a notification failure without disturbing the booking', async () => {
    pushToStaffGroup.mockRejectedValueOnce(new Error('LINE is down'));

    const response = await POST(buildRequest());
    expect(response.status).toBe(200);

    // The deferred chain must absorb it — an unhandled rejection here would
    // surface as a failed invocation well after the customer had left.
    // `.resolves.toBeUndefined()`, not `.resolves.not.toThrow()`: the latter
    // passes trivially against any resolved non-function value, so it would
    // assert nothing.
    await expect(capturedAfterCallbacks[0]()).resolves.toBeUndefined();

    // And the email still went, because the two settle independently now.
    expect(sendBookingConfirmationEmail).toHaveBeenCalledTimes(1);
  });
});
