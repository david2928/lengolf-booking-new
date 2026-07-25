/**
 * Presentational value figures for the Play & Food set cards in the bay
 * booking flow. Pure module — no React — so the arithmetic is unit-testable.
 *
 * Two things this exists to get right:
 *
 *  1. **Per person comes from the party the customer actually selected.**
 *     `PlayFoodPackage.pricePerPerson` is `price / maxPeople`, i.e. it assumes
 *     five heads. Printing ฿240 to someone who picked two is a bait-and-switch,
 *     so the cards compute from `numberOfPeople` and disclose the capacity
 *     figure separately as the value curve ("฿420 each at 5 people").
 *
 *  2. **The bay-only anchor is generated, never hardcoded.** A set's persuasive
 *     number is what the same bay time would cost on its own — and that is
 *     genuinely weaker before 14:00 (฿550/h) than in the evening (฿750/h), so a
 *     fixed claim would be wrong for half the day. The bay figure comes from
 *     `getRateSegments`, the same prorating primitive `lib/cost-calculator.ts`
 *     prices the real booking with, so the two can never disagree about a
 *     window that straddles 14:00 or 17:00.
 *
 * Nothing here is authoritative: the charged amount is still whatever
 * `calculateCost` produces. These are display figures for the set cards.
 */
import { isWeekendDate, getRateSegments } from '@/lib/liff/bay-rates-data';

/**
 * Per-head price for a party of `people`. Rounds to whole baht, matching how
 * `getPlayFoodPackages()` rounds its own static `pricePerPerson`.
 *
 * Guards against 0 / negative / NaN head counts by falling back to 1 — the
 * people picker starts at 1 and cannot go lower, so this is defensive only, but
 * a division by zero here would render "฿Infinity each" on a price tag.
 */
export function perPersonPrice(totalPrice: number, people: number): number {
  const heads = Number.isFinite(people) && people >= 1 ? Math.floor(people) : 1;
  return Math.round(totalPrice / heads);
}

/** "HH:mm" → fractional hour (13:30 → 13.5). Returns null on unparseable input. */
function parseStartHour(startTime: string): number | null {
  const [hourPart, minutePart] = (startTime ?? '').split(':');
  const hour = parseInt(hourPart, 10);
  if (Number.isNaN(hour)) return null;
  const minutes = parseInt(minutePart ?? '0', 10);
  return hour + (Number.isNaN(minutes) ? 0 : minutes / 60);
}

export interface BayOnlyCostInput {
  /** yyyy-MM-dd — decides weekday vs weekend rates. */
  date: string;
  /** HH:mm */
  startTime: string;
  durationHours: number;
}

/**
 * What the same window would cost as a plain bay rental, prorated across the
 * 14:00 / 17:00 rate boundaries. Returns null when the slot cannot be priced
 * (missing or malformed date/time, non-positive duration) so callers can omit
 * the anchor rather than print ฿0.
 */
export function bayOnlyCost({ date, startTime, durationHours }: BayOnlyCostInput): number | null {
  if (!(durationHours > 0)) return null;
  const startHour = parseStartHour(startTime);
  if (startHour === null) return null;
  const isWeekend = isWeekendDate(date);
  const total = getRateSegments(startHour, durationHours).reduce(
    (sum, segment) =>
      sum + segment.hours * (isWeekend ? segment.rate.weekendPrice : segment.rate.weekdayPrice),
    0,
  );
  if (!(total > 0)) return null;
  return Math.round(total);
}

export interface SetValueInput {
  /** Set total, NET. */
  price: number;
  /** Set length in hours — also the window the bay anchor is priced over. */
  duration: number;
  /** The set's own capacity, read from the package rather than assumed to be 5. */
  maxPeople: number;
  /** The party size the customer selected in this booking. */
  numberOfPeople: number;
  date: string;
  startTime: string;
}

export interface SetValueFigures {
  /** Lead figure: the set total split across the selected party. */
  perPerson: number;
  /** The same split at the set's capacity — the honest upsell. */
  perPersonAtCapacity: number;
  maxPeople: number;
  /** False once the customer is already at capacity, where the curve says nothing. */
  showValueCurve: boolean;
  /** Bay-only cost for the same window, or null when it cannot be priced. */
  bayOnlyCost: number | null;
  /**
   * What the food and drinks add on top of the bay-only cost. Null whenever it
   * is zero or negative (or the bay figure is unavailable) — a set that is not
   * actually a premium over bay time has no anchor worth printing, and the
   * cards drop the line rather than claim a ฿0 or negative upgrade.
   */
  foodPremium: number | null;
}

export function setValueFigures({
  price,
  duration,
  maxPeople,
  numberOfPeople,
  date,
  startTime,
}: SetValueInput): SetValueFigures {
  const bay = bayOnlyCost({ date, startTime, durationHours: duration });
  const premium = bay === null ? null : price - bay;
  return {
    perPerson: perPersonPrice(price, numberOfPeople),
    perPersonAtCapacity: perPersonPrice(price, maxPeople),
    maxPeople,
    showValueCurve: numberOfPeople < maxPeople,
    bayOnlyCost: bay,
    foodPremium: premium !== null && premium > 0 ? premium : null,
  };
}
