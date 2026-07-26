/**
 * Does a promotion's `conditions` jsonb apply to THIS booking?
 *
 * `public.promotions.conditions` is free-form jsonb that staff edit by hand.
 * Until now `lib/cost-calculator.ts` read exactly one key out of it,
 * `new_customer_only`, and ignored every other key silently. That is fine while
 * one row exists and fatal the moment a second one carries a restriction: an
 * unread `days_of_week` is not a narrower offer, it is a free hour handed to
 * everybody, every day. In this codebase the quote is a promise (staff charge
 * from the POS), so an over-applied condition is money.
 *
 * Two rules govern everything below.
 *
 * 1. UNKNOWN MEANS NO. The supported keys are enumerated in
 *    `SUPPORTED_CONDITION_KEYS` and anything else denies the promotion outright.
 *    A malformed VALUE under a supported key denies too. The failure mode this
 *    prevents is a typo: `days_of_weeks`, `start_time_befor`, `"mon,tue"`
 *    instead of `["mon","tue"]`. Under a permissive reader every one of those
 *    silently widens the offer to all customers at all times, which is the most
 *    expensive direction to be wrong in and the one nobody notices until the
 *    POS totals disagree with the quotes. Denying is visible immediately (the
 *    offer simply does not show) and costs nothing.
 *
 * 2. EVERYTHING IS EVALUATED AGAINST THE BOOKING, NEVER AGAINST `now()`.
 *    Someone browsing at 09:00 on a Monday for a 19:00 Saturday slot must not
 *    be shown a Monday-morning offer. Nothing in this file reads the clock.
 *
 * The keys are named so a non-programmer can read a row:
 *
 *   new_customer_only  true = only a customer making their first booking
 *   days_of_week       the booking's day must be one of these ("mon".."sun")
 *   start_time_before  the booking must START earlier than this "HH:mm"
 *
 * `{}` (or null) means no conditions and stays universally eligible, exactly as
 * it does today.
 */

/** Booking facts a condition may be evaluated against. Never the current time. */
export interface PromotionConditionContext {
  /** The BOOKING's date, `yyyy-MM-dd`, already venue-local (Bangkok). */
  date: string;
  /** The BOOKING's start time, `HH:mm`, already venue-local (Bangkok). */
  startTime: string;
  /** Whether this booking's customer is making their first booking. */
  isNewCustomer: boolean;
}

/**
 * The complete set of condition keys this evaluator understands. Adding a key
 * here without adding its branch to `isPromotionEligible` would make the key a
 * no-op that silently passes — the exact bug this module exists to stop — so
 * the two are kept adjacent and pinned by a test that walks this list.
 */
export const SUPPORTED_CONDITION_KEYS = [
  'new_customer_only',
  'days_of_week',
  'start_time_before',
] as const;

export type SupportedConditionKey = (typeof SUPPORTED_CONDITION_KEYS)[number];

const SUPPORTED_KEY_SET: ReadonlySet<string> = new Set(SUPPORTED_CONDITION_KEYS);

/**
 * Day tokens, indexed by `Date.prototype.getUTCDay()` (0 = Sunday). Lowercase
 * three-letter English because staff type these into a jsonb field by hand and
 * `["mon","tue","wed","thu"]` is readable in a way `[1,2,3,4]` is not — with
 * numbers there is no way to tell a 0-is-Sunday row from a 1-is-Monday one by
 * looking at it, and guessing wrong shifts the whole offer by a day.
 */
const DAY_TOKENS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const;

const DAY_TOKEN_SET: ReadonlySet<string> = new Set(DAY_TOKENS);

