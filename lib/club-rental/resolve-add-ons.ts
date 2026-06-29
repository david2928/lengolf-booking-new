/**
 * Shared add-on resolution for club rentals (READ path).
 *
 * The parent club_rental_orders header is the canonical source of the add-on
 * ITEM LIST for COURSE rentals. INDOOR / bay rentals (and order-less booking-new
 * single-set reserves) have no order embed and fall back to the line's add_ons.
 *
 * Stored EXPANDED (one entry per unit) on both header and bearer line; sibling
 * lines carry []. Use groupAddOns() to collapse for display. The header is kept
 * in sync from its active lines by syncOrderHeaderFromLines.
 *
 * NOTE: mirrored byte-identical in lengolf-booking-new
 * (lib/club-rental/resolve-add-ons.ts). Keep the two identical.
 * See docs/technical/CLUB_RENTAL_ORDER_MODEL.md.
 */

export interface RentalAddOnItem {
  key?: string
  label: string
  price: number
}

export interface RentalAddOnColumns {
  add_ons?: RentalAddOnItem[] | null
}

export interface RentalRowWithOrderAddOns extends RentalAddOnColumns {
  /** Embedded parent order header (course rentals only; null/undefined for indoor). */
  order?: RentalAddOnColumns | null
}

export function resolveRentalAddOns(row: RentalRowWithOrderAddOns): RentalAddOnItem[] {
  const raw = row.order?.add_ons ?? row.add_ons
  return Array.isArray(raw) ? raw : []
}
