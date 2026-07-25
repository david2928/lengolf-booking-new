/**
 * How much of a bay booking the customer's package actually pays for.
 *
 * This module owns the coverage arithmetic. `lib/cost-calculator.ts` remains the
 * only thing that decides what is CHARGED, but it consumes `coveredHours` from
 * here to size the covered head of the bay line, so the disclosure card and the
 * estimated total can never quote different amounts for the same booking.
 *
 * A caller that has no balance to give (LIFF, the confirmation screen replaying
 * a stored booking) omits it, and the calculator falls back to
 * eligibility-only coverage — the behaviour that predates this module.
 *
 * Three things this exists to get right:
 *
 *  1. **The uncovered portion is the TAIL, not the head.** Package hours are
 *     consumed from the start of the booking, so a 1.5 h booking from 13:00
 *     with 1 h of balance leaves 14:00–14:30 uncovered — priced at the
 *     AFTERNOON rate (฿750/h weekday), not the morning one. Pricing the head
 *     instead would understate the charge, which is the exact harm this slice
 *     is meant to remove.
 *
 *  2. **Prorating comes from `getRateSegments`,** the same primitive
 *     `cost-calculator.ts` prices the real booking with (and `play-food-value.ts`
 *     wraps for its bay anchor), so the tail figure can never disagree with the
 *     breakdown about a window straddling 14:00 or 17:00.
 *
 *  3. **The shortfall is scoped to what the package would otherwise cover.**
 *     An Early Bird package only covers hours before 14:00, and the calculator
 *     ALREADY charges the post-14:00 remainder as a separate line in the total.
 *     Counting that same time again here would double-bill it in the warning,
 *     so the shortfall is measured strictly inside the package-eligible window.
 *     The calculator composes the two limits — it charges from wherever the
 *     covered window ends, whether that is 14:00 or the balance running out —
 *     so `shortfallCost` is the *additional* amount balance-awareness adds to
 *     the estimate, not the whole charged tail.
 */
import { isWeekendDate, getRateSegments } from '@/lib/liff/bay-rates-data';

/**
 * Early Bird packages only cover hours before 14:00. Mirrors the constant and
 * the name-based detection in `lib/cost-calculator.ts` — the CRM gives us a
 * display name, not a structured flag.
 */
export const EARLY_BIRD_CUTOFF = 14;

/**
 * Smallest shortfall worth calling a shortfall, in hours (36 seconds).
 *
 * Deliberately a PHYSICAL threshold rather than float dust (1e-9). A CRM
 * `remaining_hours` is an arbitrary `numeric`, and an Early Bird eligible
 * window from a non-half-hour start is inexact (14 − 11.333… for an 11:20
 * start), so a balance that is exact to the customer can miss by ~1e-7 h. At
 * 1e-9 that survived as a warning reading "The remaining 0 hrs is ฿0" — a
 * self-contradicting scare over 0.4 seconds of bay time.
 *
 * Exported so `lib/cost-calculator.ts` uses the SAME threshold when it decides
 * whether a covered or charged window is worth its own line item. Two epsilons
 * would let the card and the breakdown disagree at the boundary.
 */
export const HOUR_EPSILON = 0.01;

export interface PackageCoverageInput {
  /** yyyy-MM-dd — decides weekday vs weekend rates. */
  date: string;
  /** HH:mm */
  startTime: string;
  duration: number;
  hasActivePackage: boolean;
  /** CRM name, e.g. `"Gold (30H)"`. Used only for Early Bird detection here. */
  packageDisplayName?: string;
  /** Hours left on the package. `null` when unknown or unlimited. */
  remainingHours: number | null;
  isUnlimited?: boolean;
  /**
   * A selected Play & Food set. When present the package does NOT apply — see
   * the note on the return type.
   */
  playFoodPackageId?: string | null;
}

export interface PackageCoverage {
  /** The booking's full length, echoed back so callers need not re-derive it. */
  bookingHours: number;
  /**
   * Hours of the booking the package is ELIGIBLE for before balance is
   * considered — equal to `bookingHours` normally, but capped at 14:00 for an
   * Early Bird package.
   *
   * The shortfall is measured strictly inside this window, which is what stops
   * the warning from double-counting time the calculator already charges as its
   * own line (an Early Bird booking's post-14:00 remainder).
   */
  eligibleHours: number;
  /**
   * True when the package is eligible for the whole booking, i.e. no rate-window
   * cap is in play. Callers use this to choose wording only — it must NOT gate
   * whether the shortfall is disclosed. When `false` (an Early Bird package),
   * `coveredHours + shortfallHours` is the pre-14:00 eligible window rather than
   * the booking, so copy for that case must not claim a booking total.
   */
  coversWholeBooking: boolean;
  /** Hours of this booking the package pays for. */
  coveredHours: number;
  /**
   * Hours inside the package-eligible window that the balance cannot cover.
   * `0` when the package comfortably covers the booking (State A).
   */
  shortfallHours: number;
  /**
   * Baht for the uncovered TAIL, prorated across rate boundaries. `null` when
   * there is no shortfall or the window cannot be priced.
   */
  shortfallCost: number | null;
  /** True when the package runs out mid-booking (State B). */
  isPartial: boolean;
  /** Balance after this booking. `null` for unlimited packages. */
  remainingAfter: number | null;
  isUnlimited: boolean;
}

