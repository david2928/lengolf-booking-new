/**
 * `/api/bookings/create` accepted an `x-line-user-id` header that anyone could
 * send, and would INSERT a profiles row for whatever value it was given. This
 * verifier is what replaces that trust.
 *
 * The property that matters most is FAILING CLOSED: a verifier that returns a
 * user id when something went wrong is worse than no verifier, because the
 * route would then treat an unproven id as proven.
 */
const REAL_LIFF_ID = process.env.NEXT_PUBLIC_LIFF_BOOKING_ID;
const CHANNEL = '2007654321';
process.env.NEXT_PUBLIC_LIFF_BOOKING_ID = `${CHANNEL}-abcdefgh`;

import { verifyLineIdToken } from '@/lib/auth/line-id-token';
import { appCache } from '@/lib/cache';

const SUB = 'U1234567890abcdef1234567890abcdef';
const futureExp = () => Math.floor(Date.now() / 1000) + 3600;

function mockVerifyResponse(body: unknown, ok = true, status = 200) {
  global.fetch = jest.fn().mockResolvedValue({
    ok,
    status,
    json: async () => body,
  }) as unknown as typeof fetch;
}

beforeEach(() => {
  appCache.flushAll();
  jest.restoreAllMocks();
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterAll(() => {
  process.env.NEXT_PUBLIC_LIFF_BOOKING_ID = REAL_LIFF_ID;
});

describe('verifyLineIdToken', () => {
  it('returns the sub for a valid token', async () => {
    mockVerifyResponse({ iss: 'https://access.line.me', sub: SUB, aud: CHANNEL, exp: futureExp() });
    await expect(verifyLineIdToken('a-token')).resolves.toBe(SUB);
  });

  // The audience is the LIFF app's OWN Login channel, which this project
  // confirmed is a DIFFERENT channel from the NextAuth provider's. Accepting a
  // token minted for another channel would defeat the whole verification.
  it('refuses a token issued for a different channel', async () => {
    mockVerifyResponse({
      iss: 'https://access.line.me',
      sub: SUB,
      aud: '2000000000',
      exp: futureExp(),
    });
    await expect(verifyLineIdToken('a-token')).resolves.toBeNull();
  });

  it('refuses a token from an unexpected issuer', async () => {
    mockVerifyResponse({ iss: 'https://evil.example', sub: SUB, aud: CHANNEL, exp: futureExp() });
    await expect(verifyLineIdToken('a-token')).resolves.toBeNull();
  });

  it('refuses an expired token', async () => {
    mockVerifyResponse({
      iss: 'https://access.line.me',
      sub: SUB,
      aud: CHANNEL,
      exp: Math.floor(Date.now() / 1000) - 1,
    });
    await expect(verifyLineIdToken('a-token')).resolves.toBeNull();
  });

  it.each([
    ['missing sub', { iss: 'https://access.line.me', aud: CHANNEL, exp: futureExp() }],
    ['empty sub', { iss: 'https://access.line.me', sub: '', aud: CHANNEL, exp: futureExp() }],
    ['missing exp', { iss: 'https://access.line.me', sub: SUB, aud: CHANNEL }],
    ['non-numeric exp', { iss: 'https://access.line.me', sub: SUB, aud: CHANNEL, exp: 'soon' }],
    ['empty body', {}],
  ])('refuses a response with %s', async (_label, body) => {
    mockVerifyResponse(body);
    await expect(verifyLineIdToken('a-token')).resolves.toBeNull();
  });

  it.each([
    ['null', null],
    ['undefined', undefined],
    ['empty string', ''],
  ])('refuses %s without calling LINE', async (_label, token) => {
    const spy = jest.fn();
    global.fetch = spy as unknown as typeof fetch;
    await expect(verifyLineIdToken(token as string | null)).resolves.toBeNull();
    expect(spy).not.toHaveBeenCalled();
  });

  describe('fails closed', () => {
    it('on a non-OK response', async () => {
      mockVerifyResponse({ error: 'invalid_request' }, false, 400);
      await expect(verifyLineIdToken('a-token')).resolves.toBeNull();
    });

    // The one that turns a verifier into a bypass if it goes the other way.
    it('on a network failure', async () => {
      global.fetch = jest.fn().mockRejectedValue(new Error('ECONNRESET')) as unknown as typeof fetch;
      await expect(verifyLineIdToken('a-token')).resolves.toBeNull();
    });

    it('on malformed JSON', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => {
          throw new Error('not json');
        },
      }) as unknown as typeof fetch;
      await expect(verifyLineIdToken('a-token')).resolves.toBeNull();
    });

    it('when the LIFF id is not configured', async () => {
      const saved = process.env.NEXT_PUBLIC_LIFF_BOOKING_ID;
      delete process.env.NEXT_PUBLIC_LIFF_BOOKING_ID;
      mockVerifyResponse({ iss: 'https://access.line.me', sub: SUB, aud: CHANNEL, exp: futureExp() });
      await expect(verifyLineIdToken('a-token')).resolves.toBeNull();
      process.env.NEXT_PUBLIC_LIFF_BOOKING_ID = saved;
    });

    it('when the LIFF id is malformed', async () => {
      const saved = process.env.NEXT_PUBLIC_LIFF_BOOKING_ID;
      process.env.NEXT_PUBLIC_LIFF_BOOKING_ID = 'not-a-liff-id';
      mockVerifyResponse({ iss: 'https://access.line.me', sub: SUB, aud: CHANNEL, exp: futureExp() });
      await expect(verifyLineIdToken('a-token')).resolves.toBeNull();
      process.env.NEXT_PUBLIC_LIFF_BOOKING_ID = saved;
    });
  });

  describe('caching', () => {
    it('does not call LINE twice for the same token', async () => {
      const spy = jest.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          iss: 'https://access.line.me',
          sub: SUB,
          aud: CHANNEL,
          exp: futureExp(),
        }),
      });
      global.fetch = spy as unknown as typeof fetch;

      await verifyLineIdToken('same-token');
      await verifyLineIdToken('same-token');
      expect(spy).toHaveBeenCalledTimes(1);
    });

    // The cache key must never BE the token: keys reach logs and dumps, and
    // this one is a bearer credential.
    it('keys on a hash, not on the token itself', async () => {
      mockVerifyResponse({ iss: 'https://access.line.me', sub: SUB, aud: CHANNEL, exp: futureExp() });
      await verifyLineIdToken('super-secret-token');
      expect(appCache.keys().some((k) => k.includes('super-secret-token'))).toBe(false);
    });

    it('does not cache a refusal', async () => {
      mockVerifyResponse({ iss: 'https://evil.example', sub: SUB, aud: CHANNEL, exp: futureExp() });
      await verifyLineIdToken('bad-token');

      mockVerifyResponse({ iss: 'https://access.line.me', sub: SUB, aud: CHANNEL, exp: futureExp() });
      await expect(verifyLineIdToken('bad-token')).resolves.toBe(SUB);
    });
  });
});
