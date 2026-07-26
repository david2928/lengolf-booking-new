/**
 * The figures the Play & Food set cards print in the booking flow.
 *
 * Two properties matter more than the exact numbers:
 *
 *  1. Per person is computed from the party the customer SELECTED, never from
 *     `PlayFoodPackage.pricePerPerson` (which is `price / maxPeople`, i.e. it
 *     always assumes five heads). Showing the five-head figure to a party of two
 *     would be a bait-and-switch. This survived the card's simplification: the
 *     capacity figure it used to return beside it did not, because the card now
 *     leads with the set TOTAL and a per-head figure is only printed when it
 *     differs from that total. `showPerPerson` is that condition.
 *  2. The bay-only anchor is GENERATED from the slot, not hardcoded. Bay time is
 *     genuinely cheaper before 14:00 (฿550/h weekday) than in the evening
 *     (฿750/h), so the same set has a different anchor depending on when the
 *     customer is booking — a fixed claim would be wrong half the day.
 *
 * No pricing API is loaded under Jest, so `getRates()` falls back to the
 * hardcoded defaults in `lib/liff/bay-rates-data.ts`:
 *   weekday 550 / 750 / 750 and weekend 750 / 950 / 950
 * for the before-14:00, 14:00–17:00 and 17:00–23:00 slots.
 */
import {
  bayOnlyCost,
  everySetIncludesUnlimitedDrinks,
  perPersonPrice,
  setValueFigures,
} from '@/lib/play-food-value';
import { getPlayFoodPackages, type PlayFoodPackage } from '@/types/play-food-packages';

const WEEKDAY = '2026-07-15'; // Wednesday
const WEEKEND = '2026-07-18'; // Saturday

const SET_A = getPlayFoodPackages().find((p) => p.id === 'SET_A')!;
const SET_B = getPlayFoodPackages().find((p) => p.id === 'SET_B')!;
const SET_C = getPlayFoodPackages().find((p) => p.id === 'SET_C')!;

describe('perPersonPrice uses the selected party size, not the set capacity', () => {
  test('SET B at 5 people matches the capacity figure the data carries', () => {
    expect(perPersonPrice(SET_B.price, 5)).toBe(SET_B.pricePerPerson);
  });

  test('SET B at 2 people is ฿1,050 each — NOT the ฿420 five-head figure', () => {
    expect(perPersonPrice(SET_B.price, 2)).toBe(1050);
    expect(perPersonPrice(SET_B.price, 2)).not.toBe(SET_B.pricePerPerson);
  });

  test('a party of one pays the whole set price', () => {
    expect(perPersonPrice(SET_B.price, 1)).toBe(SET_B.price);
  });

  // Derived from SET_C.price rather than a hardcoded array: the behaviour under
  // test is "distinct and descending, anchored at the ends", which holds at any
  // price. Pinning the literals meant a price correction broke this test while
  // the function was working perfectly (Set C moved ฿2,975 -> ฿3,500 on
  // 2026-07-25 and this was the only failure).
  test('every rung of the people picker gives a distinct, descending figure', () => {
    const perHead = [1, 2, 3, 4, 5].map((n) => perPersonPrice(SET_C.price, n));

    // A party of one pays the whole set; a full party pays the capacity figure.
    expect(perHead[0]).toBe(SET_C.price);
    expect(perHead[4]).toBe(SET_C.pricePerPerson);

    for (let i = 1; i < perHead.length; i++) {
      expect(perHead[i]).toBeLessThan(perHead[i - 1]);
    }
    expect(new Set(perHead).size).toBe(perHead.length);
  });

  test('rounds to whole baht rather than printing a fraction on a price tag', () => {
    expect(perPersonPrice(2975, 4)).toBe(744); // 743.75
    expect(Number.isInteger(perPersonPrice(2975, 3))).toBe(true);
  });

  test('a zero, negative or NaN head count falls back to one instead of ฿Infinity', () => {
    expect(perPersonPrice(2100, 0)).toBe(2100);
    expect(perPersonPrice(2100, -3)).toBe(2100);
    expect(perPersonPrice(2100, Number.NaN)).toBe(2100);
  });
});

