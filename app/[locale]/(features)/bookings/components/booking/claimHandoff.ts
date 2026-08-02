/**
 * Carries a booking-claim token across the OAuth round trip.
 *
 * `/api/bookings/create` issues the token in its response. The customer then
 * leaves for a provider, comes back signed in as somebody else entirely — a
 * different profile id — and the token is the only thing tying the two halves
 * together.
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

/**
 * The token as issued by `/api/bookings/create`, held from the moment the
 * booking is made until the customer either takes the upsell or leaves.
 *
 * Separate from the handoff key below because they answer different questions.
 * This one is "there is a claimable booking from this session"; the handoff is
 * "a claim is in flight across a redirect". Merging them would mean the upsell
 * could not tell a first page load from a return trip.
 */
const TOKEN_KEY = 'lengolf.claimToken';

export interface ClaimHandoff {
  bookingId: string;
  token: string;
}

/**
 * Store the token minted by the CREATE response.
 *
 * Minting moved there from the confirmation page, and the reason is the whole
 * security property. On the confirmation page the only thing proving the caller
 * was the guest who booked is a session — and a guest session resolves on email
 * alone, so anyone knowing a customer's email could obtain one, load their
 * booking, and be handed a token minted against their profile. Possession then
 * proved nothing.
 *
 * Issued from the create response, possession means what it is supposed to
 * mean: this browser is the one that made this booking, on the single request
 * where that is knowable.
 */
export function saveClaimToken(handoff: ClaimHandoff): void {
  if (typeof window === 'undefined') return;
  try {
    if (!handoff.bookingId || !handoff.token) return;
    window.sessionStorage.setItem(TOKEN_KEY, JSON.stringify(handoff));
  } catch {
    // Losing it means the upsell is simply not offered. Never throw into the
    // booking-success path.
  }
}

/** Read WITHOUT clearing — the upsell may be rendered several times. */
export function readClaimToken(bookingId: string): ClaimHandoff | null {
  const parsed = parseStored(TOKEN_KEY);
  // Bound to one booking: a token held from an earlier booking must not be
  // offered against a different confirmation page.
  return parsed && parsed.bookingId === bookingId ? parsed : null;
}

export function clearClaimToken(): void {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.removeItem(TOKEN_KEY);
  } catch {
    /* storage unavailable */
  }
}

function parseStored(key: string): ClaimHandoff | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.sessionStorage.getItem(key);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    const o = parsed as Record<string, unknown>;
    if (typeof o.bookingId !== 'string' || typeof o.token !== 'string') return null;
    if (!o.bookingId || !o.token) return null;
    return { bookingId: o.bookingId, token: o.token };
  } catch {
    try {
      window.sessionStorage.removeItem(key);
    } catch {
      /* storage unavailable */
    }
    return null;
  }
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
  const parsed = parseStored(KEY);
  if (typeof window !== 'undefined') {
    try {
      window.sessionStorage.removeItem(KEY);
    } catch {
      /* storage unavailable */
    }
  }
  return parsed;
}
