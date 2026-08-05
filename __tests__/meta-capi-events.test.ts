import { buildPurchaseEvent, BOOKING_CONVERSION_VALUE_THB } from '@/lib/meta/capi';

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
