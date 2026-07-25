/**
 * The B1G1 free-hour grant — the half of the promise that used to be missing.
 *
 * The two things that can silently break this feature are covered here:
 *
 *  1. The printed expiry and the stored expiry drifting apart. The staff LINE
 *     note says "expires 1 Aug" and the row has to be good through the end of
 *     1 August in Bangkok — not UTC midnight, not "whenever the booking was
 *     created plus 168 hours".
 *  2. A retried booking-create double-granting. The database's partial unique
 *     index is what actually prevents that; what this file pins is that the
 *     client treats the resulting conflict as success, not as an error.
 */
import {
  b1g1CreditExpiry,
  grantB1G1NewCustomerCredit,
  B1G1_GRANTED_BY,
  B1G1_REDEMPTION_DAYS,
} from '@/lib/b1g1-credit';

type RpcFn = jest.Mock;

/** Minimal stand-in for the service-role Supabase client. */
function fakeClient(rpc: RpcFn) {
  return { rpc } as never;
}

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

  test('rejects anything that is not a yyyy-MM-dd calendar date', () => {
    expect(b1g1CreditExpiry('')).toBeNull();
    expect(b1g1CreditExpiry('25/07/2026')).toBeNull();
    expect(b1g1CreditExpiry('2026-07-25T10:00:00Z')).toBeNull();
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
