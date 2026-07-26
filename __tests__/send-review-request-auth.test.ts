/**
 * @jest-environment node
 *
 * Auth contract for POST /api/notifications/send-review-request.
 *
 * Regression guard for the Upstash-Signature bypass: the route used to treat
 * the mere presence of an `Upstash-Signature` header (any value, never
 * verified) as authentication, letting unauthenticated callers trigger
 * review-request notifications. Only `Authorization: Bearer ${CRON_API_KEY}`
 * may pass.
 */
// jest.setup.js mocks next/server with a NextResponse-only stub; this suite
// needs the real NextRequest/NextResponse (available in the node test env).
jest.unmock('next/server');

import { NextRequest } from 'next/server';
import { POST } from '@/app/api/notifications/send-review-request/route';

const ROUTE_URL = 'http://localhost:3000/api/notifications/send-review-request';
const CRON_KEY = 'test-cron-api-key-0123456789abcdef';

function makeRequest(headers: Record<string, string>): NextRequest {
  return new NextRequest(ROUTE_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify({
      bookingId: 'BK-TEST-1',
      userId: 'user-1',
      provider: 'email',
      contactInfo: 'test@example.com',
    }),
  });
}

describe('POST /api/notifications/send-review-request auth', () => {
  const originalCronKey = process.env.CRON_API_KEY;
  const originalQstashKey = process.env.QSTASH_API_KEY;
  let fetchSpy: jest.SpyInstance;

  beforeEach(() => {
    process.env.CRON_API_KEY = CRON_KEY;
    delete process.env.QSTASH_API_KEY;
    fetchSpy = jest
      .spyOn(global, 'fetch')
      .mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 }));
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  afterAll(() => {
    if (originalCronKey === undefined) delete process.env.CRON_API_KEY;
    else process.env.CRON_API_KEY = originalCronKey;
    if (originalQstashKey === undefined) delete process.env.QSTASH_API_KEY;
    else process.env.QSTASH_API_KEY = originalQstashKey;
  });

  it('rejects a request whose only credential is an Upstash-Signature header', async () => {
    const res = await POST(makeRequest({ 'Upstash-Signature': 'forged-signature' }));
    expect(res.status).toBe(401);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('rejects an Upstash-Signature header combined with a wrong bearer token', async () => {
    const res = await POST(
      makeRequest({ 'Upstash-Signature': 'forged-signature', Authorization: 'Bearer wrong' })
    );
    expect(res.status).toBe(401);
    expect(fetchSpy).not.toHaveBeenCalled();
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

  it('rejects the legacy QSTASH_API_KEY as a bearer token even when it is set', async () => {
    process.env.QSTASH_API_KEY = 'legacy-qstash-key';
    const res = await POST(makeRequest({ Authorization: 'Bearer legacy-qstash-key' }));
    expect(res.status).toBe(401);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('accepts the CRON_API_KEY bearer token', async () => {
    const res = await POST(makeRequest({ Authorization: `Bearer ${CRON_KEY}` }));
    expect(res.status).toBe(200);
  });

  it('rejects everything when CRON_API_KEY is not configured', async () => {
    delete process.env.CRON_API_KEY;
    const res = await POST(makeRequest({ Authorization: 'Bearer ' }));
    expect(res.status).toBe(401);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
