/**
 * Delivery resolution for club rentals (booking app, READ path).
 *
 * Mirrors lengolf-forms `src/lib/club-rental/resolve-delivery.ts`: the
 * `club_rental_orders` header is the canonical source of the (denormalised)
 * delivery fields for COURSE rentals; INDOOR rentals have no order and fall back
 * to the line. The `??` chain IS the backward-compat: a missing order — or a null
 * field on the order — falls through to the line.
 *
 * After Option B increment 2, delivery is edited only at the order level
 * (forms `handleEditDelivery`), which writes the header + every active line, so
 * header and line are value-equal for course; this only flips the read source.
 * Keep this file identical to the forms copy.
 *
 * In this app the header is usually loaded SEPARATELY from the line (not a
 * PostgREST embed), so callers pass `{ ...lineDeliveryCols, order: headerCols }`.
 *
 * Coordinates (delivery_lat/lng, return_pickup_lat/lng) and the drive-time cache
 * are intentionally NOT resolved here — they are dispatch concerns that stay
 * line-side. This accessor is for the displayed/customer-facing fields.
 */

export interface RentalDeliveryColumns {
  delivery_requested?: boolean | null;
  delivery_address?: string | null;
  delivery_time?: string | null;
  return_time?: string | null;
  return_pickup_address?: string | null;
}

export interface RentalRowWithOrderDelivery extends RentalDeliveryColumns {
  /** Parent order header (course rentals only; null/undefined for indoor). */
  order?: RentalDeliveryColumns | null;
}

export interface ResolvedRentalDelivery {
  requested: boolean;
  address: string | null;
  deliveryTime: string | null;
  returnTime: string | null;
  returnPickupAddress: string | null;
}

export function resolveRentalDelivery(row: RentalRowWithOrderDelivery): ResolvedRentalDelivery {
  const o = row.order ?? null;
  return {
    requested: (o?.delivery_requested ?? row.delivery_requested) ?? false,
    address: o?.delivery_address ?? row.delivery_address ?? null,
    deliveryTime: o?.delivery_time ?? row.delivery_time ?? null,
    returnTime: o?.return_time ?? row.return_time ?? null,
    returnPickupAddress: o?.return_pickup_address ?? row.return_pickup_address ?? null,
  };
}
