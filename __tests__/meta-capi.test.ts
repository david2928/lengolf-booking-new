/**
 * Meta Conversions API sender.
 *
 * The failure mode this guards is silent: a wrongly-normalised phone still
 * hashes to a valid-looking 64-char string, Meta accepts the event, reports
 * `events_received: 1`, and matches nobody. Nothing anywhere errors. So the
 * normalisation rules need locking down by test rather than by inspection.
 */
import { createHash } from 'crypto';
import {
  normalizePhoneTH,
  sendBookingConversion,
  BOOKING_VALUE_THB,
} from '@/lib/meta/capi';

const sha = (v: string) => createHash('sha256').update(v).digest('hex');

const BASE = {
  bookingId: 'BK260804TEST',
  eventTimeMs: Date.parse('2026-08-04T10:00:00.000Z'),
  value: BOOKING_VALUE_THB,
};

describe('normalizePhoneTH', () => {
  test.each([
    ['081 234 5678', '66812345678'],
    ['0812345678', '66812345678'],
    ['+66812345678', '66812345678'],
    ['0066812345678', '66812345678'],
    ['66812345678', '66812345678'],
    ['08-1234-5678', '66812345678'],
  ])('normalises %s to %s', (input, expected) => {
    expect(normalizePhoneTH(input)).toBe(expected);
  });

  // A wrong hash is worse than no hash: it degrades match quality with nothing
  // to show for it, and no error is raised anywhere in the chain.
  test.each([[''], [null], [undefined], ['123'], ['not a phone'], ['1234567890123456789']])(
    'returns undefined rather than guessing for %p',
    (input) => {
      expect(normalizePhoneTH(input as string | null | undefined)).toBeUndefined();
    },
  );
});

describe('sendBookingConversion', () => {
  const OLD_ENV = process.env;
  const OLD_FETCH = global.fetch;
  // Assigned, not spied: jsdom provides no global.fetch to spy on.
  let mockFetch: jest.Mock;

  const okResponse = () =>
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ events_received: 1 }),
    } as Response);

  const sentBody = () =>
    JSON.parse((mockFetch.mock.calls[0][1] as RequestInit).body as string);

  beforeEach(() => {
    process.env = { ...OLD_ENV };
    delete process.env.META_CAPI_ACCESS_TOKEN;
    delete process.env.META_CAPI_TEST_EVENT_CODE;
    mockFetch = jest.fn();
    (global as unknown as { fetch: unknown }).fetch = mockFetch;
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    process.env = OLD_ENV;
    (global as unknown as { fetch: unknown }).fetch = OLD_FETCH;
    jest.restoreAllMocks();
  });

  // The whole point of failing soft. CLAUDE.md records two outages caused by
  // module-load env assertions; a booking must never depend on an analytics token.
  test('skips without throwing when no access token is configured', async () => {
    const result = await sendBookingConversion({ ...BASE, email: 'a@b.com' });

    expect(result).toEqual({ sent: false, skipped: 'not_configured' });
    expect(mockFetch).not.toHaveBeenCalled();
  });

  test('skips when there is no way to match a person', async () => {
    process.env.META_CAPI_ACCESS_TOKEN = 'token';
    const result = await sendBookingConversion({ ...BASE, email: null, phone: null });

    expect(result).toEqual({ sent: false, skipped: 'no_identifiers' });
    expect(mockFetch).not.toHaveBeenCalled();
  });

  test('hashes identifiers and never sends them in the clear', async () => {
    process.env.META_CAPI_ACCESS_TOKEN = 'token';
    okResponse();

    const result = await sendBookingConversion({
      ...BASE,
      email: '  Someone@Example.COM ',
      phone: '081 234 5678',
      firstName: 'Somchai Jaidee',
    });

    expect(result.sent).toBe(true);
    const body = sentBody();
    const raw = JSON.stringify(body);

    expect(body.data[0].user_data.em).toEqual([sha('someone@example.com')]);
    expect(body.data[0].user_data.ph).toEqual([sha('66812345678')]);
    // First token only — Meta matches given names, and hashing "somchai jaidee"
    // whole would never match anything.
    expect(body.data[0].user_data.fn).toEqual([sha('somchai')]);

    expect(raw).not.toContain('Someone@Example.COM');
    expect(raw).not.toContain('someone@example.com');
    expect(raw).not.toContain('0812345678');
    expect(raw).not.toContain('Somchai');
  });

  test('sends event_time in seconds and event_id as the booking id', async () => {
    process.env.META_CAPI_ACCESS_TOKEN = 'token';
    okResponse();

    await sendBookingConversion({ ...BASE, email: 'a@b.com' });

    const body = sentBody();
    // Milliseconds here would place the event ~55,000 years in the future and
    // Meta drops it without complaint.
    expect(body.data[0].event_time).toBe(Math.floor(BASE.eventTimeMs / 1000));
    expect(String(body.data[0].event_time)).toHaveLength(10);
    // Shared with the browser pixel so a web booking seen by both collapses to
    // one conversion rather than double-counting.
    expect(body.data[0].event_id).toBe('BK260804TEST');
    expect(body.data[0].event_name).toBe('Schedule');
    expect(body.data[0].custom_data).toMatchObject({ currency: 'THB', value: 1200 });
  });

  test('forwards fbp/fbc and request signals when present', async () => {
    process.env.META_CAPI_ACCESS_TOKEN = 'token';
    okResponse();

    await sendBookingConversion({
      ...BASE,
      email: null,
      phone: null,
      fbp: 'fb.1.123.456',
      fbc: 'fb.1.123.abc',
      clientIp: '1.2.3.4',
      userAgent: 'UA',
    });

    const ud = sentBody().data[0].user_data;
    expect(ud).toMatchObject({
      fbp: 'fb.1.123.456',
      fbc: 'fb.1.123.abc',
      client_ip_address: '1.2.3.4',
      client_user_agent: 'UA',
    });
  });

  // Resolves rather than throwing: the caller runs inside the booking route's
  // after() chain, where an exception would abort work queued behind it.
  test('resolves with an error instead of throwing when the API rejects', async () => {
    process.env.META_CAPI_ACCESS_TOKEN = 'token';
    mockFetch.mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => ({ error: { message: 'Invalid parameter' } }),
    } as Response);

    await expect(
      sendBookingConversion({ ...BASE, email: 'a@b.com' }),
    ).resolves.toEqual({ sent: false, error: 'Invalid parameter' });
  });

  test('resolves with an error instead of throwing when fetch itself fails', async () => {
    process.env.META_CAPI_ACCESS_TOKEN = 'token';
    mockFetch.mockRejectedValue(new Error('network down'));

    await expect(
      sendBookingConversion({ ...BASE, email: 'a@b.com' }),
    ).resolves.toEqual({ sent: false, error: 'network down' });
  });

  test('keeps the access token out of the request body', async () => {
    process.env.META_CAPI_ACCESS_TOKEN = 'super-secret-token';
    okResponse();

    await sendBookingConversion({ ...BASE, email: 'a@b.com' });

    const body = (mockFetch.mock.calls[0][1] as RequestInit).body as string;
    expect(body).not.toContain('super-secret-token');
  });
});
