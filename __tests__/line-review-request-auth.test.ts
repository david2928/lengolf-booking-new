/**
 * @jest-environment node
 *
 * Auth contract for POST /api/notifications/line/review-request.
 *
 * The route pushes LINE messages from the business account with a
 * caller-controlled recipient and review URL, and middleware does not cover
 * /api/notifications/* — so the handler itself must require
 * `Authorization: Bearer ${CRON_API_KEY}`, the same contract as the
 * process-review-requests cron route that calls it.
 */
// jest.setup.js mocks next/server with a NextResponse-only stub; this suite
// needs the real NextRequest/NextResponse (available in the node test env).
jest.unmock('next/server');

import { NextRequest } from 'next/server';

const ROUTE_URL = 'http://localhost:3000/api/notifications/line/review-request';
const CRON_KEY = 'test-cron-api-key-0123456789abcdef';

type RouteModule = typeof import('@/app/api/notifications/line/review-request/route');

function makeRequest(headers: Record<string, string>): NextRequest {
  return new NextRequest(ROUTE_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify({
      userId: 'U-test-line-user',
      bookingName: 'Test User',
      reviewUrl: 'https://g.page/r/test/review',
      voucherImageUrl: 'https://booking.len.golf/images/google_review_voucher.png',
    }),
  });
}

describe('POST /api/notifications/line/review-request auth', () => {
  const originalCronKey = process.env.CRON_API_KEY;
  const originalLineToken = process.env.LINE_CHANNEL_ACCESS_TOKEN;
  let POST: RouteModule['POST'];
  let fetchSpy: jest.SpyInstance;

  beforeAll(async () => {
    // The route captures LINE_CHANNEL_ACCESS_TOKEN at module scope, so it
    // must be set before the first import or the allow-path test would hit
    // the not-configured 500 branch instead of the (mocked) LINE call.
    process.env.LINE_CHANNEL_ACCESS_TOKEN = 'test-line-channel-token';
    ({ POST } = await import('@/app/api/notifications/line/review-request/route'));
  });

  beforeEach(() => {
    process.env.CRON_API_KEY = CRON_KEY;
    fetchSpy = jest
      .spyOn(global, 'fetch')
      .mockResolvedValue(new Response(JSON.stringify({}), { status: 200 }));
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  afterAll(() => {
    if (originalCronKey === undefined) delete process.env.CRON_API_KEY;
    else process.env.CRON_API_KEY = originalCronKey;
    if (originalLineToken === undefined) delete process.env.LINE_CHANNEL_ACCESS_TOKEN;
    else process.env.LINE_CHANNEL_ACCESS_TOKEN = originalLineToken;
  });

  it('rejects a request with no Authorization header', async () => {
    const res = await POST(makeRequest({}));
    expect(res.status).toBe(401);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('rejects a wrong bearer token', async () => {
    const res = await POST(makeRequest({ Authorization: 'Bearer not-the-key' }));
    expect(res.status).toBe(401);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('accepts the CRON_API_KEY bearer token', async () => {
    const res = await POST(makeRequest({ Authorization: `Bearer ${CRON_KEY}` }));
    expect(res.status).toBe(200);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('rejects everything when CRON_API_KEY is not configured', async () => {
    delete process.env.CRON_API_KEY;
    const res = await POST(makeRequest({ Authorization: 'Bearer ' }));
    expect(res.status).toBe(401);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  // Without the !apiKey guard, an unset key interpolates to the literal
  // string `Bearer undefined` — which an attacker can simply send.
  it('rejects "Bearer undefined" when CRON_API_KEY is not configured', async () => {
    delete process.env.CRON_API_KEY;
    const res = await POST(makeRequest({ Authorization: 'Bearer undefined' }));
    expect(res.status).toBe(401);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
