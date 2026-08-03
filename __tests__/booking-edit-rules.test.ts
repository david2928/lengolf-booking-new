/**
 * The rules governing a customer editing their own booking.
 *
 * Each block below pins a defect the previous (dead, never-called) modify route
 * actually shipped with, or a decision that is expensive to rediscover. The
 * point is that a future edit to `lib/booking-edit-rules.ts` has to argue with
 * a test rather than with a comment.
 */

import { format as formatDate } from 'date-fns';
import { ALL_DURATIONS } from '@/lib/booking-durations';
import {
  MIN_EDIT_NOTICE_HOURS,
  clampDuration,
  computeEditability,
  computeEndTime,
  deriveBayType,
  editDurationOptions,
  freeBaysFromAvailability,
  isCoachingBooking,
  isPlayFoodBooking,
  localCalendarDate,
  selectBayForEditedSlot,
} from '@/lib/booking-edit-rules';
import { parseBangkokDate } from '@/utils/date';

const SOCIAL = ['Bay 1', 'Bay 2', 'Bay 3'];
const AI_LAB = 'Bay 4';

describe('computeEndTime', () => {
  it('handles whole hours', () => {
    expect(computeEndTime('19:00', 2)).toBe('21:00');
  });

  /**
   * The bug this exists to prevent. The old route built its overlap window as
   * `${parseInt(hour) + duration}:${minutes}`, so a 1.5 h booking at 14:00
   * produced the string "15.5:00" and compared it lexicographically against
   * real times. Half-hour durations have been bookable since the v3 slots
   * function shipped, so this was live.
   */
  it('handles fractional durations without producing "15.5:00"', () => {
    expect(computeEndTime('14:00', 1.5)).toBe('15:30');
    expect(computeEndTime('14:30', 2.5)).toBe('17:00');
    expect(computeEndTime('09:30', 1.5)).toBe('11:00');
  });

  it('does not overflow past midnight into a 25th hour', () => {
    expect(computeEndTime('22:00', 3)).toBe('01:00');
  });

  it('returns the start unchanged rather than NaN on malformed input', () => {
    expect(computeEndTime('not-a-time', 2)).toBe('not-a-time');
  });
});

/**
 * The edit form holds its working date as a `yyyy-MM-dd` string and converts it
 * for exactly two consumers: the calendar widget and `date-fns`, both of which
 * read LOCAL getters.
 *
 * The first version used `parseBangkokDate` for that conversion. It is the right
 * instant and the wrong local day: in any browser west of +07 the modal opened
 * already "changed", fetched the previous day's slots, and submitted an edit one
 * day early — while the review screen, which renders through the Bangkok-pinned
 * next-intl formatter, showed both sides as the same date. Nothing on screen
 * disagreed with anything else, so there was no symptom until the booking moved.
 *
 * Invisible on a Bangkok dev machine, which is exactly why it is pinned here.
 */
describe('localCalendarDate — the date the customer actually submits', () => {
  const ZONES = ['UTC', 'America/New_York', 'Europe/London', 'Asia/Tokyo', 'Asia/Bangkok'];
  const originalTz = process.env.TZ;
  afterAll(() => {
    process.env.TZ = originalTz;
  });

  it.each(ZONES)('round-trips through date-fns unchanged in %s', (zone) => {
    process.env.TZ = zone;
    for (const iso of ['2026-08-10', '2026-01-01', '2026-12-31']) {
      expect(formatDate(localCalendarDate(iso), 'yyyy-MM-dd')).toBe(iso);
    }
  });

  it('is the fix for a real defect: parseBangkokDate does NOT round-trip', () => {
    // Documents the trap rather than the fix. `parseBangkokDate('2026-08-10')`
    // is 2026-08-09T17:00Z, whose local day is the 9th anywhere under +07.
    const instant = parseBangkokDate('2026-08-10');
    expect(instant.toISOString()).toBe('2026-08-09T17:00:00.000Z');
  });
});

