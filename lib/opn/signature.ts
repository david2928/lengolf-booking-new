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
 *
 * Key-encoding ambiguity: Opn's docs say the dashboard webhook secret
 * is "a Base64-encoded HMAC secret key — decode it before proceeding",
 * but real-world integrations differ on whether the raw string or the
 * decoded bytes are the HMAC key. We try BOTH conventions per secret
 * (constant-time each) and report which one matched so the first UAT
 * delivery settles the question from logs alone.
 */

export type KeyKind = 'raw' | 'base64';

export function signPayload(
  timestamp: string,
  rawBody: string,
  secret: string | Buffer
): string {
  return createHmac('sha256', secret).update(`${timestamp}.${rawBody}`, 'utf8').digest('hex');
}

function safeHexToBuffer(hex: string): Buffer | null {
  if (!/^[0-9a-fA-F]+$/.test(hex)) return null;
  if (hex.length % 2 !== 0) return null;
  return Buffer.from(hex, 'hex');
}

function candidateKeys(secret: string): Array<{ key: string | Buffer; kind: KeyKind }> {
  const candidates: Array<{ key: string | Buffer; kind: KeyKind }> = [
    { key: secret, kind: 'raw' },
  ];
  // Only attempt Base64 decoding when the secret is shaped like Base64
  // (strict alphabet + padding) — otherwise Buffer.from silently
  // produces garbage bytes that can never match anyway.
  if (secret.length % 4 === 0 && /^[A-Za-z0-9+/]+={0,2}$/.test(secret)) {
    const decoded = Buffer.from(secret, 'base64');
    if (decoded.length > 0) candidates.push({ key: decoded, kind: 'base64' });
  }
  return candidates;
}

export interface VerifyResult {
  valid: boolean;
  /** Which key-encoding convention matched (null when invalid). */
  keyKind: KeyKind | null;
}

/**
 * Verify in constant time. Returns { valid: false } on any malformed
 * input — never throws. Accepts an array of secrets so dual-secret
 * rotation (active + previous, for the 24h window after key change)
 * works without code changes.
 */
export function verifyPayloadDetailed(
  rawBody: string,
  headerSig: string | null | undefined,
  headerTs: string | null | undefined,
  secrets: readonly string[]
): VerifyResult {
  if (!headerSig || !headerTs || secrets.length === 0) {
    return { valid: false, keyKind: null };
  }

  const provided: Buffer[] = [];
  for (const part of headerSig.split(',')) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    const buf = safeHexToBuffer(trimmed);
    if (buf) provided.push(buf);
  }
  if (provided.length === 0) return { valid: false, keyKind: null };

  for (const secret of secrets) {
    for (const { key, kind } of candidateKeys(secret)) {
      const expectedBuf = Buffer.from(signPayload(headerTs, rawBody, key), 'hex');
      for (const p of provided) {
        if (p.length !== expectedBuf.length) continue;
        try {
          if (timingSafeEqual(p, expectedBuf)) return { valid: true, keyKind: kind };
        } catch {
          // length mismatch (shouldn't reach due to pre-check) — ignore
        }
      }
    }
  }
  return { valid: false, keyKind: null };
}

/** Boolean-only wrapper kept for existing callers/tests. */
export function verifyPayload(
  rawBody: string,
  headerSig: string | null | undefined,
  headerTs: string | null | undefined,
  secrets: readonly string[]
): boolean {
  return verifyPayloadDetailed(rawBody, headerSig, headerTs, secrets).valid;
}
