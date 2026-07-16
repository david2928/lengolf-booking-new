import {
  allocateOrderMoney,
  courseDeliveryFee,
  groupAddOns,
  groupSetNames,
  round2,
} from '@/lib/club-rental/order-pricing';
import { getCoursePrice, getCoursePriceBreakdown, RentalClubSet } from '@/types/golf-club-rental';

// Production tier prices from rental_club_sets (2026-07). The expected tables
// below MUST stay byte-identical to lengolf-forms
// src/lib/club-rental/__tests__/order-pricing.test.ts — the two repos share the
// same optimal-combo algorithm and these fixtures pin cross-repo price parity.
const PREMIUM = {
  course_price_1d: 1200,
  course_price_3d: 2400,
  course_price_7d: 4800,
  course_price_14d: 8400,
} as RentalClubSet;
const PREMIUM_PLUS = {
  course_price_1d: 1800,
  course_price_3d: 3600,
  course_price_7d: 7200,
  course_price_14d: 12600,
} as RentalClubSet;

// Expected optimal-combo price for every duration 1..14 (hand-derived):
// e.g. Premium 10 days = 7-day (4800) + 3-day (2400) = 7200, NOT the 14-day
// tier (8400) the forms repo's old simple-tier lookup rounded up to.
const PREMIUM_EXPECTED: Record<number, number> = {
  1: 1200, 2: 2400, 3: 2400, 4: 3600, 5: 4800, 6: 4800, 7: 4800,
  8: 6000, 9: 7200, 10: 7200, 11: 8400, 12: 8400, 13: 8400, 14: 8400,
};
const PREMIUM_PLUS_EXPECTED: Record<number, number> = {
  1: 1800, 2: 3600, 3: 3600, 4: 5400, 5: 7200, 6: 7200, 7: 7200,
  8: 9000, 9: 10800, 10: 10800, 11: 12600, 12: 12600, 13: 12600, 14: 12600,
};

describe('getCoursePrice — optimal-combo decomposition (synced with lengolf-forms)', () => {
  it.each(Object.entries(PREMIUM_EXPECTED).map(([d, p]) => [Number(d), p]))(
    'Premium %i day(s) → ฿%i',
    (days, expected) => {
      expect(getCoursePrice(PREMIUM, days)).toBe(expected);
    },
  );

  it.each(Object.entries(PREMIUM_PLUS_EXPECTED).map(([d, p]) => [Number(d), p]))(
    'Premium+ %i day(s) → ฿%i',
    (days, expected) => {
      expect(getCoursePrice(PREMIUM_PLUS, days)).toBe(expected);
    },
  );

  it('regression: 10-day Premium is 7d+3d packs (฿7,200), not the 14-day tier (฿8,400)', () => {
    const bd = getCoursePriceBreakdown(PREMIUM, 10);
    expect(bd.total).toBe(7200);
    expect(bd.packs.map((p) => p.days).sort((a, b) => b - a)).toEqual([7, 3]);
  });

  it('breakdown packs sum to the total and savings is vs the daily rate', () => {
    for (let d = 1; d <= 14; d++) {
      const bd = getCoursePriceBreakdown(PREMIUM, d);
      expect(bd.packs.reduce((s, p) => s + p.price, 0)).toBe(bd.total);
      expect(bd.dailyRate).toBe(d * Number(PREMIUM.course_price_1d));
      expect(bd.savings).toBe(bd.dailyRate - bd.total);
    }
  });

  it('rounds fractional days up (you cannot rent part of a day)', () => {
    expect(getCoursePrice(PREMIUM, 1.5)).toBe(PREMIUM_EXPECTED[2]);
    expect(getCoursePrice(PREMIUM, 9.01)).toBe(PREMIUM_EXPECTED[10]);
  });

  it('falls back to the 14-day tier on non-finite duration', () => {
    expect(getCoursePrice(PREMIUM, NaN)).toBe(8400);
    expect(getCoursePrice(PREMIUM, Infinity)).toBe(8400);
  });
});

