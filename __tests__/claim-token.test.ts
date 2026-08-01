/**
 * The claim token is the ENTIRE authorisation for attaching a booking to an
 * account, because ownership cannot be checked: the caller is signing in as a
 * different profile than the one that booked, by design.
 *
 * So the properties tested here are the security boundary, not niceties.
 */
const ORIGINAL_SECRET = process.env.NEXTAUTH_SECRET;

// Set before importing: the module reads env inside its functions, but keeping
// this explicit documents what the tests run against.
process.env.NEXTAUTH_SECRET = 'test-secret-value-long-enough-to-pass';

import { mintClaimToken, verifyClaimToken } from '@/lib/auth/claim-token';

const BOOKING = 'BK260801T4SK';
const PROFILE = '2c10f291-eca8-4d4f-89c2-96fa18bf0528';
const NOW = 1_800_000_000_000;
const TTL = 30 * 60 * 1000;

afterAll(() => {
  process.env.NEXTAUTH_SECRET = ORIGINAL_SECRET;
});

describe('mint and verify', () => {
  it('round-trips a freshly minted token', () => {
    const token = mintClaimToken({ bookingId: BOOKING, profileId: PROFILE }, NOW)!;
    const result = verifyClaimToken(token, BOOKING, NOW + 1000);
    expect(result).toEqual({ ok: true, claims: { bookingId: BOOKING, profileId: PROFILE } });
  });

  it('accepts right up to the expiry and refuses on it', () => {
    const token = mintClaimToken({ bookingId: BOOKING, profileId: PROFILE }, NOW)!;
    expect(verifyClaimToken(token, BOOKING, NOW + TTL - 1).ok).toBe(true);
    expect(verifyClaimToken(token, BOOKING, NOW + TTL)).toEqual({ ok: false, reason: 'expired' });
  });

  it('refuses a token long past its expiry', () => {
    const token = mintClaimToken({ bookingId: BOOKING, profileId: PROFILE }, NOW)!;
    expect(verifyClaimToken(token, BOOKING, NOW + 86_400_000)).toEqual({
      ok: false,
      reason: 'expired',
    });
  });
});

describe('the binding to a specific booking', () => {
  // The property that stops one confirmation page's token being replayed
  // against a different booking id.
  it('refuses an authentic token presented for another booking', () => {
    const token = mintClaimToken({ bookingId: BOOKING, profileId: PROFILE }, NOW)!;
    expect(verifyClaimToken(token, 'BK260801OTHER', NOW + 1000)).toEqual({
      ok: false,
      reason: 'booking_mismatch',
    });
  });
});

describe('forgery', () => {
  it('refuses a tampered booking id', () => {
    const token = mintClaimToken({ bookingId: BOOKING, profileId: PROFILE }, NOW)!;
    const [, profileId, exp, sig] = token.split('.');
    const forged = ['BK260801EVIL', profileId, exp, sig].join('.');
    expect(verifyClaimToken(forged, 'BK260801EVIL', NOW + 1000)).toEqual({
      ok: false,
      reason: 'bad_signature',
    });
  });

  // Signature is checked BEFORE expiry precisely so this cannot work.
  it('refuses an extended expiry', () => {
    const token = mintClaimToken({ bookingId: BOOKING, profileId: PROFILE }, NOW)!;
    const [bookingId, profileId, , sig] = token.split('.');
    const forged = [bookingId, profileId, String(NOW + 86_400_000), sig].join('.');
    expect(verifyClaimToken(forged, BOOKING, NOW + 1000)).toEqual({
      ok: false,
      reason: 'bad_signature',
    });
  });

  it('refuses a swapped profile id', () => {
    const token = mintClaimToken({ bookingId: BOOKING, profileId: PROFILE }, NOW)!;
    const [bookingId, , exp, sig] = token.split('.');
    const forged = [bookingId, '00000000-0000-0000-0000-000000000000', exp, sig].join('.');
    expect(verifyClaimToken(forged, BOOKING, NOW + 1000)).toEqual({
      ok: false,
      reason: 'bad_signature',
    });
  });

  it('refuses a token signed with a different secret', () => {
    process.env.NEXTAUTH_SECRET = 'a-completely-different-secret-value';
    const foreign = mintClaimToken({ bookingId: BOOKING, profileId: PROFILE }, NOW)!;
    process.env.NEXTAUTH_SECRET = 'test-secret-value-long-enough-to-pass';
    expect(verifyClaimToken(foreign, BOOKING, NOW + 1000)).toEqual({
      ok: false,
      reason: 'bad_signature',
    });
  });
});

describe('malformed input never throws', () => {
  it.each([
    ['null', null],
    ['undefined', undefined],
    ['empty', ''],
    ['no separators', 'garbage'],
    ['too few parts', 'a.b.c'],
    ['too many parts', 'a.b.c.d.e'],
    ['non-numeric expiry', `${BOOKING}.${PROFILE}.not-a-number.sig`],
    ['empty field', `.${PROFILE}.123.sig`],
  ])('refuses %s', (_label, token) => {
    expect(() => verifyClaimToken(token as string | null, BOOKING, NOW)).not.toThrow();
    expect(verifyClaimToken(token as string | null, BOOKING, NOW).ok).toBe(false);
  });

  // timingSafeEqual throws on a length mismatch, so a short signature must be
  // rejected by the length check before it reaches the comparison.
  it('refuses a signature of the wrong length without throwing', () => {
    const token = mintClaimToken({ bookingId: BOOKING, profileId: PROFILE }, NOW)!;
    const [b, p, e] = token.split('.');
    expect(() => verifyClaimToken([b, p, e, 'short'].join('.'), BOOKING, NOW + 1)).not.toThrow();
    expect(verifyClaimToken([b, p, e, 'short'].join('.'), BOOKING, NOW + 1)).toEqual({
      ok: false,
      reason: 'bad_signature',
    });
  });
});

describe('separator safety', () => {
  // The dot is the field separator. An id containing one would shift the fields
  // and could make a token parse as claims other than those signed.
  it('refuses to mint when an id contains the separator', () => {
    expect(mintClaimToken({ bookingId: 'BK.EVIL', profileId: PROFILE }, NOW)).toBeNull();
    expect(mintClaimToken({ bookingId: BOOKING, profileId: 'a.b' }, NOW)).toBeNull();
  });
});

describe('missing secret', () => {
  it('degrades to null and a refusal rather than throwing', () => {
    const saved = process.env.NEXTAUTH_SECRET;
    delete process.env.NEXTAUTH_SECRET;
    const errSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

    expect(mintClaimToken({ bookingId: BOOKING, profileId: PROFILE }, NOW)).toBeNull();
    expect(verifyClaimToken('anything', BOOKING, NOW)).toEqual({ ok: false, reason: 'no_secret' });

    errSpy.mockRestore();
    process.env.NEXTAUTH_SECRET = saved;
  });
});
