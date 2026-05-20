// lib/opn/config.ts
import 'server-only';

/**
 * Opn Payments environment configuration.
 *
 * Asserts at module-load time that all required OPN_* vars are
 * present and shaped correctly. Mirrors lib/shopeepay/config.ts and
 * lib/marketing-prefs/token.ts — we want builds to fail fast (during
 * Next's "Collecting page data" phase) rather than silently signing
 * requests with `undefined`.
 *
 * All envs must be set in Vercel Preview + Development before
 * merging code that imports this file. Setting them late guarantees
 * a `Failed to collect page data` build error on every preview PR
 * until the var lands. See CLAUDE.md "Marketing-consent deploy notes".
 */

function required(name: string, value: string | undefined, minLen = 1): string {
  if (!value || value.length < minLen) {
    throw new Error(
      `${name} is required for Opn Payments integration. Set it in .env.local ` +
        `and across all Vercel environments (Production + Preview + Development).`
    );
  }
  return value;
}

const PUBLIC_KEY = required('OPN_PUBLIC_KEY', process.env.OPN_PUBLIC_KEY);
const SECRET_KEY = required('OPN_SECRET_KEY', process.env.OPN_SECRET_KEY);
const WEBHOOK_SECRET = required('OPN_WEBHOOK_SECRET', process.env.OPN_WEBHOOK_SECRET, 16);
const WEBHOOK_SECRET_PREVIOUS = process.env.OPN_WEBHOOK_SECRET_PREVIOUS || null;
const API_VERSION = required('OPN_API_VERSION', process.env.OPN_API_VERSION);

// Production-vs-test coherence guard. Opn switches modes by key prefix
// (skey_test_* vs skey_*), NOT by base URL. If VERCEL_ENV says we're
// in production but the secret key still carries the _test_ infix,
// refuse to boot — same shape as ShopeePay's UAT-host guard.
const IS_PROD_DEPLOY = process.env.VERCEL_ENV === 'production';
const IS_LIVE_KEY = SECRET_KEY.startsWith('skey_') && !SECRET_KEY.startsWith('skey_test_');

if (IS_PROD_DEPLOY && !IS_LIVE_KEY) {
  throw new Error(
    `OPN_SECRET_KEY is a TEST key on a production deployment. ` +
      `Refusing to boot — fix the env var before redeploying.`
  );
}

export const opnConfig = {
  publicKey: PUBLIC_KEY,
  secretKey: SECRET_KEY,
  webhookSecret: WEBHOOK_SECRET,
  webhookSecretPrevious: WEBHOOK_SECRET_PREVIOUS,
  apiVersion: API_VERSION,
  isLiveMode: IS_LIVE_KEY,
} as const;

/** Returns all webhook secrets currently accepted by the verifier. */
export function webhookSecrets(): readonly string[] {
  return [WEBHOOK_SECRET, WEBHOOK_SECRET_PREVIOUS].filter(
    (s): s is string => typeof s === 'string' && s.length > 0
  );
}
