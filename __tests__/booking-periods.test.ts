/**
 * The one definition of "morning".
 *
 * Three used to exist and they disagreed: the SQL `period` field split at 12,
 * the customer-facing captions promised 13, and LIFF recomputed at 13. A 12:00
 * or 12:30 slot was grouped as Afternoon on the web under a header reading
 * "(13:00 - 17:00)", and as Morning on LINE.
 *
 * What is pinned here is not just "13 is the boundary" — it is that the
 * boundary and the printed caption cannot drift apart again. The catalog
 * assertions at the bottom are the teeth: they fail the moment someone bakes a
 * numeral back into a translated string.
 */
import {
  AFTERNOON_START_HOUR,
  BOOKING_PERIODS,
  CLOSING_HOUR,
  EVENING_START_HOUR,
  formatPeriodHour,
  getBookingPeriod,
  periodHourCaptionArgs,
  periodHourRange,
  type BookingPeriod,
} from '@/lib/booking-periods';
import { getOpeningHour } from '@/lib/opening-hours';
import en from '@/messages/en.json';
import th from '@/messages/th.json';
import ko from '@/messages/ko.json';
import ja from '@/messages/ja.json';
import zh from '@/messages/zh.json';

/** On/after the 2026-04-01 transition the venue opens at 09:00. */
const TODAY = '2026-07-25';
/** Before it, 10:00 — the case a hardcoded "09:00" caption would have lied about. */
const LEGACY = '2026-03-15';

describe('the 12:00 / 12:30 boundary', () => {
  test('noon and half past noon are MORNING, not afternoon', () => {
    expect(getBookingPeriod('12:00')).toBe('morning');
    expect(getBookingPeriod('12:30')).toBe('morning');
  });

  test('13:00 is the first afternoon slot', () => {
    expect(getBookingPeriod('12:59')).toBe('morning');
    expect(getBookingPeriod('13:00')).toBe('afternoon');
    expect(getBookingPeriod('13:30')).toBe('afternoon');
  });

  test('17:00 is the first evening slot', () => {
    expect(getBookingPeriod('16:30')).toBe('afternoon');
    expect(getBookingPeriod('17:00')).toBe('evening');
    expect(getBookingPeriod('22:30')).toBe('evening');
  });

  test('the earliest slot of the day is morning on both opening-hour regimes', () => {
    expect(getBookingPeriod('09:00')).toBe('morning');
    expect(getBookingPeriod('10:00')).toBe('morning');
  });

  test('a malformed time buckets rather than throwing inside a render', () => {
    expect(getBookingPeriod('')).toBe('morning');
    expect(getBookingPeriod('nonsense')).toBe('morning');
  });
});

describe('the caption spans and the grouping share one source', () => {
  test.each(BOOKING_PERIODS)(
    'every half-hour the %s caption claims actually groups as %s',
    (period: BookingPeriod) => {
      const { startHour, endHour } = periodHourRange(period, TODAY);
      expect(endHour).toBeGreaterThan(startHour);
      for (let hour = startHour; hour < endHour; hour++) {
        const hh = String(hour).padStart(2, '0');
        expect(getBookingPeriod(`${hh}:00`)).toBe(period);
        expect(getBookingPeriod(`${hh}:30`)).toBe(period);
      }
    },
  );

  test('the three spans tile the trading day with no gap and no overlap', () => {
    const morning = periodHourRange('morning', TODAY);
    const afternoon = periodHourRange('afternoon', TODAY);
    const evening = periodHourRange('evening', TODAY);

    expect(morning.startHour).toBe(getOpeningHour(TODAY));
    expect(morning.endHour).toBe(afternoon.startHour);
    expect(afternoon.endHour).toBe(evening.startHour);
    expect(evening.endHour).toBe(CLOSING_HOUR);
    expect([afternoon.startHour, evening.startHour]).toEqual([
      AFTERNOON_START_HOUR,
      EVENING_START_HOUR,
    ]);
  });

  test('the morning caption follows the opening hour instead of hardcoding 09:00', () => {
    expect(periodHourCaptionArgs('morning', TODAY)).toEqual({ start: '09:00', end: '13:00' });
    // Before the transition the venue opened at 10:00; a baked-in "09:00"
    // would have advertised an hour that never had slots.
    expect(periodHourCaptionArgs('morning', LEGACY)).toEqual({ start: '10:00', end: '13:00' });
    expect(getOpeningHour(LEGACY)).toBe(10);
  });

  test('afternoon and evening captions do not move with the opening hour', () => {
    expect(periodHourCaptionArgs('afternoon', LEGACY)).toEqual({ start: '13:00', end: '17:00' });
    expect(periodHourCaptionArgs('evening', LEGACY)).toEqual({ start: '17:00', end: '23:00' });
  });

  test('hours are zero-padded to HH:00', () => {
    expect(formatPeriodHour(9)).toBe('09:00');
    expect(formatPeriodHour(13)).toBe('13:00');
    expect(formatPeriodHour(23)).toBe('23:00');
  });
});

describe('the message catalogs carry no hardcoded boundary numerals', () => {
  const catalogs = { en, th, ko, ja, zh } as const;

  test.each(Object.entries(catalogs))(
    '%s.json builds the caption from ICU arguments',
    (_locale, catalog) => {
      const caption = (catalog as typeof en).bookings.timeStep.periodHours;
      expect(caption).toContain('{start}');
      expect(caption).toContain('{end}');
      // If a digit reappears here, the caption has been re-hardcoded and can
      // once again disagree with `getBookingPeriod`.
      expect(caption).not.toMatch(/\d/);
    },
  );

  test.each(Object.entries(catalogs))('%s.json has dropped the retired keys', (_locale, catalog) => {
    const timeStep = (catalog as typeof en).bookings.timeStep as Record<string, unknown>;
    expect(timeStep).not.toHaveProperty('periodMorningHours');
    expect(timeStep).not.toHaveProperty('periodAfternoonHours');
    expect(timeStep).not.toHaveProperty('periodEveningHours');
  });
});
