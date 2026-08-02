import 'server-only';
import { createHmac, timingSafeEqual } from 'crypto';

/**
 * Short-lived tokens that let a customer who has just booked as a GUEST claim
 * that booking onto an account they sign into moments later.
 *
 * ── Why a token at all ────────────────────────────────────────────────────
 * The claim cannot be authorised by ownership, because by definition the caller
 * is signing in as a DIFFERENT profile than the one that made the booking —
 * that is the entire point of the flow. `booking.user_id === session.user.id`
 * is false by design, so there is nothing on the request to check against.
 *
 * So the confirmation page mints a token while the guest session that created
 * the booking is still valid, and it rides sessionStorage across the OAuth
 * round trip. Possession of the token is the proof: it can only have been
 * issued to the browser that just completed that booking.
 *
 * ── Why NEXTAUTH_SECRET ───────────────────────────────────────────────────
 * Not a new secret, deliberately. Every module-load env assertion this project
 * has added became a Vercel build failure at `Collecting page data` —
 * MARKETING_PREFS_SECRET cost three merges, SHOPEEPAY_* cost a revert. Reusing
 * a secret that is already required in every environment removes that entire
 * class of problem. Note the env is read INSIDE the functions, never at module
 * scope, for the same reason.
 *
 * Consequence worth knowing: rotating NEXTAUTH_SECRET invalidates outstanding
 * claim tokens. They live 30 minutes, so that is a non-event.
 *
 * ── Shape ─────────────────────────────────────────────────────────────────
 *   {bookingId}.{profileId}.{expiresAtMs}.{base64url(hmacSHA256(payload))}
 *
 * The booking id and the issuing profile are IN the signed payload rather than
 * looked up later, so a token for one booking cannot be replayed against
 * another, and a token issued to one guest cannot be used to claim a booking
 * made by a different one.
 */

const TTL_MS = 30 * 60 * 1000;

/** Not a module-scope throw — see the note above about build failures. */
function secret(): string | null {
  const s = process.env.NEXTAUTH_SECRET;
  if (!s || s.length < 16) {
    console.error(
      '[ClaimToken] NEXTAUTH_SECRET missing or too short; booking claim is disabled.'
    );
    return null;
  }
  return s;
}

function base64url(buf: Buffer): string {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function sign(payload: string, key: string): string {
  return base64url(createHmac('sha256', key).update(payload).digest());
}

export interface ClaimTokenClaims {
  bookingId: string;
  profileId: string;
}

/**
 * Mint a token. Returns null rather than throwing when the secret is absent, so
 * a misconfigured environment degrades to "no upsell offered" instead of a
 * broken confirmation page.
 */
export function mintClaimToken(
  claims: ClaimTokenClaims,
  now: number = Date.now()
): string | null {
  const key = secret();
  if (!key) return null;

  // A dot is the field separator, so it must not appear inside a field or the
  // parse would split wrongly. Booking ids are `BK` + alphanumerics and profile
  // ids are UUIDs, so neither can — but assert rather than assume, because a
  // future id format could quietly make tokens forgeable by field-shifting.
  if (claims.bookingId.includes('.') || claims.profileId.includes('.')) {
    console.error('[ClaimToken] id contains a separator; refusing to mint.');
    return null;
  }

  const expiresAt = now + TTL_MS;
  const payload = `${claims.bookingId}.${claims.profileId}.${expiresAt}`;
  return `${payload}.${sign(payload, key)}`;
}

export type ClaimTokenFailure =
  | 'no_secret'
  | 'malformed'
  | 'bad_signature'
  | 'expired'
  | 'booking_mismatch';

export type ClaimTokenResult =
  | { ok: true; claims: ClaimTokenClaims }
  | { ok: false; reason: ClaimTokenFailure };

/**
 * Verify a token against the booking it is being used for.
 *
 * Never throws, for any input: callers pass a value that came from the network.
 * `expectedBookingId` is required rather than optional so a caller cannot
 * accidentally verify a token in the abstract and then apply it to a different
 * booking — the binding is the whole security property.
 */
export function verifyClaimToken(
  token: string | null | undefined,
  expectedBookingId: string,
  now: number = Date.now()
): ClaimTokenResult {
  const key = secret();
  if (!key) return { ok: false, reason: 'no_secret' };

  if (typeof token !== 'string' || token.length === 0) {
    return { ok: false, reason: 'malformed' };
  }

  const parts = token.split('.');
  if (parts.length !== 4) return { ok: false, reason: 'malformed' };

  const [bookingId, profileId, expiresAtRaw, providedSig] = parts;
  if (!bookingId || !profileId || !expiresAtRaw || !providedSig) {
    return { ok: false, reason: 'malformed' };
  }

  const expiresAt = Number(expiresAtRaw);
  if (!Number.isSafeInteger(expiresAt)) return { ok: false, reason: 'malformed' };

  // Signature BEFORE expiry: the expiry is attacker-supplied until the
  // signature has vouched for it, so reading it first would be trusting
  // unverified input to decide whether to keep going.
  const expectedSig = sign(`${bookingId}.${profileId}.${expiresAt}`, key);
  const a = Buffer.from(providedSig);
  const b = Buffer.from(expectedSig);
  // timingSafeEqual throws on a length mismatch, so check that first — and a
  // differing length is already a failure.
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return { ok: false, reason: 'bad_signature' };
  }

  if (now >= expiresAt) return { ok: false, reason: 'expired' };

  // The token is authentic, but authentic for a DIFFERENT booking is still a
  // refusal — this is what stops one confirmation page's token being replayed
  // against another booking id.
  if (bookingId !== expectedBookingId) {
    return { ok: false, reason: 'booking_mismatch' };
  }

  return { ok: true, claims: { bookingId, profileId } };
}