/**
 * The duration ladder for an EDIT, and what happens when the current length is
 * no longer offered.
 *
 * This lived in the two components at first, which is precisely why it shipped
 * broken twice: neither version was reachable from a test. The first cut clamped
 * on mount and SHORTENED off-ladder bookings; the fix for that clamped to the
 * longest offered rung and LENGTHENED them instead — a 30-minute booking became
 * three hours (web) or five (LIFF) the moment the customer touched the date,
 * and the endpoint does not re-check package entitlement when a booking grows.
 *
 * Off-ladder lengths are ordinary in the data: 0.5, 1.5, 3.5 and 6 hour
 * bookings all exist, mostly staff-created.
 */
describe('editDurationOptions + clampDuration', () => {
  const web = (bookingDuration: number, headroom: number, isOriginalSlot: boolean) =>
    editDurationOptions({
      bookingDuration,
      headroom,
      isOriginalSlot,
      wholeHoursOnly: false,
      hasActivePackage: bookingDuration > 3,
      ladder: ALL_DURATIONS,
    });

  const liff = (bookingDuration: number, headroom: number, isOriginalSlot: boolean) =>
    editDurationOptions({
      bookingDuration,
      headroom,
      isOriginalSlot,
      wholeHoursOnly: true,
      hasActivePackage: false,
      ladder: ALL_DURATIONS,
    });

  describe('on mount, before availability loads', () => {
    // Headroom falls back to the booking's own duration at this point, and the
    // customer has not touched anything — nothing may change.
    it.each([0.5, 1.5, 3.5, 6])('leaves a %sh booking untouched on both surfaces', (d) => {
      expect(clampDuration(d, web(d, d, true))).toBe(d);
      expect(clampDuration(d, liff(d, d, true))).toBe(d);
    });
  });

  describe('after the customer picks a different slot', () => {
    // The booking's own duration is no longer offered, because it is no longer
    // demonstrably bookable. Whatever replaces it must never be LONGER.
    it.each([
      // 0.5 is the one exception: 1h is the minimum bookable session, so there
      // is nothing shorter to fall back to. See the invariant test below.
      [0.5, 1, 1],
      [1.5, 1.5, 1],
      [3.5, 3, 3],
      [6, 5, 5],
    ])('clamps %sh to %sh (web) and %sh (LIFF), never to a longer rung', (d, expectedWeb, expectedLiff) => {
      expect(clampDuration(d, web(d, 5, false))).toBe(expectedWeb);
      expect(clampDuration(d, liff(d, 5, false))).toBe(expectedLiff);
    });

    /**
     * The one case where the clamp is allowed to lengthen is a booking shorter
     * than the minimum bookable session. A 0.5 h booking is a staff-created
     * shape the customer could never have booked here, so moving it to a legal
     * slot has to round up to 1 h — there is nothing shorter to offer. That is
     * not silent: the review step renders it as a changed row (30 min → 1 hour)
     * and the customer confirms it explicitly.
     */
    it('never lengthens, except up to the 1h minimum when nothing shorter exists', () => {
      for (const d of [0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4, 5, 6]) {
        for (const headroom of [1, 1.5, 2, 3, 5]) {
          for (const options of [web(d, headroom, false), liff(d, headroom, false)]) {
            const result = clampDuration(d, options);
            if (d >= 1) {
              expect(result).toBeLessThanOrEqual(d);
            } else {
              expect(result).toBe(Math.min(...options));
            }
          }
        }
      }
    });

    it('shortens to fit a narrower slot', () => {
      expect(clampDuration(3, web(3, 1.5, false))).toBe(1.5);
      expect(clampDuration(3, liff(3, 2, false))).toBe(2);
    });
  });

  it('offers the package rungs only to a booking already longer than 3h', () => {
    expect(web(2, 5, false)).not.toContain(5);
    expect(web(4, 5, false)).toContain(5);
  });

  it('offers whole hours only on LIFF, matching its create flow', () => {
    expect(liff(2, 5, false)).toEqual([1, 2, 3, 4, 5]);
  });

  it('is never empty, so the picker cannot render with no options', () => {
    expect(web(1, 0, false).length).toBeGreaterThan(0);
    expect(liff(1, 0, false).length).toBeGreaterThan(0);
  });

  /** The clamp must reach a fixed point in one step, or the effect that calls it loops. */
  it('is idempotent', () => {
    for (const d of [0.5, 1.5, 3.5, 6]) {
      const options = web(d, 5, false);
      const once = clampDuration(d, options);
      expect(clampDuration(once, options)).toBe(once);
    }
  });
});

