/**
 * Presentational value figures for the Play & Food set cards in the bay
 * booking flow. Pure module — no React — so the arithmetic is unit-testable.
 *
 * Two things this exists to get right:
 *
 *  1. **Per person comes from the party the customer actually selected.**
 *     `PlayFoodPackage.pricePerPerson` is `price / maxPeople`, i.e. it assumes
 *     five heads. Printing ฿240 to someone who picked two is a bait-and-switch,
 *     so the per-head figure is computed from `numberOfPeople` and from nothing
 *     else. That rule is the reason this module exists and must not be undone.
 *
 *     What HAS gone is the capacity figure this used to return alongside it —
 *     the "value curve", ฿420 each at 5 people. It was disclosure: the card led
 *     with a per-head price, so the five-head number it was NOT showing had to
 *     be named somewhere. The card now leads with the set total, which is the
 *     same number at every party size, so there is no per-head price to
 *     disclose against and the capacity figure was left arguing for a party the
 *     customer had not chosen, next to the one they had. See `SetMenuCard`.
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
  /** The party size the customer selected in this booking. */
  numberOfPeople: number;
  date: string;
  startTime: string;
}

export interface SetValueFigures {
  /** The set total split across the SELECTED party. Never `price / maxPeople`. */
  perPerson: number;
  /**
   * False whenever the split lands back on the total itself — at a party of
   * one, and at the defensive head counts `perPersonPrice` floors to one. The
   * card drops the qualifier in that case rather than print the same number
   * twice under two different labels, which is what the owner saw at a party
   * of one: "฿1,200 each at 1 person" above "Total ฿1,200 NET".
   *
   * Derived by comparing the figures rather than testing `numberOfPeople >= 2`,
   * so it states the actual condition (the two differ) instead of a proxy for
   * it that a rounding change could quietly break.
   */
  showPerPerson: boolean;
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
  numberOfPeople,
  date,
  startTime,
}: SetValueInput): SetValueFigures {
  const bay = bayOnlyCost({ date, startTime, durationHours: duration });
  const premium = bay === null ? null : price - bay;
  const perPerson = perPersonPrice(price, numberOfPeople);
  return {
    perPerson,
    showPerPerson: perPerson !== price,
    bayOnlyCost: bay,
    foodPremium: premium !== null && premium > 0 ? premium : null,
  };
}