/**
 * The booking date's weekday token, or null if the string is not a real date.
 *
 * `date` is ALREADY venue-local — it is the `yyyy-MM-dd` the customer picked in
 * a Bangkok-time calendar and the value stored in `bookings.date`. So the
 * weekday must be read off the calendar fields themselves and never off a
 * `Date` built in the runtime's timezone.
 *
 * `new Date('2026-07-27')` parses as UTC midnight, and `.getDay()` then reports
 * the local weekday: on a host west of Greenwich that is the PREVIOUS day, so a
 * Monday offer would apply to Sunday bookings and not to Monday ones. Vercel
 * runs in UTC, which hides it in production and leaves it to surface on a
 * developer machine, or the day a runtime's timezone changes. `lib/b1g1-credit.ts`
 * carries the same trap in its header comment for the same reason.
 *
 * The fix is to do the whole thing in UTC arithmetic: build the date with
 * `Date.UTC` from the parsed fields and read `getUTCDay()`, which no host clock
 * can move. The round-trip check rejects a date that rolled over (`2026-02-31`
 * becomes 3 March, whose weekday would be a confident wrong answer).
 */
export function bookingWeekdayToken(date: string): string | null {
  const m = /^(\d{4})-(\d{1,2})-(\d{1,2})(?:\D|$)/.exec(date ?? '');
  if (!m) return null;

  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);

  const utc = new Date(Date.UTC(year, month - 1, day));
  if (Number.isNaN(utc.getTime())) return null;
  // Reject a rolled-over date rather than answer for a day the customer never
  // picked.
  if (
    utc.getUTCFullYear() !== year ||
    utc.getUTCMonth() !== month - 1 ||
    utc.getUTCDate() !== day
  ) {
    return null;
  }

  return DAY_TOKENS[utc.getUTCDay()];
}

/** `HH:mm` to minutes past midnight, or null when it is not a valid clock time. */
function parseClockMinutes(value: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(value ?? '');
  if (!m) return null;
  const hours = Number(m[1]);
  const minutes = Number(m[2]);
  if (hours > 23 || minutes > 59) return null;
  return hours * 60 + minutes;
}

/**
 * May this promotion apply to this booking?
 *
 * Returns false for anything it cannot positively verify — an unknown key, a
 * malformed value, an unreadable booking date or start time. See the module
 * header for why that direction is the safe one.
 */
export function isPromotionEligible(
  conditions: Record<string, unknown> | null | undefined,
  context: PromotionConditionContext,
): boolean {
  if (!conditions) return true;
  // A non-object `conditions` (an array, a string) is not something we can read
  // keys off meaningfully. Arrays are objects, so they are excluded explicitly.
  if (typeof conditions !== 'object' || Array.isArray(conditions)) return false;

  const keys = Object.keys(conditions);
  if (keys.length === 0) return true;

  // Rule 1, applied before any value is read: one unrecognised key is enough to
  // deny, because we cannot know whether it was meant to NARROW the offer.
  for (const key of keys) {
    if (!SUPPORTED_KEY_SET.has(key)) return false;
  }

  for (const key of keys as SupportedConditionKey[]) {
    const value = conditions[key];

    switch (key) {
      case 'new_customer_only': {
        // Unchanged semantics for the two shapes that exist in production
        // today: `true` restricts to new customers, absent does not restrict.
        // `false` reads as "not restricted", which is what it has always meant.
        // Anything that is not a boolean is a malformed row, not a `false`.
        if (typeof value !== 'boolean') return false;
        if (value && !context.isNewCustomer) return false;
        break;
      }

      case 'days_of_week': {
        if (!Array.isArray(value) || value.length === 0) return false;
        const allowed = new Set<string>();
        for (const entry of value) {
          if (typeof entry !== 'string') return false;
          const token = entry.trim().toLowerCase();
          if (!DAY_TOKEN_SET.has(token)) return false;
          allowed.add(token);
        }
        const today = bookingWeekdayToken(context.date);
        if (!today || !allowed.has(today)) return false;
        break;
      }

      case 'start_time_before': {
        if (typeof value !== 'string') return false;
        const cutoff = parseClockMinutes(value);
        if (cutoff === null) return false;
        const start = parseClockMinutes(context.startTime);
        if (start === null) return false;
        // Strictly before: a cutoff of "16:00" excludes a 16:00 start and
        // admits 15:30. The cutoff is NOT assumed to be a rate-tier boundary
        // (those are 14:00 and 17:00) — it is compared as a plain clock time.
        if (start >= cutoff) return false;
        break;
      }
    }
  }

  return true;
}
