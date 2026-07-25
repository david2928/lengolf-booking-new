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
 * Tile label: "1", "1.5", "3". No unit — the "Duration (in hours)" group label
 * carries it, and repeating "hr" seven times across a 7-tile row does not fit.
 */
export function formatDurationLabel(hours: number): string {
  return String(hours);
}
