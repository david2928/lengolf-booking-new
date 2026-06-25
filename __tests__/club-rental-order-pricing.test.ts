import {
  allocateOrderMoney,
  courseDeliveryFee,
  groupAddOns,
  round2,
} from '@/lib/club-rental/order-pricing';

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

describe('allocateOrderMoney', () => {
  it('throws on an empty line list', () => {
    expect(() => allocateOrderMoney([], 0, 0, 0)).toThrow();
  });

  it('single line carries everything (bearer is the only line)', () => {
    const { lines, rollup } = allocateOrderMoney([1200], 600, 500, 0);
    expect(lines).toHaveLength(1);
    expect(lines[0].isBearer).toBe(true);
    expect(lines[0].totalPrice).toBe(1200 + 600 + 500);
    expect(rollup.totalPrice).toBe(2300);
    expect(rollup.rentalSubtotal).toBe(1200);
  });

  it('charges delivery + add-ons ONCE on the bearer line, not per line', () => {
    const { lines, rollup } = allocateOrderMoney([1200, 1800], 600, 750, 0);
    // bearer (index 0) carries the shared charges
    expect(lines[0].deliveryFee).toBe(750);
    expect(lines[0].addOnsTotal).toBe(600);
    expect(lines[0].totalPrice).toBe(1200 + 600 + 750);
    // sibling line carries ONLY its own rental
    expect(lines[1].deliveryFee).toBe(0);
    expect(lines[1].addOnsTotal).toBe(0);
    expect(lines[1].totalPrice).toBe(1800);
    // header rollups
    expect(rollup.rentalSubtotal).toBe(3000);
    expect(rollup.deliveryFee).toBe(750);
    expect(rollup.addOnsTotal).toBe(600);
  });

  it('keeps the invariant SUM(line.total) === rollup.total', () => {
    const cases: Array<[number[], number, number, number]> = [
      [[1200], 0, 0, 0],
      [[1200, 1800], 600, 750, 0],
      [[1200, 1200, 1800], 1000, 1000, 0],
      [[2400, 3600], 400, 500, 200],
    ];
    for (const [prices, addOns, delivery, discount] of cases) {
      const { lines, rollup } = allocateOrderMoney(prices, addOns, delivery, discount);
      const sum = round2(lines.reduce((s, l) => s + l.totalPrice, 0));
      expect(sum).toBe(rollup.totalPrice);
    }
  });

  it('applies an order discount once on the bearer line', () => {
    const { lines, rollup } = allocateOrderMoney([2400, 3600], 0, 500, 200);
    expect(lines[0].discountAmount).toBe(200);
    expect(lines[1].discountAmount).toBe(0);
    expect(lines[0].totalPrice).toBe(2400 + 500 - 200);
    expect(rollup.totalPrice).toBe(2400 + 3600 + 500 - 200);
  });
});
