/**
 * Carries a booking-claim token across the OAuth round trip.
 *
 * The confirmation page mints the token while the GUEST session that created
 * the booking is still valid. The customer then leaves for a provider, comes
 * back signed in as somebody else entirely — a different profile id — and the
 * token is the only thing tying the two halves together.
 *
 * sessionStorage, like the contact draft: same tab, one navigation, gone
 * afterwards. Not localStorage, which would leave a claim for a booking lying
 * around after the tab closed.
 *
 * The token is short-lived (30 minutes) and single-use by convention here:
 * `takeClaimHandoff` clears as it reads, so a failed claim is not retried
 * silently on every subsequent page load.
 */

const KEY = 'lengolf.claimHandoff';

export interface ClaimHandoff {
  bookingId: string;
  token: string;
}

export function saveClaimHandoff(handoff: ClaimHandoff): void {
  if (typeof window === 'undefined') return;
  try {
    if (!handoff.bookingId || !handoff.token) return;
    window.sessionStorage.setItem(KEY, JSON.stringify(handoff));
  } catch {
    // Private mode, quota, storage disabled. Losing the handoff means the
    // customer signs in and simply is not offered the link — worse, not broken.
    // Never throw into the click handler and cancel the sign-in itself.
  }
}

/** Read and CLEAR, so a failed claim is not retried on every page load. */
export function takeClaimHandoff(): ClaimHandoff | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.sessionStorage.getItem(KEY);
    if (!raw) return null;
    window.sessionStorage.removeItem(KEY);

    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    const o = parsed as Record<string, unknown>;
    if (typeof o.bookingId !== 'string' || typeof o.token !== 'string') return null;
    if (!o.bookingId || !o.token) return null;

    return { bookingId: o.bookingId, token: o.token };
  } catch {
    try {
      window.sessionStorage.removeItem(KEY);
    } catch {
      /* storage unavailable */
    }
    return null;
  }
}