describe('deriveBayType', () => {
  it('reads the canonical bay keys', () => {
    expect(deriveBayType('Bay 1')).toBe('social');
    expect(deriveBayType('Bay 4')).toBe('ai_lab');
  });

  it('falls back for display names written by other surfaces', () => {
    expect(deriveBayType('Bay 1 (Bar)')).toBe('social');
    expect(deriveBayType('LENGOLF AI Lab')).toBe('ai_lab');
  });

  it('is null for a booking with no bay yet', () => {
    expect(deriveBayType(null)).toBeNull();
    expect(deriveBayType(undefined)).toBeNull();
    expect(deriveBayType('')).toBeNull();
  });
});

describe('selectBayForEditedSlot', () => {
  it('keeps the current bay when it is free at the new time', () => {
    const result = selectBayForEditedSlot({
      currentBay: 'Bay 2',
      freeBays: ['Bay 1', 'Bay 2', 'Bay 3'],
    });
    expect(result.bay).toBe('Bay 2');
  });

  it('moves to another social bay when the current one is taken', () => {
    const result = selectBayForEditedSlot({ currentBay: 'Bay 2', freeBays: ['Bay 3'] });
    expect(result.bay).toBe('Bay 3');
  });

  /**
   * Matches what `/api/bookings/create` already does for a social preference:
   * prefer the type, but take the AI Lab rather than refuse the booking. A
   * social customer loses nothing by sitting in Bay 4.
   */
  it('lets a social booking fall back to the AI Lab when every social bay is full', () => {
    const result = selectBayForEditedSlot({ currentBay: 'Bay 1', freeBays: [AI_LAB] });
    expect(result.bay).toBe(AI_LAB);
  });

  /**
   * The asymmetry is the point. Someone who booked the AI Lab booked it for the
   * swing-analysis cameras; moving them to a social bay silently delivers a
   * different product under the same booking id.
   */
  it('NEVER moves an AI Lab booking to a social bay', () => {
    const result = selectBayForEditedSlot({ currentBay: AI_LAB, freeBays: SOCIAL });
    expect(result.bay).toBeNull();
    // Free bays existed, just not of the right type — the UI says "the AI Lab is
    // booked then", not the flatly wrong "nothing is free".
    expect(result.otherBayTypeAvailable).toBe(true);
  });

  it('reports nothing free when the venue is genuinely full', () => {
    const result = selectBayForEditedSlot({ currentBay: 'Bay 1', freeBays: [] });
    expect(result.bay).toBeNull();
    expect(result.otherBayTypeAvailable).toBe(false);
  });

  it('prefers social order for a booking that somehow has no bay', () => {
    const result = selectBayForEditedSlot({
      currentBay: null,
      freeBays: [AI_LAB, 'Bay 3'],
    });
    expect(result.bay).toBe('Bay 3');
  });
});

describe('freeBaysFromAvailability', () => {
  it('reads the jsonb map', () => {
    expect(
      freeBaysFromAvailability({ 'Bay 1': true, 'Bay 2': false, 'Bay 3': true, 'Bay 4': false })
    ).toEqual(['Bay 1', 'Bay 3']);
  });

  /** PostgREST sometimes wraps a jsonb result in a single-element array. */
  it('unwraps the array form PostgREST occasionally returns', () => {
    expect(freeBaysFromAvailability([{ 'Bay 1': true, 'Bay 2': false }])).toEqual(['Bay 1']);
  });

  it('is empty rather than throwing on a null or malformed answer', () => {
    expect(freeBaysFromAvailability(null)).toEqual([]);
    expect(freeBaysFromAvailability('nonsense')).toEqual([]);
  });
});

