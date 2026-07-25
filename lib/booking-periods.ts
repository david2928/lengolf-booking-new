/**
 * The single definition of "morning" / "afternoon" / "evening" for the
 * bay-booking time step.
 *
 * There used to be three, and they disagreed:
 *
 *  - the SQL function `get_available_slots_with_max_hours_v3` emitted a `period`
 *    field that split morning at hour < 12;
 *  - the customer-facing captions in `messages/*.json` were hardcoded strings
 *    reading "(09:00 - 13:00)" / "(13:00 - 17:00)" / "(17:00 - 23:00)";
 *  - `components/liff/booking/TimeSlotList.tsx` ignored the server field and
 *    recomputed the split at hour < 13.
 *
 * A 12:00 or 12:30 slot therefore landed under an "Afternoon (13:00 - 17:00)"
 * header on the web while showing under "Morning" on LINE — two slots a day,
 * every day, in both flows.
 *
 * 13:00 is the boundary. That is what the labels have always promised the
 * customer and what LIFF already computed; the SQL was the outlier. Nothing
 * reads the server `period` field any more — see the note at its definition in
 * `supabase/migrations/20260725120000_available_slots_v3_half_hour_durations.sql`.
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
 */
export function periodHourRange(period: BookingPeriod, date: string): PeriodHourRange {
  switch (period) {
    case 'morning':
      return { startHour: getOpeningHour(date), endHour: AFTERNOON_START_HOUR };
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
