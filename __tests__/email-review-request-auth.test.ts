/**
 * @jest-environment node
 *
 * Auth contract for POST /api/notifications/email/review-request.
 *
 * The route sends email from the business identity (notification@len.golf)
 * with a caller-controlled recipient, name, review URL and voucher image, and
 * middleware does not cover /api/notifications/* — so the handler itself must
 * require `Authorization: Bearer ${CRON_API_KEY}`, the same contract as the
 * process-review-requests cron route that calls it.
 */
// jest.setup.js mocks next/server with a NextResponse-only stub; this suite
// needs the real NextRequest/NextResponse (available in the node test env).
jest.unmock('next/server');

// The route transitively imports `server-only` (via lib/i18n/email-helpers),
// which Next.js aliases away at build time but Jest cannot resolve.
jest.mock('server-only', () => ({}), { virtual: true });

const mockSendMail = jest.fn();
jest.mock('nodemailer', () => ({
  createTransport: jest.fn(() => ({ sendMail: mockSendMail })),
}));

import { NextRequest } from 'next/server';

const ROUTE_URL = 'http://localhost:3000/api/notifications/email/review-request';
const CRON_KEY = 'test-cron-api-key-0123456789abcdef';

type RouteModule = typeof import('@/app/api/notifications/email/review-request/route');

function makeRequest(headers: Record<string, string>): NextRequest {
  return new NextRequest(ROUTE_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify({
      email: 'recipient@example.com',
      userName: 'Test User',
      reviewUrl: 'https://g.page/r/test/review',
      voucherImageUrl: 'https://booking.len.golf/images/google_review_voucher_email.png',
    }),
  });
}

describe('POST /api/notifications/email/review-request auth', () => {
  const originalCronKey = process.env.CRON_API_KEY;
  const originalEmailUser = process.env.EMAIL_USER;
  const originalEmailPassword = process.env.EMAIL_PASSWORD;
  let POST: RouteModule['POST'];

  beforeAll(async () => {
    // The route captures EMAIL_USER/EMAIL_PASSWORD at module scope, so they
    // must be set before the first import or the allow-path test would hit
    // the not-configured 500 branch instead of the (mocked) transport.
    process.env.EMAIL_USER = 'smtp-test-user';
    process.env.EMAIL_PASSWORD = 'smtp-test-pass';
    ({ POST } = await import('@/app/api/notifications/email/review-request/route'));
  });

  beforeEach(() => {
    process.env.CRON_API_KEY = CRON_KEY;
    mockSendMail.mockReset();
    mockSendMail.mockResolvedValue({ messageId: 'test-message-id' });
  });

  afterAll(() => {
    if (originalCronKey === undefined) delete process.env.CRON_API_KEY;
    else process.env.CRON_API_KEY = originalCronKey;
    if (originalEmailUser === undefined) delete process.env.EMAIL_USER;
    else process.env.EMAIL_USER = originalEmailUser;
    if (originalEmailPassword === undefined) delete process.env.EMAIL_PASSWORD;
    else process.env.EMAIL_PASSWORD = originalEmailPassword;
  });

  it('rejects a request with no Authorization header', async () => {
    const res = await POST(makeRequest({}));
    expect(res.status).toBe(401);
    expect(mockSendMail).not.toHaveBeenCalled();
  });

  it('rejects a wrong bearer token', async () => {
    const res = await POST(makeRequest({ Authorization: 'Bearer not-the-key' }));
    expect(res.status).toBe(401);
    expect(mockSendMail).not.toHaveBeenCalled();
  });

  it('accepts the CRON_API_KEY bearer token', async () => {
    const res = await POST(makeRequest({ Authorization: `Bearer ${CRON_KEY}` }));
    expect(res.status).toBe(200);
    expect(mockSendMail).toHaveBeenCalledTimes(1);
  });

  it('rejects everything when CRON_API_KEY is not configured', async () => {
    delete process.env.CRON_API_KEY;
    const res = await POST(makeRequest({ Authorization: 'Bearer ' }));
    expect(res.status).toBe(401);
    expect(mockSendMail).not.toHaveBeenCalled();
  });

  // Without the !apiKey guard, an unset key interpolates to the literal
  // string `Bearer undefined` — which an attacker can simply send.
  it('rejects "Bearer undefined" when CRON_API_KEY is not configured', async () => {
    delete process.env.CRON_API_KEY;
    const res = await POST(makeRequest({ Authorization: 'Bearer undefined' }));
    expect(res.status).toBe(401);
    expect(mockSendMail).not.toHaveBeenCalled();
  });
});