describe('isCoachingBooking', () => {
  it('matches the canonical form and the bare legacy one', () => {
    expect(isCoachingBooking('Coaching (Min)')).toBe(true);
    expect(isCoachingBooking('Coaching')).toBe(true);
    expect(isCoachingBooking('coaching (Boss - Ratchavin)')).toBe(true);
  });

  it('does not match ordinary bookings', () => {
    expect(isCoachingBooking('Normal Bay Rate')).toBe(false);
    expect(isCoachingBooking('Package')).toBe(false);
    expect(isCoachingBooking(null)).toBe(false);
  });
});

describe('isPlayFoodBooking', () => {
  it('matches on booking type and on the SET_ package naming', () => {
    expect(isPlayFoodBooking('Play_Food_Package', null)).toBe(true);
    expect(isPlayFoodBooking('Normal Bay Rate', 'SET_A')).toBe(true);
  });

  it('leaves ordinary packages alone', () => {
    expect(isPlayFoodBooking('Package', 'Diamond+ (Unlimited, 3 months)')).toBe(false);
  });
});

describe('computeEditability', () => {
  // 2026-08-03 10:00 Bangkok, expressed as the instant it actually is.
  const now = new Date('2026-08-03T03:00:00Z');

  const base = {
    status: 'confirmed',
    date: '2026-08-03',
    start_time: '19:00',
    booking_type: 'Normal Bay Rate',
    now,
  };

  it('allows a confirmed future booking', () => {
    expect(computeEditability(base)).toEqual({ canEdit: true });
  });

  it('refuses anything not confirmed', () => {
    expect(computeEditability({ ...base, status: 'cancelled' })).toEqual({
      canEdit: false,
      reason: 'NOT_CONFIRMED',
    });
    expect(computeEditability({ ...base, status: 'completed' }).canEdit).toBe(false);
  });

  /** Bay availability is not coach availability. */
  it('refuses coaching bookings', () => {
    expect(computeEditability({ ...base, booking_type: 'Coaching (Min)' })).toEqual({
      canEdit: false,
      reason: 'COACHING_NOT_EDITABLE',
    });
  });

  it('refuses a booking that has already started', () => {
    expect(computeEditability({ ...base, start_time: '09:00' })).toEqual({
      canEdit: false,
      reason: 'BOOKING_IN_PAST',
    });
  });

  /**
   * The timezone trap, and the reason this does not use `new Date(y, m-1, d, …)`.
   * Stored times are Bangkok wall clock; parsed in the runtime's zone they land
   * seven hours out on Vercel, which is UTC. A 09:00 booking would still look
   * editable at 10:00 Bangkok — i.e. an hour after it started.
   *
   * Pinning the process to UTC here is what makes the assertion meaningful: on a
   * Bangkok dev machine the broken form passes too.
   */
  describe('under a UTC runtime (as on Vercel)', () => {
    const originalTz = process.env.TZ;
    beforeAll(() => {
      process.env.TZ = 'UTC';
    });
    afterAll(() => {
      process.env.TZ = originalTz;
    });

    it('still treats a same-morning booking as started', () => {
      expect(computeEditability({ ...base, start_time: '09:00' }).reason).toBe('BOOKING_IN_PAST');
    });

    it('still treats a later-today booking as editable', () => {
      expect(computeEditability({ ...base, start_time: '19:00' }).canEdit).toBe(true);
    });
  });

  it('refuses a booking missing its date or time rather than crashing', () => {
    expect(computeEditability({ ...base, date: null }).canEdit).toBe(false);
    expect(computeEditability({ ...base, start_time: null }).canEdit).toBe(false);
  });

  /**
   * Owner-confirmed: editing stays open right up to the start time, matching the
   * cancel rule. If that ever changes, this is the test that should fail first.
   */
  it('has no minimum notice window today', () => {
    expect(MIN_EDIT_NOTICE_HOURS).toBe(0);

    const oneMinuteBefore = new Date('2026-08-03T11:59:00Z'); // 18:59 Bangkok
    expect(
      computeEditability({ ...base, start_time: '19:00', now: oneMinuteBefore }).canEdit
    ).toBe(true);
  });
});
