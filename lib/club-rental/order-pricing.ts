/**
 * Club-rental ORDER pricing — header-authored money model.
 *
 * An order groups N course-rental lines (one per club set) under one shared
 * delivery leg and one (optional) order-level discount. Since the order-authority
 * inversion (Phase 2) the HEADER authors the money: delivery_fee / discount_amount /
 * total_price live on club_rental_orders, and each line stores only its rental_price.
 * There is no longer a "bearer line" — allocateOrderMoney just rolls the per-set
 * rental prices up with the shared charges into the header rollup.
 *
 * This mirrors lengolf-forms `src/lib/club-rental/order-pricing.ts` (the canonical
 * model). The one deliberate divergence: booking-new feeds in per-line prices from
 * its OWN optimal-combo `getCoursePrice` (see types/golf-club-rental.ts), NOT the
 * forms simple-tier helper — so the website charges the same per-set amount the
 * customer saw on the page. The rollup below is pricing-function-agnostic.
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

export interface DisplayAddOn {
  label: string;
  /** Summed price across the grouped units (price × quantity). */
  price: number;
  quantity: number;
}

/**
 * Group a flat add-ons array — which stores ONE entry per unit (e.g. three glove
 * entries for quantity 3) — by label into { label, summed price, quantity } for
 * display. The stored array stays expanded so add_ons_total and the forms staff
 * reader keep reading correct values; only the customer/staff DISPLAY is grouped.
 */
export function groupAddOns(addOnsRaw: unknown): DisplayAddOn[] {
  if (!Array.isArray(addOnsRaw)) return [];
  const map = new Map<string, DisplayAddOn>();
  for (const a of addOnsRaw) {
    if (!a || typeof a !== 'object') continue;
    const item = a as { label?: string; price?: number | string };
    if (!item.label) continue;
    const price = Number(item.price) || 0;
    const existing = map.get(item.label);
    if (existing) {
      existing.quantity += 1;
      existing.price = round2(existing.price + price);
    } else {
      map.set(item.label, { label: item.label, price, quantity: 1 });
    }
  }
  return Array.from(map.values());
}

/**
 * Join per-line set names into a display summary, collapsing repeats into
 * "Name ×N" (so a 2× Warbird order reads "…Warbird ×2", not "…Warbird,
 * …Warbird"). Preserves first-seen order; skips empty names.
 */
export function groupSetNames(names: Array<string | null | undefined>): string {
  const counts = new Map<string, number>();
  for (const n of names) {
    if (!n) continue;
    counts.set(n, (counts.get(n) ?? 0) + 1);
  }
  return Array.from(counts.entries())
    .map(([name, count]) => (count > 1 ? `${name} ×${count}` : name))
    .join(', ');
}

export interface OrderMoneyRollup {
  rentalSubtotal: number;
  addOnsTotal: number;
  deliveryFee: number;
  discountAmount: number;
  totalPrice: number;
}

/**
 * Compute a course order's money rollup from its per-set rental prices + the
 * shared order-level charges. Since the order-authority inversion (Phase 2) the
 * header AUTHORS this rollup directly — there is no "bearer line": the line stores
 * only rental_price; delivery_fee / discount_amount / total_price live on the
 * header. THB rounded at every accumulation point (CLAUDE.md money rule).
 *
 * Throws on an empty line list — callers must validate at least one line first.
 */
export function allocateOrderMoney(
  lineRentalPrices: number[],
  addOnsTotal: number,
  deliveryFee: number,
  discountAmount: number,
): OrderMoneyRollup {
  if (lineRentalPrices.length === 0) {
    throw new Error('allocateOrderMoney requires at least one line');
  }
  const rentalSubtotal = round2(lineRentalPrices.reduce((s, p) => s + round2(p), 0));
  const addOns = round2(addOnsTotal);
  const delivery = round2(deliveryFee);
  const discount = round2(discountAmount);
  const totalPrice = round2(rentalSubtotal + addOns + delivery - discount);
  return { rentalSubtotal, addOnsTotal: addOns, deliveryFee: delivery, discountAmount: discount, totalPrice };
}
