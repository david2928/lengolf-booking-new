import {
  buildPurchaseEvent,
  BOOKING_CONVERSION_VALUE_THB,
  sendEvents,
  chunkEvents,
  MAX_EVENTS_PER_REQUEST,
} from '@/lib/meta/capi';

const CANDIDATE = {
  booking_id: 'BK-12345',
  event_time: '2026-08-04T10:30:00+07:00',
  customer_name: 'John Doe',
  booking_email: 'test@example.com',
  customer_email: null,
  phone: '0812345678',
  action_source: 'physical_store' as const,
};

describe('buildPurchaseEvent', () => {
  it('uses a stable event_id derived from the booking id', () => {
    expect(buildPurchaseEvent(CANDIDATE)?.event.event_id).toBe('booking-BK-12345');
  });

  it('is deterministic — the same booking always yields the same event_id', () => {
    const a = buildPurchaseEvent(CANDIDATE)?.event.event_id;
    const b = buildPurchaseEvent({ ...CANDIDATE })?.event.event_id;
    expect(a).toBe(b);
  });

  it('sends Purchase with the agreed value', () => {
    const built = buildPurchaseEvent(CANDIDATE);
    expect(built?.event.event_name).toBe('Purchase');
    // 1200, not 1813 — the latter is per-CUSTOMER and overstates a booking ~46%.
    expect(BOOKING_CONVERSION_VALUE_THB).toBe(1200);
    expect(built?.event.custom_data).toEqual({ value: 1200, currency: 'THB' });
  });

  it('converts event_time to unix SECONDS, not milliseconds', () => {
    const built = buildPurchaseEvent(CANDIDATE);
    // 2026-08-04T10:30:00+07:00 === 2026-08-04T03:30:00Z
    expect(built?.event.event_time).toBe(Math.floor(Date.parse('2026-08-04T03:30:00Z') / 1000));
    expect(String(built?.event.event_time)).toHaveLength(10);
  });

  it('carries the action_source through', () => {
    expect(buildPurchaseEvent(CANDIDATE)?.event.action_source).toBe('physical_store');
    expect(
      buildPurchaseEvent({ ...CANDIDATE, action_source: 'website' })?.event.action_source,
    ).toBe('website');
  });

  it('exposes matchKeys alongside the event for tracking', () => {
    expect(buildPurchaseEvent(CANDIDATE)?.matchKeys.slice().sort()).toEqual([
      'country', 'em', 'fn', 'ln', 'ph',
    ]);
  });

  it('returns null when no identifier survives, so the caller can mark it skipped', () => {
    expect(
      buildPurchaseEvent({
        ...CANDIDATE,
        booking_email: 'info@len.golf',
        customer_email: null,
        phone: null,
      }),
    ).toBeNull();
  });

  it('returns null for an unparseable event_time rather than sending a wrong instant', () => {
    expect(buildPurchaseEvent({ ...CANDIDATE, event_time: 'not-a-date' })).toBeNull();
  });

  it('never puts raw PII in the payload', () => {
    const json = JSON.stringify(buildPurchaseEvent(CANDIDATE));
    expect(json).not.toContain('test@example.com');
    expect(json).not.toContain('0812345678');
    expect(json).not.toContain('John');
    expect(json.toLowerCase()).not.toContain('john doe');
  });
});

describe('sendEvents', () => {
  const CONFIG = {
    accessToken: 'tok-123',
    datasetId: '1326508338698235',
    testEventCode: null,
  };

  const EVENT = buildPurchaseEvent(CANDIDATE)!.event;

  let fetchMock: jest.Mock;

  beforeEach(() => {
    fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ events_received: 1, messages: [], fbtrace_id: 'trace-abc' }),
    });
    global.fetch = fetchMock as unknown as typeof fetch;
  });

  it('posts to the dataset events endpoint', async () => {
    await sendEvents(CONFIG, [EVENT]);
    const [url] = fetchMock.mock.calls[0];
    expect(url).toBe('https://graph.facebook.com/v22.0/1326508338698235/events');
  });

  it('sends the token in the body, never in the query string', async () => {
    await sendEvents(CONFIG, [EVENT]);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).not.toContain('tok-123');
    expect(JSON.parse(init.body).access_token).toBe('tok-123');
  });

  it('returns events_received and the trace id', async () => {
    const result = await sendEvents(CONFIG, [EVENT]);
    expect(result).toEqual({
      ok: true,
      eventsReceived: 1,
      fbTraceId: 'trace-abc',
      error: null,
    });
  });

  it('omits test_event_code when unset', async () => {
    await sendEvents(CONFIG, [EVENT]);
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).not.toHaveProperty('test_event_code');
  });

  it('includes test_event_code when set', async () => {
    await sendEvents({ ...CONFIG, testEventCode: 'TEST123' }, [EVENT]);
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).test_event_code).toBe('TEST123');
  });

  it('surfaces a Graph API error without throwing', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => ({
        error: { message: '(#100) Missing perms', code: 100, fbtrace_id: 'trace-err' },
      }),
    });
    const result = await sendEvents(CONFIG, [EVENT]);
    expect(result.ok).toBe(false);
    expect(result.error).toContain('Missing perms');
    expect(result.fbTraceId).toBe('trace-err');
  });

  it('surfaces a network failure without throwing', async () => {
    fetchMock.mockRejectedValue(new Error('socket hang up'));
    const result = await sendEvents(CONFIG, [EVENT]);
    expect(result.ok).toBe(false);
    expect(result.error).toContain('socket hang up');
  });

  it('does nothing and reports ok for an empty batch', async () => {
    const result = await sendEvents(CONFIG, []);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(result).toEqual({ ok: true, eventsReceived: 0, fbTraceId: null, error: null });
  });

  it('caps a request at MAX_EVENTS_PER_REQUEST', () => {
    expect(MAX_EVENTS_PER_REQUEST).toBe(1000);
  });
});

describe('chunkEvents', () => {
  it('returns an empty array for an empty input', () => {
    expect(chunkEvents([], 3)).toEqual([]);
  });

  it('returns a single chunk when fewer items than the chunk size', () => {
    expect(chunkEvents([1, 2], 5)).toEqual([[1, 2]]);
  });

  it('splits an exact multiple into even chunks', () => {
    expect(chunkEvents([1, 2, 3, 4], 2)).toEqual([[1, 2], [3, 4]]);
  });

  it('leaves a shorter final chunk for a non-exact multiple', () => {
    expect(chunkEvents([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
  });

  it('defaults to MAX_EVENTS_PER_REQUEST when no size is given', () => {
    const events = Array.from({ length: 5 }, (_, i) => i);
    expect(chunkEvents(events)).toEqual([events]);
  });
});
