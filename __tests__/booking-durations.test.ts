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
  bayTypeHeadroom,
  formatDurationLabel,
  type RungBayCounts,
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

/**
 * The duration ladder is capped by the CHOSEN bay type, not by the slot.
 *
 * The bug: `maxHours` is the headroom of whichever bay lasts longest. The v3
 * slots function sets it on every rung where ANY bay fits, and step 2 filters
 * slots on `socialBayCount` / `aiLabCount`, which the same function snapshots at
 * the 1-hour rung only. So a slot with Bay 4 free for one hour and booked for
 * the next reached step 3 as `maxHours: 5` with an AI Lab choice, the ladder
 * offered 2 hours, five surfaces stated "AI Lab", and `/api/bookings/create`
 * silently assigned a social bay. The customer found out from the email.
 *
 * The fix prevents the contradiction instead of warning about it, so what these
 * pin is that an unbookable rung is never OFFERED.
 */
describe('bayTypeHeadroom', () => {
  /** A rung both types can serve. */
  const both = (social: number, ai: number): RungBayCounts => ({ social, ai });

  /**
   * The reported failure, verbatim: three social bays throughout, Bay 4 free for
   * the first hour only, and a slot-level cap of 5.
   */
  const AI_LAB_RUNS_OUT: Record<string, RungBayCounts> = {
    '1': both(3, 1),
    '2': both(3, 0),
  };

  test('an AI Lab choice is capped at the last rung the AI Lab can serve', () => {
    expect(
      bayTypeHeadroom({
        bayAvailabilityByDuration: AI_LAB_RUNS_OUT,
        bayType: 'ai_lab',
        maxHours: 5,
      }),
    ).toBe(1);
  });

  test('the ladder that customer sees therefore has no rung the booking would downgrade', () => {
    // The whole composition `useBookingDetailsForm` performs. Before the cap,
    // this read [1, 1.5, 2, 2.5, 3] and picking 2 booked a social bay.
    const cap = bayTypeHeadroom({
      bayAvailabilityByDuration: AI_LAB_RUNS_OUT,
      bayType: 'ai_lab',
      maxHours: 5,
    });
    expect(allowedDurations({ maxHours: cap, hasActivePackage: false })).toEqual([1]);
    // Not even a package holder gets offered the longer rungs.
    expect(allowedDurations({ maxHours: cap, hasActivePackage: true })).toEqual([1]);
  });

  test('the other type in the same payload is unaffected', () => {
    // Social is free at both rungs this fixture carries, so it keeps all of it.
    expect(
      bayTypeHeadroom({
        bayAvailabilityByDuration: AI_LAB_RUNS_OUT,
        bayType: 'social',
        maxHours: 5,
      }),
    ).toBe(2);
  });

  test('"All Bays" is not narrowed — any bay genuinely will do', () => {
    for (const bayType of [null, undefined]) {
      expect(
        bayTypeHeadroom({
          bayAvailabilityByDuration: AI_LAB_RUNS_OUT,
          bayType,
          maxHours: 5,
        }),
      ).toBe(5);
    }
  });

  test('a payload with no breakdown keeps the slot cap — unknown is not unavailable', () => {
    for (const map of [undefined, null]) {
      expect(bayTypeHeadroom({ bayAvailabilityByDuration: map, bayType: 'ai_lab', maxHours: 3 }))
        .toBe(3);
    }
  });

  /**
   * `parseInt('1.5')` is 1. That exact mistake shipped on the LIFF surface and
   * made a 5-hour slot report 2, so it gets its own assertion here.
   */
  test('reads fractional keys as fractions, not as their leading integer', () => {
    const cap = bayTypeHeadroom({
      bayAvailabilityByDuration: { '1': both(3, 1), '1.5': both(3, 1) },
      bayType: 'ai_lab',
      maxHours: 1.5,
    });
    expect(cap).toBe(1.5);
    expect(cap).not.toBe(1);
  });

  /**
   * A JS object yields array-index-like keys numerically BEFORE string keys, so
   * `Object.entries` on a full breakdown gives 1, 2, 3, 1.5, 2.5 — not
   * ascending. Walking that order and stopping at the first unavailable rung is
   * how the LIFF flow lost three hours off a slot. This takes a running max, so
   * the answer cannot depend on the order at all.
   */
  test('does not depend on the order Object.entries happens to yield', () => {
    const scrambled: Record<string, RungBayCounts> = {
      '1': both(3, 1),
      '2': both(3, 1),
      '3': both(3, 0),
      '1.5': both(3, 1),
      '2.5': both(3, 1),
    };
    // Index-like keys really do come first, so this fixture exercises the trap.
    expect(Object.keys(scrambled)).toEqual(['1', '2', '3', '1.5', '2.5']);
    expect(
      bayTypeHeadroom({ bayAvailabilityByDuration: scrambled, bayType: 'ai_lab', maxHours: 3 }),
    ).toBe(2.5);
  });

  /**
   * Physically impossible — a bay free for two hours from `t` is necessarily
   * free for the first 1.5 of them, so per-type availability can only fall as
   * the rungs lengthen. The assertion is about the ALGORITHM: it must not be
   * relying on that monotonicity to compensate for reading the entries in
   * whatever order they arrive.
   */
  test('a hole in the middle does not truncate the answer', () => {
    expect(
      bayTypeHeadroom({
        bayAvailabilityByDuration: { '1': both(3, 1), '1.5': both(3, 0), '2': both(3, 1) },
        bayType: 'ai_lab',
        maxHours: 2,
      }),
    ).toBe(2);
  });

  test('narrows the slot cap but never widens it', () => {
    expect(
      bayTypeHeadroom({
        bayAvailabilityByDuration: { '1': both(3, 1), '2': both(3, 1), '3': both(3, 1) },
        bayType: 'ai_lab',
        maxHours: 2,
      }),
    ).toBe(2);
  });

  /**
   * One hour is always genuinely bookable for the chosen type: step 2 only
   * offers the slot because `socialBayCount` / `aiLabCount` — the 1-hour
   * snapshot — was above zero. So a breakdown that says otherwise is corrupt,
   * and the ladder must shorten rather than empty.
   */
  test('floors at the minimum booking rather than collapsing to nothing', () => {
    for (const map of [
      {} as Record<string, RungBayCounts>,
      { '1': both(3, 0), '2': both(3, 0) },
      { notANumber: both(3, 1) },
    ]) {
      const cap = bayTypeHeadroom({ bayAvailabilityByDuration: map, bayType: 'ai_lab', maxHours: 5 });
      expect(cap).toBe(MIN_DURATION);
      expect(allowedDurations({ maxHours: cap, hasActivePackage: false })).toEqual([MIN_DURATION]);
    }
  });

  test('survives a rung whose counts are missing entirely', () => {
    const ragged = { '1': both(3, 1), '2': undefined } as unknown as Record<string, RungBayCounts>;
    expect(() =>
      bayTypeHeadroom({ bayAvailabilityByDuration: ragged, bayType: 'ai_lab', maxHours: 2 }),
    ).not.toThrow();
    expect(
      bayTypeHeadroom({ bayAvailabilityByDuration: ragged, bayType: 'ai_lab', maxHours: 2 }),
    ).toBe(1);
  });

  /**
   * The real payload always carries a rung equal to `maxHours` — the v3 SQL
   * writes the breakdown entry and sets `max_hours` in the same branch — so a
   * type that is free throughout loses nothing to the cap.
   */
  test('a type free across the whole slot keeps the full slot headroom', () => {
    const full: Record<string, RungBayCounts> = {
      '1': both(3, 1),
      '1.5': both(3, 1),
      '2': both(3, 1),
      '2.5': both(3, 1),
      '3': both(3, 1),
    };
    for (const bayType of ['social', 'ai_lab'] as const) {
      expect(bayTypeHeadroom({ bayAvailabilityByDuration: full, bayType, maxHours: 3 })).toBe(3);
    }
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
