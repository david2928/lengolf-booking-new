import 'server-only';
import { NextResponse } from 'next/server';

/**
 * Who may read and write VIP data.
 *
 * ── Why a guest session is not enough ─────────────────────────────────────
 * The guest credentials provider resolves an existing profile on EMAIL ALONE
 * (`app/api/auth/options.ts`). Name and phone are supplied, never checked. So
 * anyone who knows an email address can obtain a session carrying THAT PERSON's
 * profile id — and every VIP route resolves `session.user.id` to a
 * `profiles.customer_id` and returns whatever hangs off it. Correct scoping is
 * not the issue; the routes scope perfectly. The issue is that the session
 * itself is unverified.
 *
 * A guest session is a receipt for one booking, not proof of identity. It gets
 * the customer through checkout and no further.
 *
 * ── Why this is only safe now ─────────────────────────────────────────────
 * `/api/vip/profile` used to be the ONLY prefill source in the booking flow, so
 * gating it against guests would have silently cost every returning guest their
 * prefill. That dependency is gone: prefill now comes from browser autofill
 * first, and the in-flow sign-in row is there for anyone who wants the rest.
 * Do not reintroduce a prefill path that depends on these routes.
 *
 * ── What this is NOT ──────────────────────────────────────────────────────
 * This is a coarse gate on session TYPE, not a substitute for per-record
 * scoping. Every route must still resolve the caller's own `customer_id` and
 * filter by it. Both, always.
 */

interface SessionLike {
  user?: {
    id?: string | null;
    provider?: string | null;
  } | null;
}

export type VipAccessOutcome = 'ok' | 'unauthenticated' | 'guest';

/** Pure decision, so the rule can be tested without a request. */
export function vipAccess(session: SessionLike | null | undefined): VipAccessOutcome {
  if (!session?.user?.id) return 'unauthenticated';
  if (session.user.provider === 'guest') return 'guest';
  return 'ok';
}

/**
 * The guard as route handlers use it: returns a response to send, or null to
 * carry on.
 *
 *     const denial = denyVipAccess(session);
 *     if (denial) return denial;
 *
 * 401 vs 403 is deliberate. An unauthenticated caller should sign in; a guest
 * IS authenticated and signing in again as a guest will not help — they need a
 * real provider. Collapsing both to 401 would send the client into a sign-in
 * loop that cannot succeed.
 */
export function denyVipAccess(session: SessionLike | null | undefined): NextResponse | null {
  switch (vipAccess(session)) {
    case 'unauthenticated':
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    case 'guest':
      return NextResponse.json(
        {
          error: 'Forbidden',
          // Named so the client can tell this apart from a plain 401 and offer
          // the right next step rather than bouncing to a guest sign-in.
          code: 'GUEST_SESSION_NOT_ELIGIBLE',
        },
        { status: 403 }
      );
    default:
      return null;
  }
}
