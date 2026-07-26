/**
 * The B1G1 free-hour grant — the half of the promise that used to be missing.
 *
 * The things that can silently break this feature are covered here:
 *
 *  1. The printed expiry and the stored expiry drifting apart. The staff LINE
 *     note says "expires 1 Aug" and the row has to be good through the end of
 *     1 August in Bangkok — not UTC midnight, not "whenever the booking was
 *     created plus 168 hours".
 *  2. A retried booking-create double-granting. The database's partial unique
 *     index is what actually prevents that; what this file pins is that the
 *     client treats the resulting conflict as success, not as an error.
 *  3. Granting on the wrong predicate. `isB1G1GrantEligible` has to answer the
 *     same question the customer's quote asked, not the different one
 *     `findOrCreateCustomer` happens to answer. Both directions of the old
 *     divergence have a test.
 *
 * What is NOT verified here, and cannot be without a real Postgres:
 *
 *  * The partial unique index `credit_grants_one_b1g1_per_customer` itself.
 *    These tests stub the RPC, so "a conflict returns created:false" is pinned
 *    at the mock boundary only — the index existing, being partial on
 *    reason = 'b1g1_new_customer', and being inferrable by the ON CONFLICT
 *    clause is taken on faith here. Faking it would prove nothing.
 *  * That `is_phone_new_customer` actually honours `p_exclude_booking_id`, and
 *    the SQL semantics of the three EXISTS clauses. We assert the argument is
 *    passed; the function's behaviour is the migration's business.
 *  * The new raise-on-missing-conflict-row branch in
 *    20260726100000, which is plpgsql control flow.
 */
import {
  b1g1CreditExpiry,
  b1g1DisagreementLog,
  grantB1G1NewCustomerCredit,
  isB1G1GrantEligible,
  B1G1_GRANTED_BY,
  B1G1_REDEMPTION_DAYS,
  type B1G1Eligibility,
} from '@/lib/b1g1-credit';

type RpcFn = jest.Mock;

/** Minimal stand-in for the service-role Supabase client. */
function fakeClient(rpc: RpcFn) {
  return { rpc } as never;
}

type BookingsOutcome =
  | { data: { id: string }[] | null; error: { message: string } | null }
  | Error;

/**
 * Stand-in for the service-role client covering the two reads the eligibility
 * predicate makes: the `is_phone_new_customer` RPC and the profile-scoped
 * booking-history query. Records the filters so the tests can assert that THIS
 * booking is excluded from both — without that exclusion the checks see the
 * booking currently being made and nobody is ever eligible.
 */
function fakeEligibilityClient(opts: { phoneNew?: unknown; rpcError?: { message: string }; rpcThrows?: Error; bookings?: BookingsOutcome }) {
  const rpc: RpcFn = jest.fn(() => {
    if (opts.rpcThrows) return Promise.reject(opts.rpcThrows);
    return Promise.resolve({
      data: opts.rpcError ? null : (opts.phoneNew ?? null),
      error: opts.rpcError ?? null,
    });
  });

  const filters: Record<string, unknown> = {};
  const limit = jest.fn(() => {
    const outcome = opts.bookings ?? { data: [], error: null };
    if (outcome instanceof Error) return Promise.reject(outcome);
    return Promise.resolve(outcome);
  });
  interface QueryBuilder {
    select: jest.Mock<QueryBuilder>;
    eq: jest.Mock<QueryBuilder, [string, unknown]>;
    neq: jest.Mock<QueryBuilder, [string, unknown]>;
    limit: typeof limit;
  }
  const builder: QueryBuilder = {
    select: jest.fn(() => builder),
    eq: jest.fn((column: string, value: unknown) => {
      filters[column] = value;
      return builder;
    }),
    neq: jest.fn((column: string, value: unknown) => {
      filters[`neq:${column}`] = value;
      return builder;
    }),
    limit,
  };
  const from = jest.fn(() => builder);

  return { client: { rpc, from } as never, rpc, from, filters, limit };
}

const ELIGIBILITY_PARAMS = {
  phoneNumber: '0812345678',
  customerId: 'cust-1',
  userId: 'profile-1',
  bookingId: 'bk-42',
};

