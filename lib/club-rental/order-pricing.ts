/**
 * Club-rental ORDER pricing — the "rollup header, lines stay whole" money model.
 *
 * An order groups N course-rental lines (one per club set) under one shared
 * delivery leg and one (optional) order-level discount. The shared charges
 * (delivery fee, add-ons, discount) are placed on a single "bearer" line so that:
 *   - every line.total_price stays the full per-line charged amount, and
 *   - SUM(line.total_price) === order.total_price  (delivery/add-ons counted ONCE).
 *
 * This mirrors lengolf-forms `src/lib/club-rental/order-pricing.ts` (the canonical
 * Option-A model). The one deliberate divergence: booking-new feeds in per-line
 * prices from its OWN optimal-combo `getCoursePrice` (see types/golf-club-rental.ts),
 * NOT the forms simple-tier helper — so the website charges the same per-set amount
 * the customer saw on the page. The allocation below is pricing-function-agnostic.
 *
 * THB is rounded at every accumulation point (CLAUDE.md money rule).
 */

export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Tiered course-rental delivery fee by number of rented sets.
 *
 *   1–2 sets → ฿500   (one trip fits two bags)
 *   each set beyond 2 → +฿250 (half the base)
 *
 *   n=1 → 500, n=2 → 500, n=3 → 750, n=4 → 1000, n=5 → 1250
 *
 * The increment scales off the base fee so a future base change stays coherent.
 */
export function courseDeliveryFee(setCount: number, baseFee = 500): number {
  const n = Math.max(0, Math.floor(setCount));
  if (n === 0) return 0;
  return round2(baseFee + Math.max(0, n - 2) * (baseFee / 2));
}

export interface OrderLineMoney {
  /** Per-line set rental price (already resolved for the order duration). */
  rentalPrice: number;
  /** Add-ons assigned to this line (0 except on the bearer line). */
  addOnsTotal: number;
  /** Delivery fee assigned to this line (0 except on the bearer line). */
  deliveryFee: number;
  /** Discount assigned to this line (0 except on the bearer line). */
  discountAmount: number;
  /** rentalPrice + addOnsTotal + deliveryFee - discountAmount. */
  totalPrice: number;
  /** True for the single line that carries the order's shared charges. */
  isBearer: boolean;
}

export interface OrderMoneyRollup {
  rentalSubtotal: number;
  addOnsTotal: number;
  deliveryFee: number;
  discountAmount: number;
  totalPrice: number;
}

export interface OrderAllocation {
  lines: OrderLineMoney[];
  rollup: OrderMoneyRollup;
}

/**
 * Allocate order-level shared charges onto the first ("bearer") line and produce
 * the header rollups. `lineRentalPrices` is in line order; the order's add-ons,
 * delivery fee, and discount are all attributed to index 0.
 *
 * Throws on an empty line list — callers must validate at least one line first.
 */
export function allocateOrderMoney(
  lineRentalPrices: number[],
  addOnsTotal: number,
  deliveryFee: number,
  discountAmount: number,
): OrderAllocation {
  if (lineRentalPrices.length === 0) {
    throw new Error('allocateOrderMoney requires at least one line');
  }

  const sharedAddOns = round2(addOnsTotal);
  const sharedDelivery = round2(deliveryFee);
  const sharedDiscount = round2(discountAmount);

  const lines: OrderLineMoney[] = lineRentalPrices.map((rentalPrice, i) => {
    const isBearer = i === 0;
    const rp = round2(rentalPrice);
    const lineAddOns = isBearer ? sharedAddOns : 0;
    const lineDelivery = isBearer ? sharedDelivery : 0;
    const lineDiscount = isBearer ? sharedDiscount : 0;
    return {
      rentalPrice: rp,
      addOnsTotal: lineAddOns,
      deliveryFee: lineDelivery,
      discountAmount: lineDiscount,
      totalPrice: round2(rp + lineAddOns + lineDelivery - lineDiscount),
      isBearer,
    };
  });

  const rentalSubtotal = round2(lines.reduce((s, l) => s + l.rentalPrice, 0));
  const totalPrice = round2(lines.reduce((s, l) => s + l.totalPrice, 0));

  return {
    lines,
    rollup: {
      rentalSubtotal,
      addOnsTotal: sharedAddOns,
      deliveryFee: sharedDelivery,
      discountAmount: sharedDiscount,
      totalPrice,
    },
  };
}
