/**
 * Tests for the promotion condition evaluator.
 *
 * The load-bearing case is the LAST describe block: an unrecognised condition
 * key must DENY. Before this module, `lib/cost-calculator.ts` read one key out
 * of the conditions jsonb and ignored the rest, so a row whose restriction was
 * misspelled did not become a narrower offer — it became a free hour for every
 * customer at every hour of every day. Staff edit these rows by hand.
 */
import {
  SUPPORTED_CONDITION_KEYS,
  bookingWeekdayToken,
  isPromotionEligible,
} from '@/lib/promotion-conditions';

/** Mon-Thu before 16:00 — the weekday off-peak B1G1's conditions verbatim. */
const WEEKDAY_OFFPEAK = {
  days_of_week: ['mon', 'tue', 'wed', 'thu'],
  start_time_before: '16:00',
};

const ctx = (date: string, startTime: string, isNewCustomer = false) => ({
  date,
  startTime,
  isNewCustomer,
});

describe('weekday is derived from the booking date, free of the runtime timezone', () => {
  // July 2026: 27th is a Monday, so the 26th is Sunday and the 1st a Wednesday.
  test.each([
    ['2026-07-26', 'sun'],
    ['2026-07-27', 'mon'],
    ['2026-07-28', 'tue'],
    ['2026-07-29', 'wed'],
    ['2026-07-30', 'thu'],
    ['2026-07-31', 'fri'],
    ['2026-08-01', 'sat'],
  ])('%s is a %s', (date, expected) => {
    expect(bookingWeekdayToken(date)).toBe(expected);
  });

  // The trap: `new Date('2026-07-27')` is UTC midnight, and `.getDay()` on it
  // reports the LOCAL weekday — the PREVIOUS day anywhere west of Greenwich. A
  // naive implementation is therefore correct on Vercel (UTC) and correct on
  // this repo's Bangkok dev machines (UTC+7), and shifts the entire offer by a
  // day the moment it runs west of Greenwich.
  //
  // That is awkward to test by moving the clock: Jest under jsdom does NOT
  // honour a mid-process `process.env.TZ` change (verified — the naive reading
  // stays put), so a timezone-swapping fixture here would pass while proving
  // nothing. These two tests pin the property directly instead.
  describe('the local-time calendar is never consulted', () => {
    test('no local-time Date getter is called', () => {
      // The precise trap, stated as a rule: reading the weekday off a Date's
      // LOCAL calendar is what breaks, so the implementation must not touch a
      // local getter at all. Deterministic on any host, unlike a TZ swap.
      const localGetters = ['getDay', 'getFullYear', 'getMonth', 'getDate'] as const;
      const spies = localGetters.map((name) => jest.spyOn(Date.prototype, name));
      try {
        for (const date of ['2026-07-26', '2026-07-27', '2026-02-31', 'not-a-date']) {
          bookingWeekdayToken(date);
          isPromotionEligible(WEEKDAY_OFFPEAK, ctx(date, '10:00'));
        }
        for (const spy of spies) expect(spy).not.toHaveBeenCalled();
      } finally {
        for (const spy of spies) spy.mockRestore();
      }
    });

    test('agrees with Zeller congruence, which uses no Date at all', () => {
      // An independent pure-integer reference. If the implementation ever
      // regresses to a local-calendar reading, this diverges on every host
      // whose offset pushes UTC midnight across a day boundary.
      const zeller = (y: number, m: number, d: number): string => {
        if (m < 3) { m += 12; y -= 1; }
        const K = y % 100;
        const J = Math.floor(y / 100);
        const h = (d + Math.floor((13 * (m + 1)) / 5) + K + Math.floor(K / 4) + Math.floor(J / 4) + 5 * J) % 7;
        return ['sat', 'sun', 'mon', 'tue', 'wed', 'thu', 'fri'][h];
      };

      // Every day across the promotion's whole validity window, plus a leap day.
      for (let day = new Date(Date.UTC(2026, 6, 1)); day < new Date(Date.UTC(2026, 8, 1)); day.setUTCDate(day.getUTCDate() + 1)) {
        const iso = day.toISOString().slice(0, 10);
        const [y, m, d] = iso.split('-').map(Number);
        expect(bookingWeekdayToken(iso)).toBe(zeller(y, m, d));
      }
      expect(bookingWeekdayToken('2024-02-29')).toBe(zeller(2024, 2, 29));
    });
  });

  test('a date that is not a real calendar date denies rather than rolling over', () => {
    // Date.UTC(2026, 1, 31) silently becomes 3 March, a confident wrong answer.
    expect(bookingWeekdayToken('2026-02-31')).toBeNull();
    expect(bookingWeekdayToken('not-a-date')).toBeNull();
    expect(isPromotionEligible(WEEKDAY_OFFPEAK, ctx('2026-02-31', '10:00'))).toBe(false);
  });
});