describe('b1g1CreditExpiry', () => {
  test('expires at the END of the seventh day in Bangkok, not at an arbitrary instant', () => {
    const expiry = b1g1CreditExpiry('2026-07-25');
    expect(expiry).not.toBeNull();
    // Bangkok is UTC+7 with no DST, so 23:59:59.999 +07 on 1 Aug is
    // 16:59:59.999Z on 1 Aug. A customer told "within 7 days" reads that as
    // "through the 1st"; an expiry at UTC midnight would kill it at 07:00
    // local on its last day.
    expect(expiry!.expiresAt.toISOString()).toBe('2026-08-01T16:59:59.999Z');
  });

  test('the printed label and the stored date are the same calendar day', () => {
    const expiry = b1g1CreditExpiry('2026-07-25')!;
    expect(expiry.label).toBe('1 Aug');
    expect(expiry.calendarDate).toBe('2026-08-01');
    // The stored instant must fall on the day the note printed. Reading it back
    // in Bangkok is the check that matters — that is where the customer is.
    expect(
      expiry.expiresAt.toLocaleDateString('en-GB', {
        day: 'numeric',
        month: 'short',
        timeZone: 'Asia/Bangkok',
      }),
    ).toBe(expiry.label);
  });

  test('rolls over month and year boundaries', () => {
    expect(b1g1CreditExpiry('2026-12-28')!.calendarDate).toBe('2027-01-04');
    expect(b1g1CreditExpiry('2026-12-28')!.label).toBe('4 Jan');
    // Leap year: 22 Feb 2028 + 7 lands on the 29th, which exists in 2028.
    expect(b1g1CreditExpiry('2028-02-22')!.calendarDate).toBe('2028-02-29');
  });

  test('is exactly the advertised number of days out', () => {
    const expiry = b1g1CreditExpiry('2026-07-25')!;
    const booking = new Date(Date.UTC(2026, 6, 25));
    const days = Math.floor((expiry.expiresAt.getTime() - booking.getTime()) / 86_400_000);
    expect(days).toBe(B1G1_REDEMPTION_DAYS);
  });

  test('reads a calendar date out of anything Postgres would have accepted', () => {
    // The route validates `date` for presence, not shape, and the booking row
    // is already written by the time the grant runs. A tolerant read here is
    // what stops an unpadded or timestamped date from silently dropping the
    // credit and printing "expires " in the staff note.
    expect(b1g1CreditExpiry('2026-7-5')!.calendarDate).toBe('2026-07-12');
    expect(b1g1CreditExpiry('2026-07-25T10:00:00Z')!.calendarDate).toBe('2026-08-01');
  });

  test('returns null when there is no calendar date to read at all', () => {
    expect(b1g1CreditExpiry('')).toBeNull();
    expect(b1g1CreditExpiry('25/07/2026')).toBeNull();
    expect(b1g1CreditExpiry('next Tuesday')).toBeNull();
  });
});

describe('grantB1G1NewCustomerCredit', () => {
  const params = {
    customerId: 'cust-1',
    freeHours: 1,
    expiresAt: new Date('2026-08-01T16:59:59.999Z'),
    bookingId: 'bk-42',
  };

  test('writes the grant with the booking id in the note and a system granted_by', async () => {
    const rpc: RpcFn = jest.fn().mockResolvedValue({
      data: [{ grant_id: 'g-1', created: true }],
      error: null,
    });

    const result = await grantB1G1NewCustomerCredit(fakeClient(rpc), params);

    expect(result).toEqual({ ok: true, grantId: 'g-1', created: true });
    expect(rpc).toHaveBeenCalledWith('grant_b1g1_new_customer_credit', {
      p_customer_id: 'cust-1',
      p_quantity: 1,
      p_expires_at: '2026-08-01T16:59:59.999Z',
      // Traceable back to what earned it.
      p_note: 'B1G1 free hour earned by booking bk-42',
      // A stable system identifier, never a person — the column otherwise
      // holds staff email addresses.
      p_granted_by: B1G1_GRANTED_BY,
    });
  });

  test('a customer who already holds their one grant is a success, not an error', async () => {
    // What a booking-create retry looks like: the partial unique index catches
    // it, the RPC returns the existing grant with created=false. Treating this
    // as a failure would spam the error log on every retry AND tempt a caller
    // into building a second idempotency mechanism.
    const rpc: RpcFn = jest.fn().mockResolvedValue({
      data: [{ grant_id: 'g-1', created: false }],
      error: null,
    });

    await expect(grantB1G1NewCustomerCredit(fakeClient(rpc), params)).resolves.toEqual({
      ok: true,
      grantId: 'g-1',
      created: false,
    });
  });

  test('reports an RPC error instead of throwing, so a booking can never fail on it', async () => {
    const rpc: RpcFn = jest.fn().mockResolvedValue({
      data: null,
      error: { message: 'permission denied for function' },
    });

    await expect(grantB1G1NewCustomerCredit(fakeClient(rpc), params)).resolves.toEqual({
      ok: false,
      error: 'permission denied for function',
    });
  });

  test('a thrown transport error is caught, not propagated', async () => {
    const rpc: RpcFn = jest.fn().mockRejectedValue(new Error('fetch failed'));

    await expect(grantB1G1NewCustomerCredit(fakeClient(rpc), params)).resolves.toEqual({
      ok: false,
      error: 'fetch failed',
    });
  });

  test('refuses to call the database without a customer id or with no hours', async () => {
    const rpc: RpcFn = jest.fn();

    await expect(
      grantB1G1NewCustomerCredit(fakeClient(rpc), { ...params, customerId: '' }),
    ).resolves.toEqual({ ok: false, error: 'no customer_id' });
    await expect(
      grantB1G1NewCustomerCredit(fakeClient(rpc), { ...params, freeHours: 0 }),
    ).resolves.toEqual({ ok: false, error: 'non-positive free_hours: 0' });

    expect(rpc).not.toHaveBeenCalled();
  });
});

