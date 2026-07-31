/**
 * @jest-environment node
 *
 * The HTTP contract of POST /api/notifications/line.
 *
 * Seven callers still reach this route over HTTP — `clubs/order`,
 * `clubs/reserve`, the ShopeePay webhook and refund route, the club-rental
 * expiry cron, `lib/lineNotifyService.ts` and `lib/shopeepay/handleRefundNotify.ts`.
 * When the message builder and the push moved to `lib/notifications/staffLine.ts`
 * so booking creation could call them in process, the env checks moved with
 * them: they used to run at the top of the handler, before the message was
 * built, and now run inside `pushToStaffGroup` afterwards.
 *
 * That reordering is invisible to callers only as long as the status codes and
 * response shapes are preserved, which is what this file pins. The two shapes
 * are deliberately different and both are load-bearing:
 *
 *   misconfiguration / empty message -> { error }
 *   LINE API rejected the push       -> { error, details, notificationTypeProcessed }
 */

import type { NextRequest } from 'next/server';

const ORIGINAL_ENV = { ...process.env };

describe('POST /api/notifications/line contract', () => {
  let POST: typeof import('@/app/api/notifications/line/route').POST;
  const fetchMock = jest.fn();

  beforeAll(async () => {
    global.fetch = fetchMock as unknown as typeof fetch;
    ({ POST } = await import('@/app/api/notifications/line/route'));
  });

  beforeEach(() => {
    fetchMock.mockReset();
    process.env.LINE_CHANNEL_ACCESS_TOKEN = 'test-token';
    process.env.LINE_GROUP_ID = 'test-group';
    jest.spyOn(console, 'error').mockImplementation(() => {});
    jest.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
    process.env = { ...ORIGINAL_ENV };
  });

  const post = (body: unknown) =>
    POST(
      // The handler only ever calls `.json()` on this, so a plain Request is a
      // faithful stand-in — and `NextRequest` is not constructible under jest
      // without mocking `next/server`, which this suite deliberately does not do.
      new Request('http://localhost:3000/api/notifications/line', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }) as unknown as NextRequest
    );

  it('pushes a raw message and reports the type it sent', async () => {
    fetchMock.mockResolvedValue({ ok: true, status: 200, json: async () => ({}) });

    const res = await post({ message: '  hello staff  ', notificationType: 'general_message' });

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      success: true,
      notificationTypeSent: 'general_message',
    });

    // The raw-message path is what six of the seven callers use; it must reach
    // LINE trimmed and unmodified.
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://api.line.me/v2/bot/message/push');
    expect(JSON.parse((init as RequestInit).body as string)).toEqual({
      to: 'test-group',
      messages: [{ type: 'text', text: 'hello staff' }],
    });
  });

  it('surfaces the LINE API status and body when the push is rejected', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 429,
      statusText: 'Too Many Requests',
      json: async () => ({ message: 'You have reached your monthly limit.' }),
    });

    const res = await post({ message: 'hello', notificationType: 'general_message' });

    expect(res.status).toBe(429);
    await expect(res.json()).resolves.toEqual({
      error: 'Failed to send LINE notification to LINE API',
      details: { message: 'You have reached your monthly limit.' },
      notificationTypeProcessed: 'general_message',
    });
  });

  it('falls back to the status text when LINE returns a non-JSON body', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 502,
      statusText: 'Bad Gateway',
      json: async () => {
        throw new Error('not json');
      },
    });

    const res = await post({ message: 'hello' });

    expect(res.status).toBe(502);
    await expect(res.json()).resolves.toMatchObject({
      details: { message: 'Bad Gateway' },
    });
  });

  it('reports a missing access token as a bare 500, without contacting LINE', async () => {
    delete process.env.LINE_CHANNEL_ACCESS_TOKEN;

    const res = await post({ message: 'hello' });

    expect(res.status).toBe(500);
    await expect(res.json()).resolves.toEqual({
      error: 'LINE Messaging API access token is not set',
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('reports a missing group id as a bare 500, without contacting LINE', async () => {
    delete process.env.LINE_GROUP_ID;

    const res = await post({ message: 'hello' });

    expect(res.status).toBe(500);
    await expect(res.json()).resolves.toEqual({ error: 'LINE group ID is not set' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  /**
   * The token check must still win over the empty-message check. Both return
   * 500/400 respectively with a bare body, and the old handler evaluated the
   * env first — a caller diagnosing a misconfigured deployment should be told
   * about the token, not about message content.
   */
  it('prefers the misconfiguration error over an empty message', async () => {
    delete process.env.LINE_CHANNEL_ACCESS_TOKEN;

    const res = await post({ message: '   ' });

    expect(res.status).toBe(500);
    await expect(res.json()).resolves.toEqual({
      error: 'LINE Messaging API access token is not set',
    });
  });

  it('rejects an unbuildable message with 400 when the config is fine', async () => {
    const res = await post({ message: '   ', notificationType: 'general_message' });

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({
      error: 'Failed to generate LINE message content',
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('still renders a booking_created payload through the extracted builder', async () => {
    fetchMock.mockResolvedValue({ ok: true, status: 200, json: async () => ({}) });

    await post({
      notificationType: 'booking_created',
      customerCode: 'CUS-00123',
      customerName: 'Anna Kowalski',
      bookingName: 'Anna K.',
      email: 'anna@example.com',
      phoneNumber: '0898765432',
      bookingDate: '2026-08-04',
      bookingStartTime: '17:30',
      bookingEndTime: '19:30',
      bayNumber: 'Bay 2',
      duration: 2,
      numberOfPeople: 4,
      bookingId: 'BK260731EFGH',
    });

    const text = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string)
      .messages[0].text;
    expect(text).toContain('Booking Notification (ID: BK260731EFGH)');
    expect(text).toContain('Customer Name: Anna Kowalski');
    expect(text).toContain('Date: Tue, 4th August');
  });
});
