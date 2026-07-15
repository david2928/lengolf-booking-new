import type { NextRequest } from 'next/server';
import {
  RATE_LIMITS,
  checkRateLimit,
  clubsWriteKey,
  getClientIp,
  rateLimitedResponse,
} from '@/lib/rate-limit';

function fakeRequest(headers: Record<string, string>): NextRequest {
  return { headers: new Headers(headers) } as unknown as NextRequest;
}

function fakeAdmin(result: { data?: unknown; error?: unknown } | Error) {
  const rpc = jest.fn(async () => {
    if (result instanceof Error) throw result;
    return { data: result.data ?? null, error: result.error ?? null };
  });
  return { client: { rpc }, rpc };
}

describe('getClientIp', () => {
  it('takes the first x-forwarded-for entry, trimmed', () => {
    expect(getClientIp(fakeRequest({ 'x-forwarded-for': ' 203.0.113.7 , 10.0.0.1' }))).toBe(
      '203.0.113.7',
    );
  });

  it('falls back to x-real-ip when x-forwarded-for is absent', () => {
    expect(getClientIp(fakeRequest({ 'x-real-ip': '198.51.100.2' }))).toBe('198.51.100.2');
  });

  it('falls back to x-real-ip when the first x-forwarded-for entry is blank', () => {
    expect(
      getClientIp(fakeRequest({ 'x-forwarded-for': ' , 10.0.0.1', 'x-real-ip': '198.51.100.2' })),
    ).toBe('198.51.100.2');
  });

  it('rejects non-IP-shaped forwarded values instead of keying on attacker text', () => {
    expect(
      getClientIp(
        fakeRequest({ 'x-forwarded-for': 'evil-arbitrary-key-'.repeat(10), 'x-real-ip': '1.2.3.4' }),
      ),
    ).toBe('1.2.3.4');
    expect(getClientIp(fakeRequest({ 'x-forwarded-for': 'not an ip' }))).toBe('unknown');
  });

  it("returns 'unknown' when no IP headers exist (local dev)", () => {
    expect(getClientIp(fakeRequest({}))).toBe('unknown');
  });

  it('collapses IPv6 to its /64 prefix so privacy-extension rotation shares one bucket', () => {
    expect(
      getClientIp(fakeRequest({ 'x-forwarded-for': '2001:db8:abcd:1234:5678:9abc:def0:1111' })),
    ).toBe('2001:db8:abcd:1234::/64');
    expect(
      getClientIp(fakeRequest({ 'x-forwarded-for': '2001:DB8:ABCD:1234:aaaa:bbbb:cccc:dddd' })),
    ).toBe('2001:db8:abcd:1234::/64');
  });

  it('expands :: before taking the /64', () => {
    expect(getClientIp(fakeRequest({ 'x-forwarded-for': '2001:db8::1' }))).toBe(
      '2001:db8:0:0::/64',
    );
    expect(getClientIp(fakeRequest({ 'x-forwarded-for': '::1' }))).toBe('0:0:0:0::/64');
  });

  it('keys IPv4-mapped IPv6 on the embedded IPv4', () => {
    expect(getClientIp(fakeRequest({ 'x-forwarded-for': '::ffff:203.0.113.9' }))).toBe(
      '203.0.113.9',
    );
  });

  it('rejects malformed IPv6', () => {
    expect(getClientIp(fakeRequest({ 'x-forwarded-for': '2001::db8::1' }))).toBe('unknown');
    expect(getClientIp(fakeRequest({ 'x-forwarded-for': '1:2:3:4:5:6:7' }))).toBe('unknown');
    expect(getClientIp(fakeRequest({ 'x-forwarded-for': '12345:2:3:4:5:6:7:8' }))).toBe('unknown');
  });
});

describe('clubsWriteKey', () => {
  it('builds the shared guest-checkout bucket key', () => {
    expect(clubsWriteKey(fakeRequest({ 'x-forwarded-for': '203.0.113.7' }))).toBe(
      'clubs-write:203.0.113.7',
    );
  });
});

