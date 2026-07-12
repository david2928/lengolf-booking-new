import type { NextRequest } from 'next/server';
import {
  RATE_LIMITS,
  checkRateLimit,
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

  it('falls back to x-real-ip when x-forwarded-for is empty', () => {
    expect(
      getClientIp(fakeRequest({ 'x-forwarded-for': '', 'x-real-ip': '198.51.100.2' })),
    ).toBe('198.51.100.2');
  });

  it("returns 'unknown' when no IP headers exist (local dev)", () => {
    expect(getClientIp(fakeRequest({}))).toBe('unknown');
  });
});

describe('checkRateLimit', () => {
  const config = { max: 10, windowSeconds: 3600 };

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

  it('allows when under the limit', async () => {
    const { client } = fakeAdmin({
      data: [{ allowed: true, current_count: 3, retry_after_seconds: 1200 }],
    });
    await expect(checkRateLimit(client, 'k', config)).resolves.toEqual({
      allowed: true,
      retryAfterSeconds: 1200,
    });
  });

  it('denies when over the limit', async () => {
    const { client } = fakeAdmin({
      data: [{ allowed: false, current_count: 11, retry_after_seconds: 42 }],
    });
    await expect(checkRateLimit(client, 'k', config)).resolves.toEqual({
      allowed: false,
      retryAfterSeconds: 42,
    });
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
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});
    const { client } = fakeAdmin({ error: { message: 'db down' } });
    await expect(checkRateLimit(client, 'k', config)).resolves.toMatchObject({ allowed: true });
    expect(consoleError).toHaveBeenCalled();
    consoleError.mockRestore();
  });

  it('fails OPEN on a thrown/network error', async () => {
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});
    const { client } = fakeAdmin(new Error('fetch failed'));
    await expect(checkRateLimit(client, 'k', config)).resolves.toMatchObject({ allowed: true });
    consoleError.mockRestore();
  });

  it('fails OPEN on an unexpected payload shape', async () => {
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});
    const { client } = fakeAdmin({ data: [] });
    await expect(checkRateLimit(client, 'k', config)).resolves.toMatchObject({ allowed: true });
    consoleError.mockRestore();
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
    expect(RATE_LIMITS.lineNotify.max / (RATE_LIMITS.lineNotify.windowSeconds / 60)).toBeGreaterThanOrEqual(20);
  });
});
