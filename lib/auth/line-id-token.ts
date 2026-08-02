import 'server-only';
import { createHash } from 'crypto';
import { appCache } from '@/lib/cache';

/**
 * Server-side verification of a LIFF ID token.
 *
 * ── The hole this closes ──────────────────────────────────────────────────
 * `/api/bookings/create` accepts an `x-line-user-id` header that is
 * client-supplied and never validated. Any non-empty string authenticates, and
 * if no profile matches the route INSERTS one with the attacker-chosen
 * `provider_id`. That is an unauthenticated write that both impersonates
 * existing LINE users and mints arbitrary profile rows.
 *
 * ── Why the audience is NOT the NextAuth channel ──────────────────────────
 * A LIFF id is `{channelId}-{suffix}`, and comparing the prefix of
 * `NEXT_PUBLIC_LIFF_BOOKING_ID` against `NEXT_PUBLIC_LINE_CLIENT_ID` shows they
 * are DIFFERENT channels. The token's `aud` is the LIFF app's own Login
 * channel; using the NextAuth one would reject every token that ever arrives —
 * a silent, total outage of LINE bookings.
 *
 * The channel id is therefore derived from the LIFF id rather than configured
 * separately, so the two cannot drift and there is no new env var to forget in
 * an environment (this project has lost three merges and one release to exactly
 * that).
 *
 * ── Fails closed ──────────────────────────────────────────────────────────
 * Any error — network, malformed response, missing configuration — returns
 * null, which callers treat as "not verified". A verifier that fails OPEN is
 * not a verifier.
 *
 * ── No module-scope throw ─────────────────────────────────────────────────
 * Config is read inside the function. A module-load assertion here would fail
 * the Vercel build at `Collecting page data`, which is how MARKETING_PREFS_SECRET
 * cost three merges and SHOPEEPAY_* cost a revert.
 */

const VERIFY_ENDPOINT = 'https://api.line.me/oauth2/v2.1/verify';
const CACHE_PREFIX = 'line_idtoken_';
const MAX_CACHE_SECONDS = 300;

/** The LIFF app's Login channel id, i.e. the part before the dash. */
function liffChannelId(): string | null {
  const liffId = process.env.NEXT_PUBLIC_LIFF_BOOKING_ID;
  if (!liffId) {
    console.error('[LineAuth] NEXT_PUBLIC_LIFF_BOOKING_ID is not set; cannot verify ID tokens.');
    return null;
  }
  const channelId = liffId.split('-')[0];
  if (!/^\d{8,}$/.test(channelId)) {
    console.error('[LineAuth] LIFF id is not in the expected {channelId}-{suffix} form.');
    return null;
  }
  return channelId;
}

interface LineVerifyResponse {
  iss?: string;
  sub?: string;
  aud?: string;
  exp?: number;
}

/**
 * Returns the VERIFIED LINE user id, or null.
 *
 * Never returns a value derived from anything the client asserted — the `sub`
 * comes from LINE's response, not from the request.
 */
export async function verifyLineIdToken(idToken: string | null | undefined): Promise<string | null> {
  if (!idToken || typeof idToken !== 'string') return null;

  const channelId = liffChannelId();
  if (!channelId) return null;

  // Cache on a hash of the token, never the token itself: cache keys end up in
  // logs and dumps, and this one is a bearer credential. A miss costs one API
  // call and can never cause a security failure, which is why per-instance
  // caching is fine here (unlike rate limiting, where it would be wrong).
  const cacheKey = CACHE_PREFIX + createHash('sha256').update(idToken).digest('hex');
  const cached = appCache.get<string>(cacheKey);
  if (cached) return cached;

  // Never let a slow third party hold a booking request open.
  //
  // NOT `AbortSignal.timeout()`. That is Node 17.3+ and absent from some
  // environments (jsdom, older runtimes), where it does not degrade — it THROWS
  // on the way in. Since this function fails closed, a throw here would return
  // null for every call and, once enforcement is on, 401 every LINE booking on
  // that runtime. A controller plus a timer works everywhere.
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5000);

  let payload: LineVerifyResponse;
  try {
    const res = await fetch(VERIFY_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ id_token: idToken, client_id: channelId }),
      signal: controller.signal,
    });

    if (!res.ok) {
      console.warn('[LineAuth] verify endpoint rejected the token', { status: res.status });
      return null;
    }
    payload = await res.json();
  } catch (err) {
    // Network failure, timeout, malformed JSON. Fail closed.
    console.error('[LineAuth] verify call failed', err);
    return null;
  } finally {
    // Always clear it, or a fast response leaves a pending handle that can hold
    // the serverless instance open against its maxDuration.
    clearTimeout(timer);
  }

  // LINE validates the signature and the audience for us, but assert both
  // independently rather than trusting the call was made correctly — a wrong
  // `client_id` would otherwise silently accept tokens for another channel.
  if (payload.iss !== 'https://access.line.me') return null;
  if (payload.aud !== channelId) return null;
  if (typeof payload.sub !== 'string' || payload.sub.length === 0) return null;

  const nowSeconds = Math.floor(Date.now() / 1000);
  if (typeof payload.exp !== 'number' || payload.exp <= nowSeconds) return null;

  // Never cache past the token's own expiry, or a revoked/expired token would
  // keep working for up to the cache TTL.
  const ttl = Math.min(MAX_CACHE_SECONDS, payload.exp - nowSeconds);
  if (ttl > 0) appCache.set(cacheKey, payload.sub, ttl);

  return payload.sub;
}