describe('bayOnlyCost is computed from the slot, not fixed', () => {
  test('a weekday morning 2h bay is ฿1,100 (2 × ฿550)', () => {
    expect(bayOnlyCost({ date: WEEKDAY, startTime: '10:00', durationHours: 2 })).toBe(1100);
  });

  test('the same 2h in the evening is ฿1,500 (2 × ฿750) — a different anchor', () => {
    expect(bayOnlyCost({ date: WEEKDAY, startTime: '19:00', durationHours: 2 })).toBe(1500);
  });

  test('the weekend carries its own rates (2 × ฿950 in the evening)', () => {
    expect(bayOnlyCost({ date: WEEKEND, startTime: '19:00', durationHours: 2 })).toBe(1900);
  });

  test('a window straddling 14:00 is prorated, not priced at the start slot', () => {
    // 13:00–15:00 weekday = 1h morning ฿550 + 1h afternoon ฿750
    expect(bayOnlyCost({ date: WEEKDAY, startTime: '13:00', durationHours: 2 })).toBe(1300);
  });

  test('a half-hour start is prorated too (13:30 1h = 0.5×550 + 0.5×750)', () => {
    expect(bayOnlyCost({ date: WEEKDAY, startTime: '13:30', durationHours: 1 })).toBe(650);
  });

  test('returns null rather than ฿0 for an unpriceable slot', () => {
    expect(bayOnlyCost({ date: WEEKDAY, startTime: '', durationHours: 2 })).toBeNull();
    expect(bayOnlyCost({ date: WEEKDAY, startTime: 'not-a-time', durationHours: 2 })).toBeNull();
    expect(bayOnlyCost({ date: WEEKDAY, startTime: '10:00', durationHours: 0 })).toBeNull();
    expect(bayOnlyCost({ date: WEEKDAY, startTime: '10:00', durationHours: Number.NaN })).toBeNull();
  });
});

describe('setValueFigures', () => {
  const figures = (pkg: typeof SET_B, numberOfPeople: number, date: string, startTime: string) =>
    setValueFigures({
      price: pkg.price,
      duration: pkg.duration,
      numberOfPeople,
      date,
      startTime,
    });

  test('a morning slot and an evening slot produce DIFFERENT anchors for the same set', () => {
    const morning = figures(SET_B, 2, WEEKDAY, '10:00');
    const evening = figures(SET_B, 2, WEEKDAY, '19:00');

    // Same set, same party — only the slot differs.
    expect(morning.bayOnlyCost).toBe(1100);
    expect(evening.bayOnlyCost).toBe(1500);
    expect(morning.bayOnlyCost).not.toBe(evening.bayOnlyCost);

    // …so the food premium differs too: ฿2,100 − bay.
    expect(morning.foodPremium).toBe(1000);
    expect(evening.foodPremium).toBe(600);
    expect(morning.foodPremium).not.toBe(evening.foodPremium);
  });

  test('the anchor also moves between weekday and weekend for the same clock time', () => {
    expect(figures(SET_C, 5, WEEKDAY, '19:00').bayOnlyCost).toBe(2250); // 3 × 750
    expect(figures(SET_C, 5, WEEKEND, '19:00').bayOnlyCost).toBe(2850); // 3 × 950
  });

  test('the per-person figure tracks the selected party, never the set capacity', () => {
    const two = figures(SET_B, 2, WEEKDAY, '19:00');
    expect(two.perPerson).toBe(1050);
    // The five-head figure the package data carries is NOT what gets shown.
    expect(two.perPerson).not.toBe(SET_B.pricePerPerson);
    expect(two.showPerPerson).toBe(true);

    const five = figures(SET_B, 5, WEEKDAY, '19:00');
    expect(five.perPerson).toBe(SET_B.pricePerPerson);
    expect(five.showPerPerson).toBe(true);
  });

  /**
   * The owner's complaint, as a predicate. At a party of one the split IS the
   * total, so printing it produced "฿1,200 each at 1 person" directly above
   * "Total ฿1,200 NET" — the same number twice under two different labels.
   */
  test('the per-person qualifier is suppressed when it is just the total again', () => {
    const one = figures(SET_B, 1, WEEKDAY, '19:00');
    expect(one.perPerson).toBe(SET_B.price);
    expect(one.showPerPerson).toBe(false);
  });

  test('a defensive head count floors to one, and is suppressed for the same reason', () => {
    for (const people of [0, -3, Number.NaN]) {
      const broken = figures(SET_B, people, WEEKDAY, '19:00');
      expect(broken.perPerson).toBe(SET_B.price);
      expect(broken.showPerPerson).toBe(false);
    }
  });

  /**
   * Every party size from 2 up shows the qualifier, and no two show the same
   * figure — the guard against a rounding change quietly collapsing two rungs
   * onto one number, or onto the total.
   */
  test('every party size above one qualifies the total with a distinct figure', () => {
    const shown = [2, 3, 4, 5].map((n) => figures(SET_C, n, WEEKDAY, '19:00'));
    for (const f of shown) {
      expect(f.showPerPerson).toBe(true);
      expect(f.perPerson).not.toBe(SET_C.price);
    }
    expect(new Set(shown.map((f) => f.perPerson)).size).toBe(shown.length);
  });

  test('a zero or negative premium is nulled so the card omits the anchor line', () => {
    // A 2h set priced below 2h of weekday morning bay time (฿1,100).
    const negative = setValueFigures({
      price: 500,
      duration: 2,
      numberOfPeople: 2,
      date: WEEKDAY,
      startTime: '10:00',
    });
    expect(negative.bayOnlyCost).toBe(1100);
    expect(negative.foodPremium).toBeNull();

    const exactlyZero = setValueFigures({
      price: 1100,
      duration: 2,
      numberOfPeople: 2,
      date: WEEKDAY,
      startTime: '10:00',
    });
    expect(exactlyZero.foodPremium).toBeNull();
  });

  test('an unpriceable slot nulls both the anchor and the premium', () => {
    const broken = figures(SET_A, 2, WEEKDAY, '');
    expect(broken.bayOnlyCost).toBeNull();
    expect(broken.foodPremium).toBeNull();
    // The per-person figures do not depend on the slot and still render.
    expect(broken.perPerson).toBe(600);
  });

  test('every real set is a positive premium over bay time at the rates we ship', () => {
    for (const pkg of getPlayFoodPackages()) {
      for (const startTime of ['09:00', '13:00', '16:00', '19:00']) {
        for (const date of [WEEKDAY, WEEKEND]) {
          const f = figures(pkg, 5, date, startTime);
          expect(f.bayOnlyCost).not.toBeNull();
          expect(f.foodPremium).not.toBeNull();
          expect(f.foodPremium!).toBeGreaterThan(0);
        }
      }
    }
  });
});

