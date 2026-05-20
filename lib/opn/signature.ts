import { createHmac, timingSafeEqual } from 'crypto';

/**
 * Pure HMAC helpers for Opn webhook signatures. No env deps so
 * unit tests verify the worked-example output without stubbing.
 *
 * Algorithm (per Opn webhook documentation):
 *   HMAC-SHA256 over `${timestamp}.${rawBody}` with a shared secret,
 *   hex-encoded. The webhook delivers the signature in the
 *   `Omise-Signature` header. During a key-rotation window the
 *   header carries multiple comma-separated signatures; the verifier
 *   passes if ANY secret verifies ANY signature.
 */

export function signPayload(timestamp: string, rawBody: string, secret: string): string {
  return createHmac('sha256', secret).update(`${timestamp}.${rawBody}`, 'utf8').digest('hex');
}

function safeHexToBuffer(hex: string): Buffer | null {
  if (!/^[0-9a-fA-F]+$/.test(hex)) return null;
  if (hex.length % 2 !== 0) return null;
  return Buffer.from(hex, 'hex');
}

/**
 * Verify in constant time. Returns false on any malformed input —
 * never throws. Accepts an array of secrets so dual-secret rotation
 * (active + previous, for the 24h window after key change) works
 * without code changes.
 */
export function verifyPayload(
  rawBody: string,
  headerSig: string | null | undefined,
  headerTs: string | null | undefined,
  secrets: readonly string[]
): boolean {
  if (!headerSig || !headerTs || secrets.length === 0) return false;

  const provided: Buffer[] = [];
  for (const part of headerSig.split(',')) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    const buf = safeHexToBuffer(trimmed);
    if (buf) provided.push(buf);
  }
  if (provided.length === 0) return false;

  for (const secret of secrets) {
    const expectedBuf = Buffer.from(signPayload(headerTs, rawBody, secret), 'hex');
    for (const p of provided) {
      if (p.length !== expectedBuf.length) continue;
      try {
        if (timingSafeEqual(p, expectedBuf)) return true;
      } catch {
        // length mismatch (shouldn't reach due to pre-check) — ignore
      }
    }
  }
  return false;
}
