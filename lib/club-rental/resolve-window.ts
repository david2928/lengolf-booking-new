/**
 * Window resolution for club rentals (READ path).
 *
 * The parent `club_rental_orders` header is the canonical source of the rental
 * window for COURSE rentals (Option B, increment 3b). INDOOR / bay rentals have
 * no order (`order_id` NULL, no `order` embed) and fall back to the line columns.
 * The `??` chain IS the backward-compat: a missing order — or a null field on the
 * order — falls through to the line, so callers stay correct for course + indoor
 * without branching on `rental_type`.
 *
 * The window is uniform across an order's lines by construction (create + the
 * order-level edit write one window to every line), so the header copy — kept
 * fresh by syncOrderHeaderFromLines — equals every line's window for course.
 * This accessor only flips the read source. See
 * docs/technical/CLUB_RENTAL_ORDER_MODEL.md (in lengolf-forms).
 *
 * `return_time` is the rental-interval end time; it is the SAME header column the
 * delivery accessor reads (added with the delivery family). Included here so an
 * interval-building reader gets the whole window from one accessor.
 *
 * Times are returned RAW (Postgres `time` -> 'HH:MM:SS'; `return_time` is free
 * text) — callers keep routing them through safeTimeHHMM / normalizeTime; do not
 * slice here.
 *
 * NOTE: this file is mirrored verbatim in lengolf-forms
 * (`src/lib/club-rental/resolve-window.ts`). Keep the two identical.
 */

export interface RentalWindowColumns {
  start_date?: string | null
  end_date?: string | null
  start_time?: string | null
  return_time?: string | null
  duration_days?: number | null
}

export interface RentalRowWithOrderWindow extends RentalWindowColumns {
  /** Embedded parent order header (course rentals only; null/undefined for indoor). */
  order?: RentalWindowColumns | null
}

export interface ResolvedRentalWindow {
  startDate: string | null
  endDate: string | null
  startTime: string | null
  returnTime: string | null
  durationDays: number | null
}

export function resolveRentalWindow(row: RentalRowWithOrderWindow): ResolvedRentalWindow {
  const o = row.order ?? null
  return {
    startDate: o?.start_date ?? row.start_date ?? null,
    endDate: o?.end_date ?? row.end_date ?? null,
    startTime: o?.start_time ?? row.start_time ?? null,
    returnTime: o?.return_time ?? row.return_time ?? null,
    durationDays: o?.duration_days ?? row.duration_days ?? null,
  }
}