/**
 * "HH:mm" → fractional hour (13:30 → 13.5). Null on anything not a real
 * wall-clock time.
 *
 * The bounds check matters because this module is a second, independently
 * callable entry point to the same rate arithmetic the calculator uses. Without
 * it `'25:00'` priced a window off the end of the day through
 * `getRateSegments`' open-ended final slot, and `'-1:00'` priced one before it.
 */
function parseStartHour(startTime: string): number | null {
  const [hourPart, minutePart] = (startTime ?? '').split(':');
  const hour = parseInt(hourPart, 10);
  if (!Number.isFinite(hour) || hour < 0 || hour > 23) return null;
  const minutes = minutePart === undefined ? 0 : parseInt(minutePart, 10);
  if (!Number.isFinite(minutes) || minutes < 0 || minutes > 59) return null;
  return hour + minutes / 60;
}

/**
 * Prorated cost of an arbitrary window, or null when it does not price to at
 * least one baht. The zero check is applied AFTER rounding: a sub-baht window
 * reduces to ฿0, and a "you owe ฿0" warning is worse than no warning.
 */
function windowCost(startHour: number, hours: number, isWeekend: boolean): number | null {
  if (!(hours > 0)) return null;
  const total = getRateSegments(startHour, hours).reduce(
    (sum, segment) =>
      sum + segment.hours * (isWeekend ? segment.rate.weekendPrice : segment.rate.weekdayPrice),
    0,
  );
  const rounded = Math.round(total);
  return rounded > 0 ? rounded : null;
}

/**
 * Returns `null` — meaning "show no package card at all" — when:
 *
 *  - the customer has no active package;
 *  - a **Play & Food set** is selected. Verified against
 *    `lib/cost-calculator.ts`: when `playFoodPackageId` is set, the play-food
 *    line REPLACES the bay-rate line and every package-coverage branch is
 *    skipped, so the set is charged at its set price and the package draws
 *    nothing down. Claiming coverage (or an overage) there would contradict the
 *    total;
 *  - the booking window or duration cannot be parsed;
 *  - the balance is unknown (`remainingHours === null` on a non-unlimited
 *    package). A fabricated 0 would fire a bogus overage warning;
 *  - the package is eligible for none of the booking (an Early Bird package
 *    booked entirely after 14:00).
 */
export function computePackageCoverage(input: PackageCoverageInput): PackageCoverage | null {
  const {
    date,
    startTime,
    duration,
    hasActivePackage,
    packageDisplayName,
    remainingHours,
    isUnlimited = false,
    playFoodPackageId,
  } = input;

  if (!hasActivePackage) return null;
  if (playFoodPackageId) return null;
  if (!(duration > 0)) return null;

  const startFraction = parseStartHour(startTime);
  if (startFraction === null) return null;

  // Early Bird packages stop covering at 14:00. Everything after that is
  // charged by the calculator as its own line item, so it is outside the
  // window this module measures a balance shortfall in.
  const isEarlyBird = packageDisplayName ? /early\s*bird/i.test(packageDisplayName) : false;
  const bookingEnd = startFraction + duration;
  const eligibleHours = isEarlyBird
    ? Math.max(0, Math.min(bookingEnd, EARLY_BIRD_CUTOFF) - startFraction)
    : duration;

  // An Early Bird package booked entirely after 14:00 pays for none of this
  // booking. Rendering the card anyway put a reassuring green "10 hrs left
  // after this booking" next to a fully-charged bay. The calculator already
  // pushes its "covers morning hours only (before 14:00)" note for exactly this
  // case, and that is the honest disclosure — so show no card.
  if (!(eligibleHours > HOUR_EPSILON)) return null;

  const coversWholeBooking = eligibleHours >= duration - HOUR_EPSILON;

  if (isUnlimited) {
    return {
      bookingHours: duration,
      eligibleHours,
      coversWholeBooking,
      coveredHours: eligibleHours,
      shortfallHours: 0,
      shortfallCost: null,
      isPartial: false,
      remainingAfter: null,
      isUnlimited: true,
    };
  }

  if (remainingHours === null || !Number.isFinite(remainingHours)) return null;

  const balance = Math.max(0, remainingHours);
  const coveredHours = Math.min(balance, eligibleHours);
  const shortfallHours = Math.max(0, eligibleHours - coveredHours);
  const isPartial = shortfallHours > HOUR_EPSILON;

  return {
    bookingHours: duration,
    eligibleHours,
    coversWholeBooking,
    coveredHours,
    shortfallHours: isPartial ? shortfallHours : 0,
    // The uncovered portion starts where the covered hours run out — pricing
    // from `startFraction` instead would charge the cheaper head of the
    // booking and understate the overage.
    shortfallCost: isPartial
      ? windowCost(startFraction + coveredHours, shortfallHours, isWeekendDate(date))
      : null,
    isPartial,
    remainingAfter: Math.max(0, balance - coveredHours),
    isUnlimited: false,
  };
}
