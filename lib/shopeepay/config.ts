import 'server-only';

/**
 * ShopeePay environment configuration.
 *
 * Asserts at module-load time that all required SHOPEEPAY_* vars are
 * present and shaped correctly. Mirrors lib/marketing-prefs/token.ts —
 * we want builds to fail fast (during Next's "Collecting page data"
 * phase) rather than silently signing requests with `undefined`.
 *
 * All envs must be set in Production + Preview + Development before
 * merging code that imports this file. Setting them late guarantees
 * a `Failed to collect page data` build error on every preview PR
 * until the var lands. See CLAUDE.md "Marketing-consent deploy notes"
 * for the full failure mode.
 */

function required(name: string, value: string | undefined): string {
  if (!value || value.length === 0) {
    throw new Error(
      `${name} is required for ShopeePay integration. Set it in .env.local ` +
        `and across all Vercel environments (Production + Preview + Development).`
    );
  }
  return value;
}

const RAW_BASE_URL = required('SHOPEEPAY_BASE_URL', process.env.SHOPEEPAY_BASE_URL);

// Strip trailing slashes so callers can do `${BASE_URL}/v3/...` without
// double-slashing. ShopeePay's domain naming is country-scoped:
//   Staging:    api.uat.wallet.airpay.co.th
//   Production: api.wallet.airpay.co.th
const BASE_URL = RAW_BASE_URL.replace(/\/+$/, '');

const CLIENT_ID = required('SHOPEEPAY_CLIENT_ID', process.env.SHOPEEPAY_CLIENT_ID);
const SECRET_KEY = required('SHOPEEPAY_SECRET_KEY', process.env.SHOPEEPAY_SECRET_KEY);
const MERCHANT_EXT_ID = required(
  'SHOPEEPAY_MERCHANT_EXT_ID',
  process.env.SHOPEEPAY_MERCHANT_EXT_ID
);
const STORE_EXT_ID = required('SHOPEEPAY_STORE_EXT_ID', process.env.SHOPEEPAY_STORE_EXT_ID);

// Production-vs-staging coherence guard. If VERCEL_ENV says we're in
// production but BASE_URL still points at the UAT host (or vice versa),
// throw at boot. Same shape as the MARKETING_PREFS_SECRET length floor
// — better to break the build than ship a misconfigured payment path.
const IS_PROD_DEPLOY = process.env.VERCEL_ENV === 'production';
const IS_PROD_BASE = !BASE_URL.includes('.uat.');

if (IS_PROD_DEPLOY && !IS_PROD_BASE) {
  throw new Error(
    `SHOPEEPAY_BASE_URL is set to a UAT host (${BASE_URL}) on a production ` +
      `deployment. Refusing to boot — fix the env var before redeploying.`
  );
}

export const shopeepayConfig = {
  baseUrl: BASE_URL,
  clientId: CLIENT_ID,
  secretKey: SECRET_KEY,
  merchantExtId: MERCHANT_EXT_ID,
  storeExtId: STORE_EXT_ID,
  isProductionEnv: IS_PROD_BASE,
} as const;

/** True when running against api.wallet.airpay.co.th (production gateway). */
export function isProductionGateway(): boolean {
  return shopeepayConfig.isProductionEnv;
}
