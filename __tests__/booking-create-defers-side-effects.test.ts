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

jest.mock('@/lib/b1g1-credit', () => ({
  ...jest.requireActual('@/lib/b1g1-credit'),
  isB1G1GrantEligible: jest.fn().mockResolvedValue({
    eligible: false,
    phoneNew: false,
    profileHasPriorBooking: false,
  }),
  grantB1G1NewCustomerCredit: jest.fn().mockResolvedValue({ created: false }),
}));

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
function makeSupabaseStub() {
  const insertedBooking = { data: BOOKING_ROW, error: null };

  const builder = (table: string) => {
    const result: Record<string, unknown> = { data: null, error: null };
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
    await expect(capturedAfterCallbacks[0]()).resolves.not.toThrow();

    // And the email still went, because the two settle independently now.
    expect(sendBookingConfirmationEmail).toHaveBeenCalledTimes(1);
  });
});