/**
 * The one-line hint on the "Bay + Food" fork tile.
 *
 * It is a claim about the fork, which stands in front of all three sets, so it
 * may only be made while it holds for all three — the same discipline as
 * `foodPremium` nulling itself rather than printing an anchor it cannot stand
 * behind. What it must never become is an assertion typed into the tile, which
 * would keep claiming drinks after a set stopped including them.
 *
 * The hint states an INCLUSION rather than the saving that was originally
 * asked for, and the reason is worth pinning in the test file as well as in the
 * module: the à-la-carte prices a saving needs are in neither the pricing
 * catalog (`/api/pricing` carries the sets under `mixedPackages` and no menu
 * items at all) nor the database (no table maps a set to its components), and
 * `foodItems` cannot be matched to `products.products` by name — "Pulled Pork
 * Sandwich" is stocked as "Pulled Pork Sando", and "French Fries" matches both
 * a ฿200 main and a ฿70 side. Priced on food alone, every set comes out WORSE
 * than à la carte before 14:00, because the component plausibly worth the most,
 * unlimited soft drinks, is the one with no defensible per-head price.
 */
describe('the Bay + Food tile only claims drinks while every set includes them', () => {
  const withDrinks = (drinks: PlayFoodPackage['drinks']) => ({ drinks });

  test('holds for the three sets we actually ship', () => {
    expect(everySetIncludesUnlimitedDrinks(getPlayFoodPackages())).toBe(true);
  });

  /**
   * The copy names SOFT drinks specifically, but the predicate can only check
   * the `type` flag — matching on `name` would be the same free-text matching
   * that makes the saving unpriceable. So this pins the gap: today every
   * unlimited allowance IS soft drinks. A set that ships unlimited beer instead
   * would pass the predicate while making the copy wrong, and fails here first.
   */
  test('and every unlimited allowance is soft drinks, which is what the copy says', () => {
    for (const pkg of getPlayFoodPackages()) {
      const unlimited = pkg.drinks.filter((d) => d.type === 'unlimited');
      expect(unlimited.length).toBeGreaterThan(0);
      for (const drink of unlimited) {
        expect(drink.name).toMatch(/soft drinks/i);
      }
    }
  });

  /**
   * Set C is the case that makes the distinction load-bearing: it carries an
   * alcoholic drink too, but at one PER PERSON rather than unlimited. The copy
   * must not generalise that into "unlimited drinks".
   */
  test('a per-person allowance is not an unlimited one', () => {
    const perPersonOnly = withDrinks([
      { name: 'Beer / Cocktail / Wine', type: 'per_person', quantity: 1 },
    ]);
    expect(everySetIncludesUnlimitedDrinks([perPersonOnly])).toBe(false);

    const setC = getPlayFoodPackages().find((p) => p.id === 'SET_C')!;
    expect(setC.drinks.some((d) => d.type === 'per_person')).toBe(true);
    expect(setC.drinks.some((d) => d.type === 'unlimited')).toBe(true);
  });

  test('one set without the allowance retires the claim for the whole fork', () => {
    const sets = getPlayFoodPackages();
    const withoutDrinks = { ...sets[1], drinks: [] };

    expect(everySetIncludesUnlimitedDrinks([sets[0], withoutDrinks, sets[2]])).toBe(false);
  });

  test('it is every, not some', () => {
    const yes = withDrinks([{ name: 'Soft Drinks', type: 'unlimited' }]);
    const no = withDrinks([]);

    expect(everySetIncludesUnlimitedDrinks([yes, yes])).toBe(true);
    expect(everySetIncludesUnlimitedDrinks([yes, no])).toBe(false);
    expect(everySetIncludesUnlimitedDrinks([no, no])).toBe(false);
  });

  /**
   * `Array.prototype.every` is vacuously true on an empty array, which would
   * advertise unlimited drinks on a fork with no sets behind it at all.
   */
  test('no sets means no claim, not a vacuously true one', () => {
    expect(everySetIncludesUnlimitedDrinks([])).toBe(false);
  });
});