/**
 * The gate that decides whether a booking may MINT entitlement.
 *
 * `is_new_customer` from `findOrCreateCustomer` used to be the gate, and it
 * answers a different question — "did I have to create a customers row for this
 * normalized phone?" — which diverges from the customer's quote in both
 * directions. Each direction has a test below, named for what it costs.
 */
describe('isB1G1GrantEligible', () => {
  test('a returning customer who types an unseen phone gets NO grant', () => {
    // Direction A, the expensive one. `findOrCreateCustomer` creates a fresh
    // customers row for the unseen phone, so `is_new_customer` is true and the
    // old gate minted a SECOND grant under a NEW customer id — which the partial
    // unique index on (customer_id, reason) cannot catch, because it is keyed
    // per customer. Repeatable once per fabricated phone number.
    //
    // Note the RPC still answers TRUE here: the new phone has no bookings, no
    // POS history, and the freshly created customer id has no bookings either.
    // Only the PROFILE remembers. That is why the customer id alone cannot close
    // this direction, and why the profile check is not redundant.
    const fake = fakeEligibilityClient({
      phoneNew: true,
      bookings: { data: [{ id: 'bk-earlier' }], error: null },
    });

    return isB1G1GrantEligible(fake.client, ELIGIBILITY_PARAMS).then((result) => {
      expect(result).toEqual({
        eligible: false,
        phoneNew: true,
        profileHasPriorBooking: true,
      });
    });
  });

  test('a first-time booker whose customers row already existed DOES get a grant', async () => {
    // Direction B. A course rental, a staff-created record in lengolf-forms or
    // an earlier failed booking attempt all leave a customers row behind, so
    // `is_new_customer` is false and the whole promo block was skipped — while
    // the quote had already promised the free hour. The predicate here reads the
    // same signals the quote does, so it says yes.
    const fake = fakeEligibilityClient({ phoneNew: true, bookings: { data: [], error: null } });

    await expect(isB1G1GrantEligible(fake.client, ELIGIBILITY_PARAMS)).resolves.toEqual({
      eligible: true,
      phoneNew: true,
      profileHasPriorBooking: false,
    });
  });

  test('excludes THIS booking from both checks', async () => {
    // The booking row is already inserted, with status 'confirmed', by the time
    // the grant runs. Without the exclusion both checks see it and answer
    // "returning" for every customer alive — the feature would silently grant
    // nothing, forever, and look healthy doing it.
    const fake = fakeEligibilityClient({ phoneNew: true });

    await isB1G1GrantEligible(fake.client, ELIGIBILITY_PARAMS);

    expect(fake.rpc).toHaveBeenCalledWith('is_phone_new_customer', {
      p_phone: '0812345678',
      p_customer_id: 'cust-1',
      p_exclude_booking_id: 'bk-42',
    });
    expect(fake.from).toHaveBeenCalledWith('bookings');
    // Profile-scoped, confirmed only, this booking excluded.
    expect(fake.filters).toEqual({
      user_id: 'profile-1',
      status: 'confirmed',
      'neq:id': 'bk-42',
    });
  });

  test('a NULL predicate denies the grant and never reaches the profile check', async () => {
    // NULL means "no usable signal" — an unusable phone with no customer id, or
    // a phone that normalizes away. It is not a yes. `/api/user/has-bookings`
    // reads the same NULL as "treat as new" and that is right for a HINT, which
    // costs nothing if wrong. This function mints financial entitlement staff
    // honour in lengolf-forms, so it takes the opposite default.
    const fake = fakeEligibilityClient({ phoneNew: null });

    await expect(isB1G1GrantEligible(fake.client, ELIGIBILITY_PARAMS)).resolves.toEqual({
      eligible: false,
      phoneNew: null,
      profileHasPriorBooking: null,
    });
    expect(fake.from).not.toHaveBeenCalled();
  });

  test('a known-returning phone denies without reading the profile', async () => {
    const fake = fakeEligibilityClient({ phoneNew: false });

    await expect(isB1G1GrantEligible(fake.client, ELIGIBILITY_PARAMS)).resolves.toEqual({
      eligible: false,
      phoneNew: false,
      profileHasPriorBooking: null,
    });
    expect(fake.from).not.toHaveBeenCalled();
  });

  test('a failed check denies rather than guessing, and says which one failed', async () => {
    const rpcFailed = fakeEligibilityClient({ rpcError: { message: 'permission denied' } });
    await expect(isB1G1GrantEligible(rpcFailed.client, ELIGIBILITY_PARAMS)).resolves.toEqual({
      eligible: false,
      phoneNew: null,
      profileHasPriorBooking: null,
      error: 'is_phone_new_customer: permission denied',
    });

    const historyFailed = fakeEligibilityClient({
      phoneNew: true,
      bookings: { data: null, error: { message: 'statement timeout' } },
    });
    await expect(isB1G1GrantEligible(historyFailed.client, ELIGIBILITY_PARAMS)).resolves.toEqual({
      eligible: false,
      phoneNew: true,
      profileHasPriorBooking: null,
      error: 'profile booking history: statement timeout',
    });
  });

  test('never throws, so a booking can never fail on it', async () => {
    const rpcThrew = fakeEligibilityClient({ rpcThrows: new Error('fetch failed') });
    await expect(isB1G1GrantEligible(rpcThrew.client, ELIGIBILITY_PARAMS)).resolves.toMatchObject({
      eligible: false,
      error: 'is_phone_new_customer: fetch failed',
    });

    const historyThrew = fakeEligibilityClient({ phoneNew: true, bookings: new Error('socket hang up') });
    await expect(isB1G1GrantEligible(historyThrew.client, ELIGIBILITY_PARAMS)).resolves.toMatchObject({
      eligible: false,
      phoneNew: true,
      error: 'profile booking history: socket hang up',
    });
  });

  test('refuses to decide without a customer id or a profile id', async () => {
    const fake = fakeEligibilityClient({ phoneNew: true });

    await expect(
      isB1G1GrantEligible(fake.client, { ...ELIGIBILITY_PARAMS, customerId: null }),
    ).resolves.toEqual({
      eligible: false,
      phoneNew: null,
      profileHasPriorBooking: null,
      error: 'no customer_id',
    });
    await expect(
      isB1G1GrantEligible(fake.client, { ...ELIGIBILITY_PARAMS, userId: '' }),
    ).resolves.toEqual({
      eligible: false,
      phoneNew: null,
      profileHasPriorBooking: null,
      error: 'no user_id',
    });

    expect(fake.rpc).not.toHaveBeenCalled();
    expect(fake.from).not.toHaveBeenCalled();
  });
});

