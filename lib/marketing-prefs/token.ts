import 'server-only';
import { createHmac, timingSafeEqual } from 'crypto';

/**
 * Marketing-preferences token utilities.
 *
 * Used to mint and verify customer-scoped tokens that authorize unauthenticated
 * access to the customer-preference center (`/preferences/[token]`).
 *
 * Token format: `{customerId}.{base64url(hmacSHA256(customerId, secret))}`
 *
 * Design notes:
 * - No expiry — emails sent today must remain unsubscribable years later
 *   (industry norm; rotating MARKETING_PREFS_SECRET invalidates all old links).
 * - The token IS the auth on a public route, so verification uses
 *   `crypto.timingSafeEqual` to avoid leaking signature validity bit-by-bit.
 * - `verifyCustomerToken` returns `null` for ANY malformed input — never throws.
 *   Callers can safely pass arbitrary URL path segments.
 *
 * Boot-time guarantee: this module throws on first import if
 * `MARKETING_PREFS_SECRET` is missing or shorter than 32 bytes. Prevents
 * shipping a production build that signs every link with `undefined`.
 */

const SECRET_ENV = process.env.MARKETING_PREFS_SECRET;
// Floor of 64 characters. The expected format is `openssl rand -hex 32`
// (64 hex chars = 32 bytes of entropy). Base64-encoded 32 bytes = ~44
// chars and would be rejected — operators must use hex or pad. Assuming
// hex encoding, this guards against the "32 chars looks like 32 bytes
// but is only 16 bytes of entropy" misconfiguration.
if (!SECRET_ENV || SECRET_ENV.length < 64) {
  throw new Error(
    'MARKETING_PREFS_SECRET is required and must be at least 64 hex characters ' +
      '(32 bytes of entropy). Generate with `openssl rand -hex 32` and set in ' +
      '.env.local plus all Vercel environments.'
  );
}
const SECRET = SECRET_ENV;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function base64url(buf: Buffer): string {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64url(s: string): Buffer | null {
  try {
    // Reject any character outside the base64url alphabet up-front. atob/Buffer
    // is lenient, but we want hard failure on garbage input.
    if (!/^[A-Za-z0-9_-]+$/.test(s)) return null;
    const padded = s.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (s.length % 4)) % 4);
    return Buffer.from(padded, 'base64');
  } catch {
    return null;
  }
}

function hmac(customerId: string): Buffer {
  return createHmac('sha256', SECRET).update(customerId).digest();
}

export function signCustomerToken(customerId: string): string {
  if (!UUID_RE.test(customerId)) {
    // Avoid echoing the input back into the error — it might land in logs.
    throw new Error('signCustomerToken: customerId must be a UUID');
  }
  return `${customerId}.${base64url(hmac(customerId))}`;
}

/**
 * Verify a token and return the customerId, or `null` if invalid/malformed.
 * Constant-time signature comparison.
 */
export function verifyCustomerToken(token: string): string | null {
  if (typeof token !== 'string') return null;

  const dot = token.indexOf('.');
  if (dot <= 0 || dot === token.length - 1) return null;

  const customerId = token.slice(0, dot);
  const sig = token.slice(dot + 1);

  if (!UUID_RE.test(customerId)) return null;

  const provided = fromBase64url(sig);
  if (!provided) return null;

  const expected = hmac(customerId);
  if (provided.length !== expected.length) return null;

  return timingSafeEqual(provided, expected) ? customerId : null;
}

/**
 * Build a fully-qualified preference-center URL for a given customer.
 * Used by the (future) email-sending pipeline to compose unsubscribe links
 * for email footers.
 */
export function generatePreferenceUrl(customerId: string): string {
  const base = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/+$/, '') ?? '';
  if (!base) {
    throw new Error('generatePreferenceUrl: NEXT_PUBLIC_APP_URL is not set.');
  }
  return `${base}/preferences/${signCustomerToken(customerId)}`;
}
