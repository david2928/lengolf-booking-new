/**
 * Bookable session lengths, in hours.
 *
 * Owner-confirmed 25 Jul 2026. Half-hour steps run from the 1-hour minimum to
 * 3 hours for everyone. 4 and 5 hours are offered only to customers with an
 * active package, because in the 180 days to 25 Jul 2026 not one booking of
 * 4 hours or longer was paid at the walk-up bay rate: all 46 were package
 * holders coming through the customer flow.
 *
 * 3.5 and 4.5 are deliberately absent, and "completing the sequence" would be a
 * regression, not a tidy-up. Evidence from the same 180 days: between them they
 * accounted for THREE paid bay-rate bookings, and roughly half of their volume
 * was staff bay blocks created in the POS — a surface this ladder does not
 * serve at all. Two extra tiles on every customer's picker to serve three
 * bookings is a bad trade. If that ever changes, change it here and in the SQL
 * array together, and re-check the picker layout: the tile grid is sized from
 * the length of this ladder.
 *
 * The gate is `hasActivePackage`, not a package name. The 4 h and 5 h users
 * observed were Unlimited and Early Bird holders, but that is a fact about who
 * happened to book long, not a rule about who should be allowed to.
 *
 * Keep this in step with the ladder in
 * supabase/migrations/20260725120000_available_slots_v3_half_hour_durations.sql
 * (`duration_ladder numeric[] := ARRAY[1, 1.5, 2, 2.5, 3, 4, 5]`). The SQL
 * probes bay availability for exactly these values and keys
 * `bayAvailabilityByDuration` by them, so a value here that the SQL does not
 * probe would render a tile with no availability data behind it.
 */

import type { BayType } from './bayConfig';

/** Offered to every customer. Ascending. */
export const BASE_DURATIONS = [1, 1.5, 2, 2.5, 3] as const;

/** Offered additionally to customers with an active package. Ascending. */
export const PACKAGE_ONLY_DURATIONS = [4, 5] as const;

/** Every value the availability function probes. Ascending. */
export const ALL_DURATIONS: number[] = [...BASE_DURATIONS, ...PACKAGE_ONLY_DURATIONS];

/**
 * The minimum booking length. Enforced in SQL by the `remaining_minutes < 60`
 * skip, which is why a slot that cannot fit an hour never reaches the picker.
 */
export const MIN_DURATION = 1;

interface AllowedDurationsInput {
  /**
   * Longest bookable session at this slot, from the availability function.
   * Fractional since v3 (e.g. 2.5).
   */
  maxHours: number;
  /** True when the customer has a non-coaching package with hours remaining. */
  hasActivePackage: boolean;
}

/**
 * The durations to render for this customer at this slot, ascending.
 *
 * Always returns at least `[MIN_DURATION]` so the picker is never empty. A slot
 * that cannot fit an hour is filtered out upstream and never reaches step 3, so
 * the fallback is a guard against a nonsense `maxHours` (0, NaN from a bad
 * parse) rendering a duration section with no tiles in it.
 *
 * Returns a fresh array every call; callers are free to sort or slice it.
 */
export function allowedDurations({ maxHours, hasActivePackage }: AllowedDurationsInput): number[] {
  const ladder = hasActivePackage ? ALL_DURATIONS : BASE_DURATIONS;
  const fits = ladder.filter((hours) => hours <= maxHours);
  return fits.length > 0 ? fits : [MIN_DURATION];
}

/**
 * One rung of `TimeSlot.bayAvailabilityByDuration`, as much of it as this module
 * reads. Structural on purpose: the wire type is `DurationBayAvailability` in
 * the availability hook, and `lib/` must not import from `app/`.
 */
export interface RungBayCounts {
  /** Social bays (1, 2, 3) free for the WHOLE of that rung. */
  social: number;
  /** AI Lab bays (Bay 4) free for the whole of that rung. */
  ai: number;
}

interface BayTypeHeadroomInput {
  /** `TimeSlot.bayAvailabilityByDuration`. Absent on a partial payload. */
  bayAvailabilityByDuration?: Record<string, RungBayCounts> | null;
  /** The bay chosen on step 2. `null`/`undefined` is "All Bays" — no preference. */
  bayType?: BayType | null;
  /** The slot's own cap (`TimeSlot.maxHours`). Only ever narrowed, never widened. */
  maxHours: number;
}

/**
 * The longest session the CHOSEN bay type can actually serve at this slot.
 *
 * `maxHours` alone is NOT that number, which is the bug this exists to close.
 * The v3 slots function sets `max_hours := check_duration` on every rung where
 * `bay_available_count > 0` — i.e. wherever ANY bay fits — and step 2 filters
 * slots on `socialBayCount` / `aiLabCount`, which the same function snapshots at
 * the 1-hour rung only. So a slot where Bay 4 is free for one hour and booked
 * for the next reaches step 3 with `maxHours: 5` and an AI Lab choice, the
 * ladder offers 2 hours, five surfaces state "AI Lab", and
 * `/api/bookings/create` quietly assigns a social bay instead. The customer
 * finds out from the confirmation email.
 *
 * Capping the ladder here prevents the contradiction rather than warning about
 * it: a rung the chosen type cannot serve is never offered, so nothing on
 * screen can promise a bay the booking will not get.
 *
 * "All Bays" (`null`) is a real answer meaning no preference, and any bay
 * genuinely will do — so it is not narrowed at all. Neither is a slot whose
 * payload carries no breakdown; unknown is not the same as unavailable, and
 * `maxHours` is the same cap the flow used before this function existed.
 *
 * Two traps in the map itself, both silent, both already paid for once on the
 * LIFF surface:
 *
 *  - Keys are STRINGIFIED FRACTIONAL HOURS ('1', '1.5', '2.5'), so `parseFloat`
 *    and never `parseInt` — `parseInt('1.5')` is 1, which reads a fractional
 *    rung as a shorter one.
 *  - JS orders array-index-like keys numerically BEFORE string keys, so
 *    `Object.entries` yields 1, 2, 3, 4, 5, 1.5, 2.5 — not ascending. This
 *    takes a running MAX over every qualifying rung rather than walking the
 *    entries and stopping at the first gap, so the answer cannot depend on
 *    iteration order at all.
 *
 * Floors at `MIN_DURATION`: the slot only reached step 3 because step 2's
 * filter found a bay of the chosen type free for an hour, so one hour is always
 * genuinely bookable, and a garbage map must shorten the ladder rather than
 * empty it.
 */
export function bayTypeHeadroom({
  bayAvailabilityByDuration,
  bayType,
  maxHours,
}: BayTypeHeadroomInput): number {
  if (!bayType || !bayAvailabilityByDuration) return maxHours;

  const countKey = bayType === 'ai_lab' ? 'ai' : 'social';
  let headroom = MIN_DURATION;

  for (const [rung, counts] of Object.entries(bayAvailabilityByDuration)) {
    const hours = parseFloat(rung);
    if (!Number.isFinite(hours)) continue;
    if (!((counts?.[countKey] ?? 0) > 0)) continue;
    if (hours > headroom) headroom = hours;
  }

  // Narrowing only. A breakdown that somehow reported a longer rung than the
  // slot's own cap must not be able to offer a duration the server rejects.
  return Math.min(headroom, maxHours);
}

/**
 * Tile label: "1", "1.5", "3". No unit — the "Duration (in hours)" group label
 * carries it, and repeating "hr" seven times across a 7-tile row does not fit.
 */
export function formatDurationLabel(hours: number): string {
  return String(hours);
}
