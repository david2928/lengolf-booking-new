/**
 * The allowed-duration ladder. Owner-confirmed 25 Jul 2026:
 *   1, 1.5, 2, 2.5, 3 for everyone; 4 and 5 only with an active package.
 *   3.5 and 4.5 are deliberately absent: in the 180 days to 25 Jul 2026 they
 *   accounted for 3 paid bay-rate bookings between them, and roughly half of
 *   their volume was staff bay blocks created in the POS.
 * This module is the single source of truth so the SQL ladder and the UI
 * picker cannot drift apart.
 */
import {
  ALL_DURATIONS,
  BASE_DURATIONS,
  MIN_DURATION,
  PACKAGE_ONLY_DURATIONS,
  allowedDurations,
  formatDurationLabel,
} from '@/lib/booking-durations';

describe('the ladder constants', () => {
  test('base ladder is half-hour steps from 1 to 3', () => {
    expect(BASE_DURATIONS).toEqual([1, 1.5, 2, 2.5, 3]);
  });

  test('the package-only rungs are whole 4 and 5', () => {
    expect(PACKAGE_ONLY_DURATIONS).toEqual([4, 5]);
  });

  test('the minimum booking is 1 hour', () => {
    expect(MIN_DURATION).toBe(1);
  });

  test('full ladder adds only whole 4 and 5, never 3.5 or 4.5', () => {
    expect(ALL_DURATIONS).toEqual([1, 1.5, 2, 2.5, 3, 4, 5]);
    expect(ALL_DURATIONS).not.toContain(3.5);
    expect(ALL_DURATIONS).not.toContain(4.5);
  });

  test('is ascending, so the last rung is always the longest that fits', () => {
    const sorted = [...ALL_DURATIONS].sort((a, b) => a - b);
    expect(ALL_DURATIONS).toEqual(sorted);
  });
});

describe('allowedDurations', () => {
  test('a bay-rate customer with plenty of headroom still stops at 3', () => {
    expect(allowedDurations({ maxHours: 5, hasActivePackage: false })).toEqual([1, 1.5, 2, 2.5, 3]);
  });

  test('a package holder with headroom gets 4 and 5', () => {
    expect(allowedDurations({ maxHours: 5, hasActivePackage: true })).toEqual([1, 1.5, 2, 2.5, 3, 4, 5]);
  });

  test('never offers more than the slot allows', () => {
    expect(allowedDurations({ maxHours: 2, hasActivePackage: true })).toEqual([1, 1.5, 2]);
    expect(allowedDurations({ maxHours: 1.5, hasActivePackage: false })).toEqual([1, 1.5]);
  });

  test('a package holder capped at 3.5 by the slot does not see 3.5', () => {
    expect(allowedDurations({ maxHours: 3.5, hasActivePackage: true })).toEqual([1, 1.5, 2, 2.5, 3]);
  });

  test('a package holder capped at 4.5 by the slot sees 4 but never 4.5', () => {
    expect(allowedDurations({ maxHours: 4.5, hasActivePackage: true })).toEqual([1, 1.5, 2, 2.5, 3, 4]);
  });

  test('always offers at least 1 hour, which is the minimum booking', () => {
    expect(allowedDurations({ maxHours: 1, hasActivePackage: false })).toEqual([1]);
    expect(allowedDurations({ maxHours: 0, hasActivePackage: false })).toEqual([1]);
    expect(allowedDurations({ maxHours: 0.5, hasActivePackage: true })).toEqual([1]);
  });

  test('never returns 3.5 or 4.5 for any maxHours the slots function can report', () => {
    for (const maxHours of [0, 1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5, 6]) {
      for (const hasActivePackage of [false, true]) {
        const rungs = allowedDurations({ maxHours, hasActivePackage });
        expect(rungs).not.toContain(3.5);
        expect(rungs).not.toContain(4.5);
      }
    }
  });

  test('does not mutate the exported ladders', () => {
    allowedDurations({ maxHours: 5, hasActivePackage: true }).push(99);
    expect(ALL_DURATIONS).toEqual([1, 1.5, 2, 2.5, 3, 4, 5]);
    expect(BASE_DURATIONS).toEqual([1, 1.5, 2, 2.5, 3]);
  });
});

describe('formatDurationLabel', () => {
  test('renders whole hours without a decimal and halves with one', () => {
    expect(formatDurationLabel(1)).toBe('1');
    expect(formatDurationLabel(1.5)).toBe('1.5');
    expect(formatDurationLabel(3)).toBe('3');
  });
});

describe('the bayAvailabilityByDuration key contract', () => {
  /**
   * `useBookingDetailsForm.getBayAvailabilityForDuration` reads the map with
   * `bayAvailabilityByDuration[dur.toString()]`, and the v3 SQL builds those
   * keys with `trim_scale(check_duration)::text`. trim_scale strips trailing
   * zeros, so it emits '1.5' rather than '1.50'. If these two ever disagree the
   * availability indicator silently renders nothing instead of erroring, so pin
   * the JS half of the contract here.
   */
  test('every rung stringifies to the trim_scale key v3 emits', () => {
    expect(ALL_DURATIONS.map((h) => h.toString())).toEqual([
      '1',
      '1.5',
      '2',
      '2.5',
      '3',
      '4',
      '5',
    ]);
  });
});