describe('the weekday off-peak window', () => {
  test.each([
    ['2026-07-27', 'mon', true],
    ['2026-07-28', 'tue', true],
    ['2026-07-29', 'wed', true],
    ['2026-07-30', 'thu', true],
    ['2026-07-31', 'fri', false],
    ['2026-08-01', 'sat', false],
    ['2026-07-26', 'sun', false],
  ])('%s (%s) at 10:00 → %s', (date, _day, expected) => {
    expect(isPromotionEligible(WEEKDAY_OFFPEAK, ctx(date, '10:00'))).toBe(expected);
  });

  // 16:00 is NOT a rate-tier boundary (those are 14:00 and 17:00) — it is an
  // ordinary clock time and is compared as one.
  test.each([
    ['09:00', true],
    ['13:30', true],
    ['15:30', true],
    ['15:59', true],
    ['16:00', false], // strictly before: the cutoff itself is excluded
    ['16:30', false],
    ['17:00', false],
    ['19:00', false],
  ])('Wednesday start %s → %s', (startTime, expected) => {
    expect(isPromotionEligible(WEEKDAY_OFFPEAK, ctx('2026-07-29', startTime))).toBe(expected);
  });

  test('the cutoff bounds the START only, so a long session may run past it', () => {
    // 15:30 + 3h ends at 18:30. The owner rule is about when the session
    // STARTS, and the free hour still prices at the tail.
    expect(isPromotionEligible(WEEKDAY_OFFPEAK, ctx('2026-07-29', '15:30'))).toBe(true);
  });

  test('an unreadable start time denies', () => {
    expect(isPromotionEligible(WEEKDAY_OFFPEAK, ctx('2026-07-29', '4pm'))).toBe(false);
    expect(isPromotionEligible(WEEKDAY_OFFPEAK, ctx('2026-07-29', '25:00'))).toBe(false);
    expect(isPromotionEligible(WEEKDAY_OFFPEAK, ctx('2026-07-29', ''))).toBe(false);
  });
});

describe('new_customer_only keeps working exactly as it did', () => {
  test('true restricts to new customers', () => {
    expect(isPromotionEligible({ new_customer_only: true }, ctx('2026-07-29', '10:00', true))).toBe(true);
    expect(isPromotionEligible({ new_customer_only: true }, ctx('2026-07-29', '10:00', false))).toBe(false);
  });

  test('false does not restrict', () => {
    expect(isPromotionEligible({ new_customer_only: false }, ctx('2026-07-29', '10:00', false))).toBe(true);
  });

  test('no conditions at all stays universally eligible', () => {
    expect(isPromotionEligible({}, ctx('2026-07-26', '23:00', false))).toBe(true);
    expect(isPromotionEligible(null, ctx('2026-07-26', '23:00', false))).toBe(true);
    expect(isPromotionEligible(undefined, ctx('2026-07-26', '23:00', false))).toBe(true);
  });
});

describe('conditions compose — every key must pass', () => {
  const newCustomerWeekday = { ...WEEKDAY_OFFPEAK, new_customer_only: true };

  test('a new customer on a Wednesday morning passes all three', () => {
    expect(isPromotionEligible(newCustomerWeekday, ctx('2026-07-29', '10:00', true))).toBe(true);
  });

  test('one failing key is enough to deny', () => {
    expect(isPromotionEligible(newCustomerWeekday, ctx('2026-07-29', '10:00', false))).toBe(false); // returning
    expect(isPromotionEligible(newCustomerWeekday, ctx('2026-08-01', '10:00', true))).toBe(false);  // Saturday
    expect(isPromotionEligible(newCustomerWeekday, ctx('2026-07-29', '18:00', true))).toBe(false);  // too late
  });
});

