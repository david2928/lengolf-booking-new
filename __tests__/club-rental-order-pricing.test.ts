import {
  allocateOrderMoney,
  courseDeliveryFee,
  groupAddOns,
  groupSetNames,
  round2,
} from '@/lib/club-rental/order-pricing';

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