describe('groupSetNames', () => {
  it('collapses repeats into "Name ×N" and preserves first-seen order', () => {
    expect(groupSetNames(['Warbird', 'Warbird'])).toBe('Warbird ×2');
    expect(groupSetNames(['Warbird', 'Paradym'])).toBe('Warbird, Paradym');
    expect(groupSetNames(['Warbird', 'Paradym', 'Warbird'])).toBe('Warbird ×2, Paradym');
  });

  it('skips empty names and handles the empty list', () => {
    expect(groupSetNames([])).toBe('');
    expect(groupSetNames([null, undefined, 'X'])).toBe('X');
  });
});

describe('groupAddOns', () => {
  it('groups repeated items by label with summed price + quantity', () => {
    const grouped = groupAddOns([
      { key: 'gloves', label: 'Golf Glove', price: 600 },
      { key: 'gloves', label: 'Golf Glove', price: 600 },
      { key: 'gloves', label: 'Golf Glove', price: 600 },
      { key: 'balls', label: 'Golf Balls', price: 400 },
    ]);
    expect(grouped).toEqual([
      { label: 'Golf Glove', price: 1800, quantity: 3 },
      { label: 'Golf Balls', price: 400, quantity: 1 },
    ]);
  });

  it('returns [] for non-arrays / empty / unlabeled', () => {
    expect(groupAddOns(null)).toEqual([]);
    expect(groupAddOns(undefined)).toEqual([]);
    expect(groupAddOns([])).toEqual([]);
    expect(groupAddOns([{ price: 600 }])).toEqual([]);
  });
});

describe('round2', () => {
  it('rounds to 2 decimals', () => {
    expect(round2(1200.005)).toBe(1200.01);
    expect(round2(2400)).toBe(2400);
    expect(round2(0.1 + 0.2)).toBe(0.3);
  });
});

describe('courseDeliveryFee (tiered: 500 + max(0,n-2)*250)', () => {
  it('matches the agreed tier table', () => {
    expect(courseDeliveryFee(1)).toBe(500);
    expect(courseDeliveryFee(2)).toBe(500);
    expect(courseDeliveryFee(3)).toBe(750);
    expect(courseDeliveryFee(4)).toBe(1000);
    expect(courseDeliveryFee(5)).toBe(1250);
    expect(courseDeliveryFee(6)).toBe(1500);
  });

  it('returns 0 for no sets and scales the increment off the base', () => {
    expect(courseDeliveryFee(0)).toBe(0);
    // base 400 → increment 200: n=3 → 600
    expect(courseDeliveryFee(3, 400)).toBe(600);
  });
});

describe('allocateOrderMoney — header rollup only (Phase 2)', () => {
  it('throws on an empty line list', () => {
    expect(() => allocateOrderMoney([], 0, 0, 0)).toThrow();
  });

  it('computes the rollup from line rental prices + shared charges', () => {
    const rollup = allocateOrderMoney([2400, 2400], 1000, 500, 200);
    expect(rollup.rentalSubtotal).toBe(4800);
    expect(rollup.addOnsTotal).toBe(1000);
    expect(rollup.deliveryFee).toBe(500);
    expect(rollup.discountAmount).toBe(200);
    expect(rollup.totalPrice).toBe(round2(4800 + 1000 + 500 - 200)); // 6100
  });

  it('handles the single-line order', () => {
    const rollup = allocateOrderMoney([1200], 600, 500, 0);
    expect(rollup.rentalSubtotal).toBe(1200);
    expect(rollup.totalPrice).toBe(1200 + 600 + 500);
  });

  it('rounds THB at the accumulation points', () => {
    const rollup = allocateOrderMoney([1200.005, 1200.004], 0, 0, 0);
    expect(rollup.rentalSubtotal).toBe(2400.01);
    expect(rollup.totalPrice).toBe(2400.01);
  });
});
