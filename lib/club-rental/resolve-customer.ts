/**
 * Customer resolution for club rentals (booking app).
 *
 * Mirrors lengolf-forms `src/lib/club-rental/resolve-customer.ts`:
 *  - WRITE path (`resolveCustomerId` / `resolveUserId`): prefer a caller-supplied
 *    customer_id; else a UNIQUE phone match (never auto-create); then the
 *    booking-app user_id. Lets forms staff tooling surface website orders instead
 *    of leaving customer_id NULL like the legacy reserve route.
 *  - READ path (`resolveRentalCustomer`): given a rental line + its parent order
 *    header, return the customer to display — the order is canonical for course
 *    rentals, the line is the indoor/orphan fallback (Option B, customer family).
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

interface ResolveInput {
  customerId?: string | null;
  customerPhone?: string | null;
  customerName?: string | null;
}

/**
 * Resolve a customer_id. Returns the supplied id, or a UNIQUE phone match, or
 * null. Never creates a customer; ambiguous (>1) phone matches resolve to null.
 * Best-effort: any RPC/query error degrades to null rather than failing the order.
 */
export async function resolveCustomerId(
  admin: any,
  { customerId, customerPhone }: ResolveInput,
): Promise<string | null> {
  if (customerId) return customerId;
  if (!customerPhone) return null;

  try {
    const { data: normalizedRows } = await admin.rpc('normalize_phone_number', {
      phone_input: customerPhone,
    });
    const normalized: string | null = Array.isArray(normalizedRows)
      ? normalizedRows[0]
      : (normalizedRows as string | null);
    if (!normalized) return null;

    const { data: matches } = await admin
      .from('customers')
      .select('id, customer_code')
      .eq('normalized_phone', normalized)
      .limit(5);

    // Log the resolved customer_code / match count only — never the raw phone
    // (guest-checkout PII). Mirrors the webhook's "log keys, not values" posture.
    if (matches && matches.length === 1) {
      console.log(
        `[ClubOrder] Backstop: auto-linked customer_id=${matches[0].id} (${matches[0].customer_code}) from phone match`,
      );
      return matches[0].id;
    }
    if (matches && matches.length > 1) {
      console.warn(
        `[ClubOrder] Backstop: phone matched ${matches.length} customers — treating as no match.`,
      );
    } else {
      console.warn('[ClubOrder] Backstop: no customer_id and no phone match — order stays guest.');
    }
  } catch (err) {
    console.error('[ClubOrder] resolveCustomerId failed (non-blocking):', err);
  }
  return null;
}

/** Resolve the booking-app profile user_id for a customer (nullable, best-effort). */
export async function resolveUserId(
  admin: any,
  customerId: string | null,
): Promise<string | null> {
  if (!customerId) return null;
  try {
    const { data: profile } = await admin
      .from('profiles')
      .select('id')
      .eq('customer_id', customerId)
      .maybeSingle();
    return profile?.id ?? null;
  } catch (err) {
    console.error('[ClubOrder] resolveUserId failed (non-blocking):', err);
    return null;
  }
}

// ---------------------------------------------------------------------------
// READ path — resolve which customer a rental shows (order-canonical for course)
// ---------------------------------------------------------------------------

export interface RentalCustomerColumns {
  customer_id?: string | null;
  customer_name?: string | null;
  customer_phone?: string | null;
  customer_email?: string | null;
}

export interface RentalRowWithOrderCustomer extends RentalCustomerColumns {
  /** Parent order header (course rentals only; null/undefined for indoor). */
  order?: RentalCustomerColumns | null;
}

export interface ResolvedRentalCustomer {
  id: string | null;
  name: string | null;
  phone: string | null;
  email: string | null;
}

/**
 * Resolve a rental's customer, preferring the parent order header.
 *
 * For COURSE rentals the `club_rental_orders` header is the canonical source of
 * the (denormalised) customer fields; INDOOR rentals have no order and fall back
 * to the line. The `??` chain IS the backward-compat: a missing order — or a null
 * field on the order — falls through to the line. Mirrors lengolf-forms
 * `resolveRentalCustomer` so both apps display the same order customer. Writers
 * still denormalise customer onto both header and line; this only flips reads.
 *
 * In this app the header is usually loaded SEPARATELY from the line (not a
 * PostgREST embed), so callers pass `{ ...lineCustomerCols, order: headerCols }`.
 */
export function resolveRentalCustomer(row: RentalRowWithOrderCustomer): ResolvedRentalCustomer {
  const o = row.order ?? null;
  return {
    id: o?.customer_id ?? row.customer_id ?? null,
    name: o?.customer_name ?? row.customer_name ?? null,
    phone: o?.customer_phone ?? row.customer_phone ?? null,
    email: o?.customer_email ?? row.customer_email ?? null,
  };
}
