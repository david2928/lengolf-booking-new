/**
 * Customer/user resolution for the booking-app order write path.
 *
 * Mirrors lengolf-forms `src/lib/club-rental/resolve-customer.ts`: prefer a
 * caller-supplied customer_id; otherwise attempt a UNIQUE phone match (never
 * auto-create); then resolve the booking-app user_id via the profiles table.
 *
 * This is an improvement over the legacy website reserve route, which left
 * customer_id NULL — linking the order to a known customer lets the forms staff
 * tooling (customer history, sidebar) surface website orders.
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