// ---------------------------------------------------------------------------
// The single most important behaviour in this module.
// ---------------------------------------------------------------------------
describe('an unrecognised condition DENIES, it never silently passes', () => {
  const MONDAY_0900 = ctx('2026-07-27', '09:00', true);

  test('a key that is not on the supported list denies outright', () => {
    expect(isPromotionEligible({ members_only: true }, MONDAY_0900)).toBe(false);
  });

  test.each([
    ['days_of_weeks', { days_of_weeks: ['mon'] }],
    ['start_time_befor', { start_time_befor: '16:00' }],
    ['new_customers_only', { new_customers_only: true }],
    ['dayOfWeek', { dayOfWeek: ['mon'] }],
  ])('a typo of a real key (%s) denies rather than widening the offer', (_name, conditions) => {
    expect(isPromotionEligible(conditions, MONDAY_0900)).toBe(false);
  });

  test('one unknown key poisons an otherwise valid set', () => {
    // Without this, the supported keys would pass and the unknown restriction
    // would be handed out for free.
    expect(isPromotionEligible({ ...WEEKDAY_OFFPEAK, max_duration: 2 }, MONDAY_0900)).toBe(false);
  });

  test.each([
    ['a non-boolean new_customer_only', { new_customer_only: 'true' }],
    ['a string days_of_week', { days_of_week: 'mon,tue' }],
    ['an empty days_of_week', { days_of_week: [] }],
    ['a misspelled day token', { days_of_week: ['mon', 'tues'] }],
    ['a numeric day', { days_of_week: [1, 2] }],
    ['a non-string start_time_before', { start_time_before: 1600 }],
    ['an unparseable start_time_before', { start_time_before: '4pm' }],
    ['an out-of-range start_time_before', { start_time_before: '25:00' }],
  ])('a malformed value under a supported key (%s) denies', (_name, conditions) => {
    expect(isPromotionEligible(conditions, MONDAY_0900)).toBe(false);
  });

  test('conditions that are not a key/value object deny', () => {
    expect(isPromotionEligible(['mon'] as unknown as Record<string, unknown>, MONDAY_0900)).toBe(false);
  });

  // `conditions` is jsonb with no CHECK constraint, so `false`, `0` and `""` are
  // all values a hand-edited row can hold. They are not objects and carry no
  // readable restriction, so they must deny like every other unreadable value.
  //
  // They are singled out because they are FALSY, and the null/undefined
  // shortcut at the top of `isPromotionEligible` used to be written `if
  // (!conditions) return true;` and placed AHEAD of the type check — so each of
  // these took the "no conditions at all" exit and came back universally
  // eligible. The module's one job, reached by its shortest path.
  test.each([
    ['false', false],
    ['0', 0],
    ['an empty string', ''],
    ['NaN', NaN],
  ])('a falsy non-object conditions value (%s) denies, it is not "no conditions"', (_name, conditions) => {
    expect(isPromotionEligible(conditions as unknown as Record<string, unknown>, MONDAY_0900)).toBe(false);
  });

  test.each([
    ['true', true],
    ['a number', 1],
    ['a string', 'new_customer_only'],
  ])('a truthy non-object conditions value (%s) denies too', (_name, conditions) => {
    expect(isPromotionEligible(conditions as unknown as Record<string, unknown>, MONDAY_0900)).toBe(false);
  });

  test('only null and undefined mean "no conditions"', () => {
    // The complete list, stated as one assertion so widening it is a deliberate
    // edit rather than a side effect of touching the guard.
    expect(isPromotionEligible(null, MONDAY_0900)).toBe(true);
    expect(isPromotionEligible(undefined, MONDAY_0900)).toBe(true);
    expect(isPromotionEligible({}, MONDAY_0900)).toBe(true);
  });

  test('day tokens are accepted case- and whitespace-insensitively', () => {
    // Staff type these by hand; casing is not a typo worth denying over,
    // whereas an unknown WORD still is (covered above).
    expect(isPromotionEligible({ days_of_week: [' MON '] }, MONDAY_0900)).toBe(true);
  });

  test('every supported key is actually implemented, not just listed', () => {
    // A key added to the allowlist but never given a branch would be a no-op
    // that silently passes — precisely the bug this module exists to stop.
    // Each key below must be able to DENY for at least one input; a key with no
    // branch could never deny anything.
    const denials: Record<string, Record<string, unknown>> = {
      new_customer_only: { new_customer_only: true },
      days_of_week: { days_of_week: ['sun'] },
      start_time_before: { start_time_before: '08:00' },
    };
    // A Monday 09:00 booking by a RETURNING customer fails each one in turn.
    const returningMonday = ctx('2026-07-27', '09:00', false);
    for (const key of SUPPORTED_CONDITION_KEYS) {
      expect(Object.keys(denials)).toContain(key);
      expect(isPromotionEligible(denials[key], returningMonday)).toBe(false);
    }
  });
});
