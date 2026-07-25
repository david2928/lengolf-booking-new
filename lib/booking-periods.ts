/**
 * The single definition of "morning" / "afternoon" / "evening" for the
 * bay-booking time step.
 *
 * There used to be four, and they disagreed:
 *
 *  - the SQL function `get_available_slots_with_max_hours_v3` (defined in
 *    `supabase/migrations/20260725120000_available_slots_v3_half_hour_durations.sql`)
 *    emitted a `period` field whose CASE split the morning at
 *    `slot_hour_part < 12`;
 *  - the customer-facing captions in `messages/*.json` were hardcoded strings
 *    reading "(09:00 - 13:00)" / "(13:00 - 17:00)" / "(17:00 - 23:00)";
 *  - `components/liff/booking/TimeSlotList.tsx` ignored the server field and
 *    recomputed the split at hour < 13;
 *  - an orphaned `TimeSlot` interface under the bookings feature folder
 *    re-declared `period` as a required field. Nothing imported it; it has
 *    been deleted.
 *
 * A 12:00 or 12:30 slot therefore landed under an "Afternoon (13:00 - 17:00)"
 * header on the web while showing under "Morning" on LINE — two slots a day,
 * every day, in both flows.
 *
 * 13:00 is the boundary. That is what the labels have always promised the
 * customer and what LIFF already computed; the SQL's hour-12 split was the
 * outlier. That function is applied in production and its file is left
 * byte-untouched as a record of what ran; the `period` column it returns is
 * now vestigial and no client reads it. Do not resurrect it as a source of
 * truth.
 *
 * The point of this module is that the grouping and the caption cannot drift
 * apart again: `getBookingPeriod` and `periodHourRange` read the SAME constants,
 * and the caption's numerals reach `messages/*.json` as ICU arguments rather
 * than being baked into the translated string.
 */
import { getOpeningHour } from '@/lib/opening-hours';

/** Ordered earliest-first. Consumers rely on that ordering. */
export const BOOKING_PERIODS = ['morning', 'afternoon', 'evening'] as const;

export type BookingPeriod = (typeof BOOKING_PERIODS)[number];

/**
 * Hour at which the afternoon begins, and therefore the hour the morning ends.
 * Both the grouping test and the displayed caption derive from this constant —
 * that is the whole point. Changing it moves both together.
 */
export const AFTERNOON_START_HOUR = 13;

/** Hour at which the evening begins, and therefore the hour the afternoon ends. */
export const EVENING_START_HOUR = 17;

/**
 * Last bookable hour. Matches `p_end_hour: 23` in `app/api/availability/route.ts`.
 */
export const CLOSING_HOUR = 23;

/**
 * Buckets an `HH:mm` start time into its part of the day.
 *
 * The morning has no lower bound here: the venue's opening hour varies by date
 * (see `getOpeningHour`) and the availability API never returns a slot before
 * it, so anything earlier than {@link AFTERNOON_START_HOUR} is morning.
 *
 * A malformed time buckets into 'morning' rather than throwing — this runs
 * inside a render, and a mis-grouped slot beats a blank step.
 */
export function getBookingPeriod(startTime: string): BookingPeriod {
  const hour = Number.parseInt(startTime.split(':')[0], 10);
  if (Number.isNaN(hour)) return 'morning';
  if (hour < AFTERNOON_START_HOUR) return 'morning';
  if (hour < EVENING_START_HOUR) return 'afternoon';
  return 'evening';
}

export interface PeriodHourRange {
  /** Inclusive first hour of the period. */
  startHour: number;
  /** Exclusive last hour — i.e. the first hour of the NEXT period. */
  endHour: number;
}

/**
 * The hour span a period covers on a given date.
 *
 * `date` is a `yyyy-MM-dd` string because the morning's start is the venue's
 * opening hour, which is date-dependent: `getOpeningHour` returns 10 before
 * 2026-04-01 and 9 on/after it. Hardcoding "09:00" in the caption would be a
 * lie on any date the venue opens later.
 *
 * @throws if the opening hour is at or after {@link AFTERNOON_START_HOUR}.
 */
export function periodHourRange(period: BookingPeriod, date: string): PeriodHourRange {
  switch (period) {
    case 'morning': {
      const startHour = getOpeningHour(date);
      // Both current regimes (9 and 10) sit safely before 13, so this cannot
      // fire today. It is here because nothing else enforces it, and the two
      // silent alternatives are both worse than a crash:
      //
      //  - printing the range as-is gives "(13:00 - 13:00)" or an inverted
      //    "(14:00 - 13:00)" — a caption that says nothing is bookable above a
      //    list of bookable times;
      //  - clamping the start below 13 advertises an opening hour the venue
      //    does not have, which is the exact class of lie this module was
      //    written to kill.
      //
      // A venue opening at or after 13:00 has no morning at all. That is a
      // change to the period MODEL — the three buckets would need redrawing —
      // not something `periodHourRange` can paper over. Fail loudly at the
      // first render so whoever edits `lib/opening-hours.ts` sees it here
      // rather than in production.
      if (startHour >= AFTERNOON_START_HOUR) {
        throw new RangeError(
          `Opening hour ${startHour} is at or after AFTERNOON_START_HOUR (${AFTERNOON_START_HOUR}) ` +
            `on ${date}: there is no morning period to describe. Redraw the period buckets in ` +
            `lib/booking-periods.ts rather than widening this range.`,
        );
      }
      return { startHour, endHour: AFTERNOON_START_HOUR };
    }
    case 'afternoon':
      return { startHour: AFTERNOON_START_HOUR, endHour: EVENING_START_HOUR };
    case 'evening':
      return { startHour: EVENING_START_HOUR, endHour: CLOSING_HOUR };
  }
}

/** `9` -> `"09:00"`. */
export function formatPeriodHour(hour: number): string {
  return `${String(hour).padStart(2, '0')}:00`;
}

/**
 * ICU arguments for the `bookings.timeStep.periodHours` message, which is
 * `"({start} - {end})"` in every catalog. The numerals come from the constants
 * above so the header caption can never contradict the grouping.
 */
export function periodHourCaptionArgs(
  period: BookingPeriod,
  date: string,
): { start: string; end: string } {
  const { startHour, endHour } = periodHourRange(period, date);
  return { start: formatPeriodHour(startHour), end: formatPeriodHour(endHour) };
}
