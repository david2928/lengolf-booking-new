import { createHmac, timingSafeEqual } from 'crypto';

/**
 * Pure HMAC helpers for ShopeePay's signature scheme. Kept in their
 * own module (no env dependency) so unit tests can verify the
 * worked-example output without stubbing SHOPEEPAY_* env vars.
 *
 * Algorithm: HMAC-SHA256 over the raw request body with the merchant
 * secret key, encoded as Base64. The signature is sent in the
 * `X-Airpay-Req-H` header.
 */

/**
 * Sign a raw payload with the given secret. Returns standard
 * (non-URL-safe) Base64.
 */
export function signPayload(rawBody: string, secret: string): string {
  return createHmac('sha256', secret).update(rawBody, 'utf8').digest('base64');
}

/**
 * Verify a payload signature in constant time.
 * Returns false on any malformed input — never throws.
 */
export function verifyPayload(
  rawBody: string,
  headerValue: string | null | undefined,
  secret: string
): boolean {
  if (!headerValue) return false;

  const expected = signPayload(rawBody, secret);
  const expectedBuf = Buffer.from(expected, 'base64');
  const providedBuf = Buffer.from(headerValue, 'base64');

  // timingSafeEqual throws on length mismatch; pre-check guards us
  // and also fails fast on truncated/corrupt header values.
  if (expectedBuf.length === 0 || providedBuf.length !== expectedBuf.length) {
    return false;
  }
  try {
    return timingSafeEqual(expectedBuf, providedBuf);
  } catch {
    return false;
  }
}