describe('checkRateLimit', () => {
  const config = { max: 10, windowSeconds: 3600 };
  let consoleWarn: jest.SpyInstance;
  let consoleError: jest.SpyInstance;

  beforeEach(() => {
    consoleWarn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => {
    consoleWarn.mockRestore();
    consoleError.mockRestore();
  });

  it('passes the key and config through to the rate_limit_hit RPC', async () => {
    const { client, rpc } = fakeAdmin({
      data: [{ allowed: true, current_count: 1, retry_after_seconds: 3599 }],
    });
    await checkRateLimit(client, 'clubs-write:203.0.113.7', config);
    expect(rpc).toHaveBeenCalledWith('rate_limit_hit', {
      p_key: 'clubs-write:203.0.113.7',
      p_max: 10,
      p_window_seconds: 3600,
    });
  });

  it('truncates oversized keys before hitting the DB', async () => {
    const { client, rpc } = fakeAdmin({
      data: [{ allowed: true, current_count: 1, retry_after_seconds: 1 }],
    });
    await checkRateLimit(client, 'k'.repeat(500), config);
    expect((rpc.mock.calls[0] as unknown[])[1]).toMatchObject({ p_key: 'k'.repeat(128) });
  });

  it('allows when under the limit', async () => {
    const { client } = fakeAdmin({
      data: [{ allowed: true, current_count: 3, retry_after_seconds: 1200 }],
    });
    await expect(checkRateLimit(client, 'k', config)).resolves.toEqual({
      allowed: true,
      retryAfterSeconds: 1200,
    });
    expect(consoleWarn).not.toHaveBeenCalled();
  });

  it('denies when over the limit and logs a distinct [RateLimit] denied tag', async () => {
    const { client } = fakeAdmin({
      data: [{ allowed: false, current_count: 11, retry_after_seconds: 42 }],
    });
    await expect(checkRateLimit(client, 'k', config)).resolves.toEqual({
      allowed: false,
      retryAfterSeconds: 42,
    });
    expect(consoleWarn).toHaveBeenCalledWith(expect.stringContaining('[RateLimit] denied'));
  });

  it('handles a single-object (non-array) RPC payload', async () => {
    const { client } = fakeAdmin({
      data: { allowed: false, current_count: 11, retry_after_seconds: 42 },
    });
    await expect(checkRateLimit(client, 'k', config)).resolves.toEqual({
      allowed: false,
      retryAfterSeconds: 42,
    });
  });

  it('fails OPEN on an RPC error', async () => {
    const { client } = fakeAdmin({ error: { message: 'db down' } });
    await expect(checkRateLimit(client, 'k', config)).resolves.toMatchObject({ allowed: true });
    expect(consoleError).toHaveBeenCalled();
  });

  it('fails OPEN with a warn (not error) when the RPC does not exist yet', async () => {
    const { client } = fakeAdmin({
      error: { code: 'PGRST202', message: 'function rate_limit_hit not found' },
    });
    await expect(checkRateLimit(client, 'k', config)).resolves.toMatchObject({ allowed: true });
    expect(consoleWarn).toHaveBeenCalledWith(expect.stringContaining('migration not applied'));
    expect(consoleError).not.toHaveBeenCalled();
  });

  it('fails OPEN on a thrown/network error', async () => {
    const { client } = fakeAdmin(new Error('fetch failed'));
    await expect(checkRateLimit(client, 'k', config)).resolves.toMatchObject({ allowed: true });
  });

  it('fails OPEN on an unexpected payload shape', async () => {
    const { client } = fakeAdmin({ data: [] });
    await expect(checkRateLimit(client, 'k', config)).resolves.toMatchObject({ allowed: true });
  });

  it('defaults retry-after to the window length when the RPC omits it', async () => {
    const { client } = fakeAdmin({ data: [{ allowed: false, current_count: 99 }] });
    await expect(checkRateLimit(client, 'k', config)).resolves.toEqual({
      allowed: false,
      retryAfterSeconds: 3600,
    });
  });
});

describe('rateLimitedResponse', () => {
  it('returns 429 with a Retry-After header', async () => {
    const res = rateLimitedResponse({ allowed: false, retryAfterSeconds: 42 });
    expect(res.status).toBe(429);
    expect(res.headers.get('Retry-After')).toBe('42');
    await expect(res.json()).resolves.toEqual({
      error: 'Too many requests. Please try again later.',
    });
  });

  it('never emits a Retry-After below 1', () => {
    const res = rateLimitedResponse({ allowed: false, retryAfterSeconds: 0 });
    expect(res.headers.get('Retry-After')).toBe('1');
  });
});

describe('RATE_LIMITS presets', () => {
  it('guest-checkout bucket is strict, LINE-notify bucket is generous', () => {
    // Guardrails: clubs-write throttles CRM-row minting (customers auto-create
    // on unmatched phones); line-notify must stay above legit internal
    // self-fetch peak because Vercel egress IPs are shared.
    expect(RATE_LIMITS.clubsWrite.max).toBeLessThanOrEqual(20);
    expect(
      RATE_LIMITS.lineNotify.max / (RATE_LIMITS.lineNotify.windowSeconds / 60),
    ).toBeGreaterThanOrEqual(20);
  });
});
