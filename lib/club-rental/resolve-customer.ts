/**
 * Customer resolution for club rentals (booking app).
 *
 * Mirrors lengolf-forms `src/lib/club-rental/resolve-customer.ts`:
 *  - WRITE path (`resolveCustomerId` / `resolveUserId`): prefer a caller-supplied
 *    customer_id; else a UNIQUE phone match (never auto-create); then the
 *    booking-app user_id. Lets forms staff tooling surface website orders instead
 *    of leaving customer_id NULL like the legacy reserve route.
 *  - `resolveOrCreateCustomerId` (booking-new only, no forms mirror): same match,
 *    but a guest checkout with NO matching customer CREATES one, so website
 *    course orders never show "No customer linked" in the staff app.
 *  - READ path (`resolveRentalCustomer`): given a rental line + its parent order
 *    header, return the customer to display — the order is canonical for course
 *    rentals, the line is the indoor/orphan fallback (Option B, customer family).
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

import { normalizeEmail } from '@/lib/email-format';

interface ResolveInput {
  customerId?: string | null;
  customerPhone?: string | null;
  customerName?: string | null;
}

/**
 * Resolve a customer_id. Returns the supplied id, or a UNIQUE phone match, or
 * null. Never creates a customer; ambiguous (>1) phone matches resolve to null.
 * Best-effort: any RPC/query error degrades to null rather than failing the order.
 *
 * No in-repo caller since the order route moved to `resolveOrCreateCustomerId` —
 * kept as the byte-for-byte mirror of the forms write path (see file header).
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

interface ResolveOrCreateInput extends ResolveInput {
  customerEmail?: string | null;
  /** Booking-time site locale — seeds customers.preferred_language on create. */
  language?: string | null;
}

/**
 * Resolve a customer_id like `resolveCustomerId`, but when NO existing customer
 * matches the phone, CREATE one (guest checkout → CRM row) and link it.
 *
 * booking-new ONLY — deliberately NOT mirrored to lengolf-forms: the staff app
 * creates customers explicitly through its customer-management UI (with its own
 * dedup picker), so its write path stays match-only.
 *
 * Rules:
 *  - A caller-supplied customer_id always wins (trusted internal callers).
 *  - Exactly one ACTIVE normalized-phone match → link it (no create).
 *  - Ambiguous (>1) matches → null, stays unlinked for staff review.
 *  - Zero matches → insert a customers row (customer_code + normalized_phone
 *    are set by DB triggers) and link it. `preferred_language` is seeded from
 *    the booking language so CRM-driven emails keep the customer's locale.
 *  - No phone, unusable name, or any DB error → null (never fails the order;
 *    the forms "Link customer" button remains the manual fallback).
 *  - Matching filters is_active=true (unlike `resolveCustomerId`): a merged-away
 *    or deactivated customer is deliberately NOT relinked — a fresh active row
 *    is created instead, and the forms merge tooling reconciles if needed.
 *
 * NB there is no DB-level uniqueness on customers.normalized_phone — dedup is
 * this pre-select, same posture as the forms staff create route; the forms
 * duplicate-merge tooling is the backstop for the (tiny) concurrent-create race.
 */
export async function resolveOrCreateCustomerId(
  admin: any,
  { customerId, customerPhone, customerName, customerEmail, language }: ResolveOrCreateInput,
): Promise<string | null> {
  if (customerId) return customerId;
  const name = customerName?.trim();
  if (!customerPhone || !name) return null;

  try {
    const { data: normalizedRows } = await admin.rpc('normalize_phone_number', {
      phone_input: customerPhone,
    });
    const normalized: string | null = Array.isArray(normalizedRows)
      ? normalizedRows[0]
      : (normalizedRows as string | null);
    // An unusable phone (no digits) can't be deduped — don't create from it.
    if (!normalized) return null;

    const { data: matches, error: matchError } = await admin
      .from('customers')
      .select('id, customer_code')
      .eq('normalized_phone', normalized)
      .eq('is_active', true)
      .limit(5);
    // On a failed lookup, bail rather than risk creating a duplicate.
    if (matchError) {
      console.error('[ClubOrder] customer phone lookup failed (non-blocking):', matchError);
      return null;
    }

    if (matches && matches.length === 1) {
      console.log(
        `[ClubOrder] Auto-linked customer_id=${matches[0].id} (${matches[0].customer_code}) from phone match`,
      );
      return matches[0].id;
    }
    if (matches && matches.length > 1) {
      console.warn(
        `[ClubOrder] Phone matched ${matches.length} customers — leaving unlinked for staff review.`,
      );
      return null;
    }

    // No match → create the customer. Log the generated code, never the phone.
    // Minimal email format gate: this string was only length-checked upstream
    // and now lands in the CRM column staff tooling + outreach read — a garbage
    // or forged value is worse there than a null.
    const safeEmail = normalizeEmail(customerEmail);
    const { data: created, error: insertError } = await admin
      .from('customers')
      .insert({
        customer_name: name,
        contact_number: customerPhone,
        email: safeEmail,
        preferred_language: language || null,
      })
      .select('id, customer_code')
      .single();
    if (insertError || !created) {
      // Log code+message only — a constraint violation's `details` echoes the
      // failing row (raw phone/email), which must never reach the logs.
      console.error(
        '[ClubOrder] customer auto-create failed (non-blocking):',
        insertError?.code,
        insertError?.message,
      );
      return null;
    }
    console.log(
      `[ClubOrder] Auto-created customer_id=${created.id} (${created.customer_code}) from guest checkout`,
    );
    return created.id;
  } catch (err) {
    console.error('[ClubOrder] resolveOrCreateCustomerId failed (non-blocking):', err);
    return null;
  }
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