describe('b1g1DisagreementLog', () => {
  const agreeing: B1G1Eligibility = {
    eligible: true,
    phoneNew: true,
    profileHasPriorBooking: false,
  };

  test('says nothing when the two predicates agree', () => {
    expect(
      b1g1DisagreementLog({
        eligibility: agreeing,
        isNewCustomer: true,
        customerId: 'cust-1',
        userId: 'profile-1',
        bookingId: 'bk-42',
      }),
    ).toBeNull();
  });

  test('fires when the quote promised an hour the customer record would have skipped', () => {
    // Direction B. This is the ONLY signal that case produces: the promo block
    // is gated on isNewCustomer, so nothing else runs, no staff note is written
    // and nobody finds out until a customer asks for their free hour.
    const message = b1g1DisagreementLog({
      eligibility: agreeing,
      isNewCustomer: false,
      customerId: 'cust-1',
      userId: 'profile-1',
      bookingId: 'bk-42',
    });

    expect(message).not.toBeNull();
    // Every field needed to reconstruct the grant by hand.
    expect(message).toContain('grantEligible=true');
    expect(message).toContain('isNewCustomer=false');
    expect(message).toContain('customerId=cust-1');
    expect(message).toContain('userId=profile-1');
    expect(message).toContain('bookingId=bk-42');
  });

  test('fires when the customer record would have minted an hour nobody was promised', () => {
    // Direction A: the returning customer on a fresh phone.
    const message = b1g1DisagreementLog({
      eligibility: { eligible: false, phoneNew: true, profileHasPriorBooking: true },
      isNewCustomer: true,
      customerId: 'cust-new',
      userId: 'profile-1',
      bookingId: 'bk-42',
    });

    expect(message).toContain('grantEligible=false');
    expect(message).toContain('isNewCustomer=true');
    expect(message).toContain('profileHasPriorBooking=true');
  });

  test('carries the reason a check could not be completed', () => {
    const message = b1g1DisagreementLog({
      eligibility: {
        eligible: false,
        phoneNew: null,
        profileHasPriorBooking: null,
        error: 'is_phone_new_customer: permission denied',
      },
      isNewCustomer: true,
      customerId: 'cust-1',
      userId: 'profile-1',
      bookingId: 'bk-42',
    });

    expect(message).toContain('error=is_phone_new_customer: permission denied');
  });
});
