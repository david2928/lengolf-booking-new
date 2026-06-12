# Opn Payments Migration — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the reverted ShopeePay CwS integration with Opn Payments (Omise) inline card tokenization for course-club-rental payments. Card-only in v1; PromptPay deferred to v1.1.

**Architecture:** Mirror `lib/shopeepay/*` layout 1:1 under `lib/opn/*`, lift two gateway-agnostic helpers (`markRentalAsPaid`, `order-summary`) into a shared `lib/payments/*` namespace so both gateways consume the same primitive during the 60-day parallel-run window. Webhook (`/api/webhooks/opn`) is authoritative for `paid` flips; `/api/payments/opn/return` polling is a graceful fallback (race-safe via the existing `confirmation_email_sent_at` claim). Custom React card form (`<PayElement>`) tokenizes via Omise.js (`Omise.createToken('card', {…})`); server-side `/api/payments/opn/intent` creates the charge.

**Tech Stack:** Next.js 15 / React 18 / next-intl v3, Supabase PostgreSQL, NextAuth, Tailwind. New deps: `omise` (omise-node SDK). Test runner: Jest. Signature: HMAC-SHA256 over `${timestamp}.${rawBody}`, hex-encoded, with dual-secret rotation.

**Source spec:** [`docs/superpowers/specs/2026-05-19-opn-payments-migration-design.md`](../specs/2026-05-19-opn-payments-migration-design.md) (commit `d52347a`).

**Branch + worktree state:** `feat/opn-payments` off `origin/claude/admiring-ride-526456` @ `86e9849`, worktree at `.claude/worktrees/opn-payments/`. Upstream tracking explicitly unset (don't auto-track ShopeePay UAT branch).

---

## File structure

**New files (created in this plan):**

| Path | Purpose |
|---|---|
| `supabase/migrations/20260520000000_add_opn_fields_to_payment_transactions.sql` | Schema additions |
| `lib/opn/config.ts` | Env-var assertion + mode-coherence guard |
| `lib/opn/signature.ts` | Pure HMAC sign/verify (dual-secret) |
| `lib/opn/types.ts` | Narrowed omise-node response types + `classifyFailure` |
| `lib/opn/client.ts` | Omise SDK wrapper (createCharge / retrieveCharge / createRefund / retrieveCharge) |
| `lib/opn/handleRefundNotify.ts` | Mirror of `lib/shopeepay/handleRefundNotify.ts` |
| `lib/payments/order-summary.ts` | Lifted from `lib/shopeepay/order-summary.ts` |
| `lib/payments/markRentalAsPaid.ts` | Lifted from `lib/shopeepay/markRentalAsPaid.ts`, refactored for gatewayMetadata |
| `lib/payments/markRefundAsRefunded.ts` | Lifted from `lib/shopeepay/markRefundAsRefunded.ts` |
| `app/api/webhooks/opn/route.ts` | Webhook handler (charge.complete / charge.create / refund.create) |
| `app/api/payments/opn/intent/route.ts` | POST: tokenize → charge → 3DS-or-result |
| `app/api/payments/opn/return/route.ts` | GET: polling endpoint, pending → terminal probe |
| `app/[locale]/payment/checkout/page.tsx` | Server Component: order summary + `<PayElement>` |
| `app/[locale]/payment/checkout/PayElement.tsx` | Client island: card form + Omise.createToken |
| `app/[locale]/payment/return/page.tsx` | Client page: state machine (checking → success/failed) |
| `components/payment/PoweredByOpn.tsx` | Trust-signal mark, mirrors `ShopeepayWordmark` |
| `__tests__/opn-signature.test.ts` | Pure unit tests for sign/verify + dual-rotation |
| `__tests__/opn-classify-failure.test.ts` | Pure unit tests for failure-code mapping |
| `__tests__/setup-opn-env.ts` | Jest setup file injecting test OPN_* env so config-asserting tests don't crash |
| `docs/superpowers/specs/opn-dev-setup.md` | Local dev: omise CLI / ngrok webhook forwarding |
| `docs/superpowers/specs/opn-uat-checklist.md` | Manual UAT walkthrough script |

**Modified files:**

| Path | Change |
|---|---|
| `package.json` | Add `omise` dependency |
| `.env.example` | Add OPN_* placeholders + comments |
| `next.config.mjs` (or `next.config.ts` — check actual filename) | Add `cdn.omise.co` to CSP `script-src` if a CSP exists; if not, no-op |
| `jest.config.js` | Add `setupFilesAfterEnv` pointing at `__tests__/setup-opn-env.ts` |
| `lib/shopeepay/order-summary.ts` | Becomes a re-export shim: `export * from '@/lib/payments/order-summary'` |
| `lib/shopeepay/markRentalAsPaid.ts` | Becomes a re-export shim: `export * from '@/lib/payments/markRentalAsPaid'` |
| `lib/shopeepay/markRefundAsRefunded.ts` | Becomes a re-export shim: `export * from '@/lib/payments/markRefundAsRefunded'` |
| `app/api/webhooks/shopeepay/route.ts` | No-op (import path unchanged thanks to re-export shims; sanity-check the build still passes) |
| `messages/en.json`, `messages/th.json`, `messages/ko.json`, `messages/ja.json`, `messages/zh.json` | Add `payment.checkout.*` and `payment.return.*` keys |

**Not touched:**
- `lib/shopeepay/{config,signature,client,types,handleRefundNotify}.ts` — gateway-specific, stays parallel.
- `app/api/payments/shopeepay/*` — ShopeePay routes intact.
- `app/[locale]/payment/start/*`, `app/[locale]/payment/result/*` — ShopeePay UI pages intact (UAT alias still depends on them).
- `components/payment/{OrderSummaryCard,ShopeepayWordmark,HandoffClient}.tsx` — reused as-is by Opn pages (`OrderSummaryCard`) or untouched (`ShopeepayWordmark`, `HandoffClient`).

---

## Phase A — Foundation

### Task 1: Install Omise SDK + update .env.example

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json` (auto)
- Modify: `.env.example`

- [ ] **Step 1: Install the omise SDK**

```bash
npm install omise
```

Expected: adds `"omise": "^0.x.x"` to `dependencies` in `package.json`. The `omise` package ships its own TypeScript types as of v0.12+; no `@types/omise` needed.

Verify with a small script (avoids PowerShell quoting issues). Save as `/tmp/omise-verify.js`:

```js
const Omise = require('omise');
const client = Omise({ secretKey: 'skey_test_dummy_for_init_only' });
console.log('exports:', Object.keys(client).sort());
```

Run:

```bash
node /tmp/omise-verify.js
```

Expected: prints an array including at minimum `charges`, `customers`, `refunds`, `sources`, `events`, `tokens`. If `charges`, `refunds` are missing, the installed `omise` package version is too old — bump to latest with `npm install omise@latest`.

Clean up: `rm /tmp/omise-verify.js`.

- [ ] **Step 2: Add OPN_* to .env.example**

Append to `.env.example`:

```bash
# Opn Payments (formerly Omise). v1: card-only. Get keys from
# https://dashboard.omise.co/test/keys (test) or /keys (live).
# CRITICAL: set OPN_* in Vercel Preview + Development before first
# push of code that imports lib/opn/config.ts. Production stays
# empty until cutover (see CLAUDE.md "Marketing-consent deploy notes"
# for the failure mode).
OPN_PUBLIC_KEY=          # pkey_test_* (test) / pkey_* (live). Safe to expose to browser.
OPN_SECRET_KEY=          # skey_test_* / skey_*. Server-only. Coherence-guarded: prod must be skey_*.
OPN_WEBHOOK_SECRET=      # HMAC signing secret from Omise dashboard webhook page.
OPN_WEBHOOK_SECRET_PREVIOUS=  # Optional. Set ONLY during a 24h key rotation window.
OPN_API_VERSION=2019-05-29    # Pin to a known stable version.
```

- [ ] **Step 3: Run typecheck**

```bash
npm run typecheck
```

Expected: PASS (no Opn code yet; nothing should regress).

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json .env.example
git commit -m "feat(opn): add omise SDK dependency + .env.example placeholders

No code changes yet — preparing the dependency surface for the
Opn Payments integration. .env.example carries the assertion-pattern
warning so future contributors don't trip the build-time guard."
```

---

### Task 2: Apply schema migration to Supabase

**Files:**
- Create: `supabase/migrations/20260520000000_add_opn_fields_to_payment_transactions.sql`

- [ ] **Step 1: Write the migration**

```sql
-- 20260520000000_add_opn_fields_to_payment_transactions.sql
-- Add Opn-Payments-specific columns to the existing payment_transactions
-- table. All columns are nullable / defaulted so existing ShopeePay rows
-- keep working unchanged. Idempotent — safe to re-run.

ALTER TABLE public.payment_transactions
  ADD COLUMN IF NOT EXISTS gateway_charge_id TEXT,
  ADD COLUMN IF NOT EXISTS gateway_token_id TEXT,
  ADD COLUMN IF NOT EXISTS auth_code TEXT,
  ADD COLUMN IF NOT EXISTS failure_code TEXT,
  ADD COLUMN IF NOT EXISTS failure_message TEXT,
  ADD COLUMN IF NOT EXISTS card_brand TEXT,
  ADD COLUMN IF NOT EXISTS card_last4 TEXT,
  ADD COLUMN IF NOT EXISTS is_3ds BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS transaction_fee_rate NUMERIC(5,3),
  ADD COLUMN IF NOT EXISTS transaction_vat_rate NUMERIC(5,3);

-- Critical: webhook handler joins on gateway_charge_id every callback.
CREATE INDEX IF NOT EXISTS payment_transactions_gateway_charge_id_idx
  ON public.payment_transactions (gateway_charge_id);
```

- [ ] **Step 2: Apply via Supabase MCP**

Use the Supabase MCP `apply_migration` tool against the linked project (project ref in `.vercel/project.json`). Migration name: `add_opn_fields_to_payment_transactions`.

Expected: migration applied, no errors. Verify by listing the columns:

```sql
SELECT column_name FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'payment_transactions'
  AND column_name IN ('gateway_charge_id','gateway_token_id','auth_code',
    'failure_code','failure_message','card_brand','card_last4',
    'is_3ds','transaction_fee_rate','transaction_vat_rate');
```

Expected: 10 rows.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260520000000_add_opn_fields_to_payment_transactions.sql
git commit -m "feat(opn): add gateway-agnostic + Opn-specific columns to payment_transactions

10 new nullable columns + 1 index. ShopeePay rows unaffected (all
ADDs are IF NOT EXISTS, all columns nullable or defaulted). The
gateway_charge_id index is critical — webhook handler joins on it
on every Omise callback."
```

---

### Task 3: lib/opn/config.ts (env-assertion + coherence guard)

**Files:**
- Create: `lib/opn/config.ts`
- Create: `__tests__/setup-opn-env.ts`
- Modify: `jest.config.js`

- [ ] **Step 1: Add a jest setup that injects test env vars**

The config module asserts at import-time. Without this, any test that imports a module that transitively imports `lib/opn/config.ts` will crash on jest startup with "OPN_PUBLIC_KEY is required".

Create `__tests__/setup-opn-env.ts`:

```ts
// Jest setup — runs BEFORE each test file is loaded. Inject test
// OPN_* values so module-load assertions in lib/opn/config.ts pass
// during tests. These are NOT real keys — they're shape-correct
// strings for the assertion to accept.
process.env.OPN_PUBLIC_KEY = process.env.OPN_PUBLIC_KEY || 'pkey_test_jest_fixture';
process.env.OPN_SECRET_KEY = process.env.OPN_SECRET_KEY || 'skey_test_jest_fixture';
process.env.OPN_WEBHOOK_SECRET = process.env.OPN_WEBHOOK_SECRET || 'whsec_test_jest_fixture_32_chars_abc';
process.env.OPN_API_VERSION = process.env.OPN_API_VERSION || '2019-05-29';
```

- [ ] **Step 2: Wire into jest.config.js**

Read the current `jest.config.js`:

```bash
cat jest.config.js
```

Edit it to include the setup file. The exact merge depends on the existing shape, but the key addition is:

```js
module.exports = {
  // ... existing config ...
  setupFilesAfterEach: undefined, // remove if conflicting
  setupFilesAfterEach: undefined,
  setupFiles: ['<rootDir>/__tests__/setup-opn-env.ts'],
  // ... existing config ...
};
```

If `setupFiles` already exists, append the new path. If `setupFilesAfterEach` is the existing field, add `setupFiles` separately — they run at different times. (`setupFiles` runs once per worker before test framework; `setupFilesAfterEach` runs after framework setup. Env injection needs `setupFiles`.)

- [ ] **Step 3: Write the config module**

```ts
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
```

- [ ] **Step 4: Run typecheck + tests**

```bash
npm run typecheck
npm run test -- --testPathPattern=sample
```

Expected: typecheck passes; the sample test passes (proves jest setup file loads without crashing).

- [ ] **Step 5: Commit**

```bash
git add lib/opn/config.ts __tests__/setup-opn-env.ts jest.config.js
git commit -m "feat(opn): add config module with env-assertion + mode coherence guard

Mirrors lib/shopeepay/config.ts pattern. Coherence guard uses key
prefix (skey_test_*) instead of base URL since Opn switches modes
that way. Jest setup file injects test-shape env vars so module-load
assertions don't crash the test runner."
```

---

### Task 4 (**MILESTONE 1**): lib/opn/signature.ts + tests (TDD)

**Files:**
- Create: `lib/opn/signature.ts`
- Create: `__tests__/opn-signature.test.ts`

- [ ] **Step 1: Pre-compute a stable expected signature for the regression test**

Write a tiny script (one-liner `node -e` has nested-quote fragility on PowerShell — avoid). Save as `/tmp/opn-precompute.js` (or any temp path):

```js
const crypto = require('crypto');
const SECRET = 'whsec_test_fixture_32_chars_abcdef';
const TS = '1700000000';
const BODY = '{"id":"chrg_test_5fixture","object":"charge","status":"successful"}';
console.log(crypto.createHmac('sha256', SECRET).update(`${TS}.${BODY}`, 'utf8').digest('hex'));
```

Run:

```bash
node /tmp/opn-precompute.js
```

Record the 64-char hex output. Use it as the `EXPECTED_SIG` constant in Step 2's test. This locks the algorithm — if a future refactor breaks the HMAC chain, this test fails.

After capturing the value, delete the script: `rm /tmp/opn-precompute.js` (or `Remove-Item` on Windows).

- [ ] **Step 2: Write the failing tests**

```ts
// __tests__/opn-signature.test.ts
/**
 * Pure HMAC-SHA256 signature tests for Opn webhook verification.
 * Imports lib/opn/signature.ts (no env deps) — runs without stubs.
 *
 * The "regression" tests use a precomputed expected signature so a
 * silent algorithm regression (e.g. switching to base64 or to a
 * different hash) fails loudly. The expected value was computed
 * once with Node's crypto module against the documented Opn scheme:
 *   HMAC-SHA256(`${timestamp}.${rawBody}`, secret), hex-encoded.
 */
import { signPayload, verifyPayload } from '@/lib/opn/signature';

const SECRET = 'whsec_test_fixture_32_chars_abcdef';
const TS = '1700000000';
const BODY = '{"id":"chrg_test_5fixture","object":"charge","status":"successful"}';
// PASTE the hex output from Step 1 below (will be 64 chars).
const EXPECTED_SIG = 'PASTE_FROM_STEP_1_HERE';

describe('Opn signPayload — algorithm regression', () => {
  it('matches the precomputed HMAC-SHA256 hex', () => {
    expect(signPayload(TS, BODY, SECRET)).toBe(EXPECTED_SIG);
  });

  it('is deterministic', () => {
    expect(signPayload(TS, BODY, SECRET)).toBe(signPayload(TS, BODY, SECRET));
  });

  it('differs when secret changes', () => {
    expect(signPayload(TS, BODY, SECRET)).not.toBe(signPayload(TS, BODY, 'other-secret'));
  });

  it('differs when timestamp changes', () => {
    expect(signPayload(TS, BODY, SECRET)).not.toBe(signPayload(TS + '1', BODY, SECRET));
  });

  it('differs when body changes by one char', () => {
    expect(signPayload(TS, BODY, SECRET)).not.toBe(signPayload(TS, BODY + ' ', SECRET));
  });
});

describe('Opn verifyPayload', () => {
  it('roundtrip: sign then verify with same secret returns true', () => {
    const sig = signPayload(TS, BODY, SECRET);
    expect(verifyPayload(BODY, sig, TS, [SECRET])).toBe(true);
  });

  it('rejects when body was tampered', () => {
    const sig = signPayload(TS, BODY, SECRET);
    expect(verifyPayload(BODY + 'x', sig, TS, [SECRET])).toBe(false);
  });

  it('rejects when timestamp was tampered', () => {
    const sig = signPayload(TS, BODY, SECRET);
    expect(verifyPayload(BODY, sig, '1700000001', [SECRET])).toBe(false);
  });

  it('rejects when secret is wrong', () => {
    const sig = signPayload(TS, BODY, 'attacker-key');
    expect(verifyPayload(BODY, sig, TS, [SECRET])).toBe(false);
  });

  it('rejects null / undefined / empty headers', () => {
    expect(verifyPayload(BODY, null, TS, [SECRET])).toBe(false);
    expect(verifyPayload(BODY, undefined, TS, [SECRET])).toBe(false);
    expect(verifyPayload(BODY, '', TS, [SECRET])).toBe(false);
    expect(verifyPayload(BODY, 'somesig', null, [SECRET])).toBe(false);
  });

  it('rejects when no secrets are provided', () => {
    const sig = signPayload(TS, BODY, SECRET);
    expect(verifyPayload(BODY, sig, TS, [])).toBe(false);
  });

  it('rejects malformed (non-hex) signature', () => {
    expect(verifyPayload(BODY, 'not_a_hex_sig!!', TS, [SECRET])).toBe(false);
  });
});

describe('Opn verifyPayload — dual-secret rotation', () => {
  const OLD = 'whsec_old_secret_32_chars_abcdef_ghi';
  const NEW = 'whsec_new_secret_32_chars_abcdef_ghi';

  it('accepts an old-secret signature when both secrets are active', () => {
    const oldSig = signPayload(TS, BODY, OLD);
    expect(verifyPayload(BODY, oldSig, TS, [NEW, OLD])).toBe(true);
  });

  it('accepts a new-secret signature when both secrets are active', () => {
    const newSig = signPayload(TS, BODY, NEW);
    expect(verifyPayload(BODY, newSig, TS, [NEW, OLD])).toBe(true);
  });

  it('accepts a comma-separated header with both signatures', () => {
    const oldSig = signPayload(TS, BODY, OLD);
    const newSig = signPayload(TS, BODY, NEW);
    expect(verifyPayload(BODY, `${oldSig},${newSig}`, TS, [NEW, OLD])).toBe(true);
    expect(verifyPayload(BODY, `${newSig},${oldSig}`, TS, [NEW, OLD])).toBe(true);
  });

  it('rejects old signature after old secret is retired (post-rotation)', () => {
    const oldSig = signPayload(TS, BODY, OLD);
    expect(verifyPayload(BODY, oldSig, TS, [NEW])).toBe(false);
  });

  it('tolerates whitespace around comma-separated signatures', () => {
    const oldSig = signPayload(TS, BODY, OLD);
    const newSig = signPayload(TS, BODY, NEW);
    expect(verifyPayload(BODY, ` ${oldSig} , ${newSig} `, TS, [NEW, OLD])).toBe(true);
  });
});
```

- [ ] **Step 3: Run tests, confirm they fail (module doesn't exist)**

```bash
npm run test -- --testPathPattern=opn-signature
```

Expected: FAIL — `Cannot find module '@/lib/opn/signature'`.

- [ ] **Step 4: Implement the module**

```ts
// lib/opn/signature.ts
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
```

- [ ] **Step 5: Run tests, confirm all pass**

```bash
npm run test -- --testPathPattern=opn-signature
```

Expected: PASS, all ~17 tests green.

- [ ] **Step 6: Typecheck + lint**

```bash
npm run typecheck && npm run lint
```

Expected: both pass.

- [ ] **Step 7: Commit + report MILESTONE 1 to user**

```bash
git add lib/opn/signature.ts __tests__/opn-signature.test.ts
git commit -m "feat(opn): add HMAC-SHA256 signature module with dual-rotation support

Pure module, no env deps. Mirrors lib/shopeepay/signature.ts but
the algorithm is HMAC-SHA256 over \${timestamp}.\${rawBody}
(hex-encoded) instead of base64-over-raw-body. Verifier accepts an
array of secrets so the 24h key-rotation window works without code
changes.

Tests cover: algorithm regression (precomputed hex), determinism,
secret/timestamp/body tampering rejection, dual-secret rotation,
comma-separated header handling, malformed input rejection."
```

Report to user:
> **MILESTONE 1 reached** — `lib/opn/signature.ts` passes 17 unit tests including a precomputed-hex regression guard and the dual-secret rotation case. The signature backbone is sound.

---

### Task 5: lib/opn/types.ts + classifyFailure tests (TDD)

**Files:**
- Create: `lib/opn/types.ts`
- Create: `__tests__/opn-classify-failure.test.ts`

- [ ] **Step 1: Write the failing classifier tests**

```ts
// __tests__/opn-classify-failure.test.ts
/**
 * Tests the Opn failure_code → our FailureReason taxonomy mapping.
 * Keep parity with the ShopeePay UI's four-value vocabulary
 * (declined | cancelled | expired | unknown) so /payment/return
 * uses the same component.
 */
import { classifyFailure, type FailureReason } from '@/lib/opn/types';

describe('classifyFailure — Opn failure_code mapping', () => {
  const cases: Array<[string | null | undefined, FailureReason]> = [
    // Declined family — issuer rejected
    ['insufficient_fund', 'declined'],
    ['insufficient_balance', 'declined'],
    ['stolen_or_lost_card', 'declined'],
    ['payment_rejected', 'declined'],
    ['confirmed_amount_mismatch', 'declined'],
    // Cancelled — user-initiated
    ['payment_cancelled', 'cancelled'],
    // Unknown family — gateway/processing failures (retry-safe)
    ['failed_processing', 'unknown'],
    ['timeout', 'unknown'],
    ['failed_fraud_check', 'unknown'],
    // Unrecognized codes fall through to 'unknown'
    ['some_new_code_opn_added', 'unknown'],
    ['', 'unknown'],
    // Null/undefined → unknown (caller must use 'expired' separately
    // for the "still pending past budget" case; this fn doesn't infer)
    [null, 'unknown'],
    [undefined, 'unknown'],
  ];

  cases.forEach(([input, expected]) => {
    it(`maps ${JSON.stringify(input)} → ${expected}`, () => {
      expect(classifyFailure(input)).toBe(expected);
    });
  });
});
```

- [ ] **Step 2: Run tests, confirm fail**

```bash
npm run test -- --testPathPattern=opn-classify-failure
```

Expected: FAIL — module doesn't exist.

- [ ] **Step 3: Implement types + classifier**

```ts
// lib/opn/types.ts

/**
 * Narrow shapes of the omise-node SDK responses we touch. The SDK
 * types are loose (lots of `any`); these discriminators tighten our
 * server code. Re-exported from one place so the codebase has a
 * single Opn type vocabulary.
 */

export type FailureReason = 'declined' | 'cancelled' | 'expired' | 'unknown';

/**
 * Subset of an Omise Charge object that we read. Source:
 * https://www.omise.co/charges-api (fields confirmed against
 * omise-node 0.12+ responses).
 */
export interface OpnCharge {
  object: 'charge';
  id: string;                 // chrg_*
  amount: number;             // in satang
  currency: string;           // 'thb'
  paid: boolean;
  status: 'pending' | 'successful' | 'failed' | 'reversed' | 'expired';
  authorize_uri: string | null;   // 3DS redirect target
  return_uri: string | null;
  authorized: boolean;
  captured: boolean;
  failure_code: string | null;
  failure_message: string | null;
  card?: {
    brand?: string | null;
    last_digits?: string | null;
    name?: string | null;
  };
  authorization_type?: 'pre_auth' | 'final_auth' | null;
  transaction_fees?: {
    fee_rate?: number;
    vat_rate?: number;
  };
  metadata?: Record<string, unknown>;
}

export interface OpnRefund {
  object: 'refund';
  id: string;                 // rfnd_*
  amount: number;
  currency: string;
  charge: string;             // chrg_*
  voided: boolean;
  reason?: string | null;
  metadata?: Record<string, unknown>;
}

/**
 * Webhook event envelope. Source: Opn webhook docs.
 */
export interface OpnWebhookEvent<T = OpnCharge | OpnRefund> {
  object: 'event';
  id: string;                 // evnt_*
  key:
    | 'charge.create'
    | 'charge.complete'
    | 'charge.capture'
    | 'refund.create'
    | string;                 // tolerate forward-compat keys
  created_at: string;
  data: T;
}

const DECLINED_CODES = new Set([
  'insufficient_fund',
  'insufficient_balance',
  'stolen_or_lost_card',
  'payment_rejected',
  'confirmed_amount_mismatch',
]);

const CANCELLED_CODES = new Set(['payment_cancelled']);

/**
 * Map Opn's `failure_code` enum to our four-value FailureReason
 * taxonomy. Anything we don't recognize → 'unknown'. Note: 'expired'
 * is NOT inferred here — callers detect it from time-budget exhaustion
 * (polling/cleanup cron) and pass it separately.
 */
export function classifyFailure(code: string | null | undefined): FailureReason {
  if (!code) return 'unknown';
  if (DECLINED_CODES.has(code)) return 'declined';
  if (CANCELLED_CODES.has(code)) return 'cancelled';
  return 'unknown';
}

/** True iff the charge is in its terminal success state. */
export function isChargeSuccessful(charge: OpnCharge): boolean {
  return charge.status === 'successful' && charge.paid === true;
}

/** True iff the charge is in any terminal state (success or failure). */
export function isChargeTerminal(charge: OpnCharge): boolean {
  return charge.status === 'successful' || charge.status === 'failed' ||
    charge.status === 'reversed' || charge.status === 'expired';
}
```

- [ ] **Step 4: Run tests, confirm all pass**

```bash
npm run test -- --testPathPattern=opn-classify-failure
```

Expected: 13 tests PASS.

- [ ] **Step 5: Typecheck + lint**

```bash
npm run typecheck && npm run lint
```

Expected: both pass.

- [ ] **Step 6: Commit**

```bash
git add lib/opn/types.ts __tests__/opn-classify-failure.test.ts
git commit -m "feat(opn): add narrowed Omise types + failure-reason classifier

13 tests cover the failure_code → {declined|cancelled|unknown}
mapping. 'expired' is NOT inferred from a failure code — that's a
time-budget concept handled by callers (polling exhaustion, cleanup
cron). Documented in the JSDoc."
```

---

### Task 6: lib/opn/client.ts (Omise SDK wrapper)

**Files:**
- Create: `lib/opn/client.ts`

- [ ] **Step 1: Write the client module**

```ts
// lib/opn/client.ts
import 'server-only';
import Omise from 'omise';
import { opnConfig } from '@/lib/opn/config';
import type { OpnCharge, OpnRefund } from '@/lib/opn/types';

/**
 * Wraps the omise-node SDK. Single shared instance pinned to the
 * API version from env. Thin — adds typed return shapes and the
 * Idempotency-Key header for /charges creation so a double-click
 * can't double-charge.
 *
 * The SDK uses callbacks by default but supports promise returns
 * when no callback is supplied. We always use the promise form.
 */

const client = Omise({
  publicKey: opnConfig.publicKey,
  secretKey: opnConfig.secretKey,
  omiseVersion: opnConfig.apiVersion,
});

export interface CreateChargeInput {
  amountSatang: number;
  currency: 'thb';
  cardToken: string;          // tokn_*
  returnUri: string;
  metadata: Record<string, string>;
  idempotencyKey: string;
}

export async function createCharge(input: CreateChargeInput): Promise<OpnCharge> {
  // omise-node's TS types don't expose `headers` on charges.create
  // params. The SDK accepts a second arg in newer versions, but for
  // version-pinned older versions we set the header via the underlying
  // request options. Verify against the installed version's source
  // (node_modules/omise/lib/Omise.js) — if it doesn't accept headers,
  // fall back to omitting the header and rely on the (rental_code,
  // status='pending') idempotency check in /api/payments/opn/intent.
  const result = await client.charges.create({
    amount: input.amountSatang,
    currency: input.currency,
    card: input.cardToken,
    return_uri: input.returnUri,
    metadata: input.metadata,
  } as any);
  return result as unknown as OpnCharge;
}

export async function retrieveCharge(chargeId: string): Promise<OpnCharge> {
  const result = await client.charges.retrieve(chargeId);
  return result as unknown as OpnCharge;
}

export async function createRefund(
  chargeId: string,
  amountSatang?: number
): Promise<OpnRefund> {
  const params: { amount?: number } = {};
  if (typeof amountSatang === 'number') params.amount = amountSatang;
  const result = await client.charges.createRefund(chargeId, params);
  return result as unknown as OpnRefund;
}

export async function retrieveRefund(
  chargeId: string,
  refundId: string
): Promise<OpnRefund> {
  const result = await client.charges.retrieveRefund(chargeId, refundId);
  return result as unknown as OpnRefund;
}
```

- [ ] **Step 2: Typecheck**

```bash
npm run typecheck
```

Expected: pass. If `omise-node`'s types reject any of our calls, narrow the input shape OR drop down to `(client as any)` with a comment explaining why. The package's TS types historically lag the runtime API.

- [ ] **Step 3: Smoke-load the module from Node**

```bash
node -e "require('./lib/opn/client.ts')" 2>&1 || echo "expected — TS file. Use tsx or ts-node to verify, or rely on next build."
```

Skip this if it errors — Next.js build (Task 21 onward) will catch any module-level issues.

- [ ] **Step 4: Commit**

```bash
git add lib/opn/client.ts
git commit -m "feat(opn): add omise-node SDK wrapper for charge + refund operations

Thin wrapper around omise.charges.{create,retrieve,createRefund,
retrieveRefund}. Returns typed OpnCharge / OpnRefund shapes from
lib/opn/types.ts. Idempotency-Key header pending — depends on the
installed omise-node version exposing it; falls back to the
existing (rental_code, status='pending') row-check in /intent if
the SDK can't pass headers."
```

---

## Phase B — Shared payments extraction

These tasks lift two helpers out of `lib/shopeepay/*` into `lib/payments/*` so both gateways share one tested code path. **Pure refactor — no behavior change for ShopeePay.**

### Task 7: Lift `order-summary.ts` into `lib/payments/`

**Files:**
- Create: `lib/payments/order-summary.ts`
- Modify: `lib/shopeepay/order-summary.ts` (becomes re-export shim)

- [ ] **Step 1: Read the existing module**

```bash
cat lib/shopeepay/order-summary.ts
```

- [ ] **Step 2: Move the implementation verbatim**

Create `lib/payments/order-summary.ts` with the EXACT contents of `lib/shopeepay/order-summary.ts`. Update no logic; just relocate.

- [ ] **Step 3: Replace the ShopeePay file with a re-export shim**

```ts
// lib/shopeepay/order-summary.ts
// Lifted to lib/payments/order-summary.ts during the Opn Payments
// migration (2026-05-20). This re-export keeps existing ShopeePay
// imports working unchanged. Safe to delete the shim after ShopeePay
// decommission (60 days post-Opn cutover).
export * from '@/lib/payments/order-summary';
```

- [ ] **Step 4: Run typecheck + lint + tests**

```bash
npm run typecheck && npm run lint && npm run test
```

Expected: all pass — no behavior change.

- [ ] **Step 5: Verify build**

```bash
npm run build
```

Expected: pass. Build is the canonical check for Server Component / webpack issues.

- [ ] **Step 6: Commit**

```bash
git add lib/payments/order-summary.ts lib/shopeepay/order-summary.ts
git commit -m "refactor(payments): lift order-summary into shared lib/payments namespace

Pure relocation — no behavior change. The function is gateway-agnostic
(takes a rental_code, returns receipt data). lib/shopeepay/order-summary
becomes a re-export shim so existing imports keep working unchanged.
Shim is safe to delete after ShopeePay decommission."
```

---

### Task 8: Lift `markRentalAsPaid.ts` with `gatewayMetadata` refactor

**Files:**
- Create: `lib/payments/markRentalAsPaid.ts`
- Modify: `lib/shopeepay/markRentalAsPaid.ts` (re-export shim)

- [ ] **Step 1: Read the existing module**

```bash
cat lib/shopeepay/markRentalAsPaid.ts
```

Note the current signature: `claimAndSendConfirmationEmail(supabase, txnId, rentalId, options: { transactionSn?: string | null })`. The `transactionSn` option is ShopeePay-specific (it's the `transaction_sn` from their notify payload) but it's passed through to the email payload as a generic "transaction reference".

- [ ] **Step 2: Refactor to gateway-agnostic options shape**

Create `lib/payments/markRentalAsPaid.ts` with this contents:

```ts
// lib/payments/markRentalAsPaid.ts
import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { sendCourseRentalConfirmationEmail, resolveEmailLocale } from '@/lib/emailService';

/**
 * Gateway-agnostic helper that:
 *  1. Atomically claims the customer-confirmation email send via a
 *     conditional UPDATE on payment_transactions.confirmation_email_sent_at.
 *  2. On successful claim, loads the rental + club set + customer
 *     language, then sends the confirmation email.
 *
 * Race-safe across detection paths (webhook handler + polling endpoint).
 * The first caller wins the claim and dispatches; the second sees
 * confirmation_email_sent_at != null and returns { sent: false, reason:
 * 'already_claimed' }.
 *
 * gatewayMetadata is the only gateway-specific surface — callers pass
 * whatever identifier the email should display as the "transaction
 * reference" for support lookup. ShopeePay passes transaction_sn
 * ('1600...'); Opn passes the chrg_* id (plus optionally auth_code).
 */
export interface GatewayMetadata {
  /** Display string for the email's "Transaction reference" line. */
  transactionRef?: string | null;
}

export async function claimAndSendConfirmationEmail(
  supabase: SupabaseClient,
  txnId: string,
  rentalId: string,
  gatewayMetadata: GatewayMetadata = {}
): Promise<{ sent: boolean; reason?: string }> {
  // 1. Atomically claim the email send.
  const { data: claimed, error: claimError } = await supabase
    .from('payment_transactions')
    .update({ confirmation_email_sent_at: new Date().toISOString() })
    .eq('id', txnId)
    .is('confirmation_email_sent_at', null)
    .select('id')
    .maybeSingle();

  if (claimError) {
    console.error('[markRentalAsPaid] email claim failed:', claimError);
    return { sent: false, reason: 'claim_error' };
  }

  if (!claimed) {
    return { sent: false, reason: 'already_claimed' };
  }

  // 2. Load the rental + customer-language + club set.
  const { data: rental, error: rentalError } = await supabase
    .from('club_rentals')
    .select('*')
    .eq('id', rentalId)
    .single();

  if (rentalError || !rental) {
    console.error('[markRentalAsPaid] rental load failed:', rentalError);
    // Roll back the claim so the next attempt can re-try.
    await supabase
      .from('payment_transactions')
      .update({ confirmation_email_sent_at: null })
      .eq('id', txnId);
    return { sent: false, reason: 'rental_not_found' };
  }

  if (!rental.customer_email) {
    return { sent: false, reason: 'no_customer_email' };
  }

  let language: string | null = null;
  if (rental.customer_id) {
    const { data: customerLang } = await supabase
      .from('customers')
      .select('preferred_language')
      .eq('id', rental.customer_id)
      .single();
    language = customerLang?.preferred_language ?? null;
  }
  const emailLocale = resolveEmailLocale(language);

  const { data: clubSet } = await supabase
    .from('rental_club_sets')
    .select('name, tier, gender')
    .eq('id', rental.rental_club_set_id)
    .single();

  if (!clubSet) {
    return { sent: false, reason: 'club_set_not_found' };
  }

  const addOns = Array.isArray(rental.add_ons)
    ? (rental.add_ons as Array<{ label: string; price: number }>).map(a => ({
        label: a.label,
        price: a.price,
      }))
    : [];

  const deliveryTimeStr = [
    rental.delivery_time
      ? `${rental.delivery_requested ? 'Delivery' : 'Pickup'}: ${rental.delivery_time}`
      : '',
    rental.return_time ? `Return: ${rental.return_time}` : '',
  ]
    .filter(Boolean)
    .join(', ');

  try {
    await sendCourseRentalConfirmationEmail({
      customerName: rental.customer_name,
      email: rental.customer_email,
      rentalCode: rental.rental_code,
      clubSetName: clubSet.name,
      clubSetTier: clubSet.tier,
      clubSetGender: clubSet.gender,
      startDate: rental.start_date,
      endDate: rental.end_date,
      durationDays: rental.duration_days || 1,
      deliveryRequested: !!rental.delivery_requested,
      deliveryAddress: rental.delivery_address ?? undefined,
      deliveryTime: deliveryTimeStr || undefined,
      addOns,
      rentalPrice: Number(rental.rental_price),
      deliveryFee: Number(rental.delivery_fee || 0),
      totalPrice: Number(rental.total_price),
      notes: rental.notes ?? undefined,
      language: emailLocale,
      paymentStatus: 'paid',
      transactionSn: gatewayMetadata.transactionRef ?? undefined,
    });
    return { sent: true };
  } catch (err) {
    console.error('[markRentalAsPaid] email send error:', err);
    return { sent: false, reason: 'email_send_error' };
  }
}
```

Note: the param to `sendCourseRentalConfirmationEmail` is still named `transactionSn` for now (matches the email helper's signature). A future cleanup can rename that param too, but it's out of scope here — bigger blast radius.

- [ ] **Step 3: Update ShopeePay callers to pass the new shape**

The ShopeePay files that called `claimAndSendConfirmationEmail(..., { transactionSn })` need to become `claimAndSendConfirmationEmail(..., { transactionRef: transactionSn })`. Grep:

```bash
grep -n "claimAndSendConfirmationEmail" app/ lib/
```

Edit each call site to use `{ transactionRef: transactionSn ?? null }`.

- [ ] **Step 4: Replace ShopeePay file with re-export shim**

```ts
// lib/shopeepay/markRentalAsPaid.ts
// Lifted to lib/payments/markRentalAsPaid.ts during the Opn Payments
// migration (2026-05-20). The signature changed: pass
// gatewayMetadata = { transactionRef } instead of { transactionSn }.
// All call sites updated in the same PR.
export * from '@/lib/payments/markRentalAsPaid';
```

- [ ] **Step 5: Run typecheck + lint + tests + build**

```bash
npm run typecheck && npm run lint && npm run test && npm run build
```

Expected: all pass. The build catches any missed call-site rename.

- [ ] **Step 6: Commit**

```bash
git add lib/payments/markRentalAsPaid.ts lib/shopeepay/markRentalAsPaid.ts \
        app/api/payments/shopeepay/ app/api/webhooks/shopeepay/
git commit -m "refactor(payments): lift markRentalAsPaid into shared lib/payments namespace

Generalizes the email-claim dedup helper. Options shape changed:
{ transactionSn } -> { transactionRef } so Opn can pass chrg_* and
ShopeePay can pass transaction_sn through the same param. All
ShopeePay call sites updated in this commit. Re-export shim keeps
import paths stable."
```

---

### Task 9: Lift `markRefundAsRefunded.ts` into `lib/payments/`

**Files:**
- Create: `lib/payments/markRefundAsRefunded.ts`
- Modify: `lib/shopeepay/markRefundAsRefunded.ts` (re-export shim)

- [ ] **Step 1: Read the existing module**

```bash
cat lib/shopeepay/markRefundAsRefunded.ts
```

- [ ] **Step 2: Inspect for ShopeePay-specific shape**

If the function takes a ShopeePay-specific payload, refactor parameters to gateway-agnostic shape (mirror Task 8's `gatewayMetadata` pattern). If it's already gateway-agnostic, do a straight relocation.

**Exports the plan depends on:** `lib/opn/handleRefundNotify.ts` (Task 10) imports `claimAndSendRefundEmail` from this module. Confirm that's the function name in the ShopeePay original; if it's named differently (e.g. `claimAndSendRefundConfirmation`), either:
- Add an alias re-export in `lib/payments/markRefundAsRefunded.ts`: `export { foo as claimAndSendRefundEmail }`
- OR update Task 10's import to use the original name. Pick the cheaper one and stay consistent across the codebase.

- [ ] **Step 3: Create the lifted module + shim**

Same pattern as Task 7. Create `lib/payments/markRefundAsRefunded.ts` (with the export named `claimAndSendRefundEmail` either directly or via alias). Replace `lib/shopeepay/markRefundAsRefunded.ts` with `export * from '@/lib/payments/markRefundAsRefunded';`.

If refactor is needed: update all ShopeePay call sites in this same commit.

- [ ] **Step 4: Run gates**

```bash
npm run typecheck && npm run lint && npm run test && npm run build
```

- [ ] **Step 5: Commit**

```bash
git add lib/payments/markRefundAsRefunded.ts lib/shopeepay/markRefundAsRefunded.ts
git commit -m "refactor(payments): lift markRefundAsRefunded into shared lib/payments namespace

Same pattern as the markRentalAsPaid lift. Gateway-agnostic now;
Opn will use this from lib/opn/handleRefundNotify."
```

---

## Phase C — API surface

### Task 10: lib/opn/handleRefundNotify.ts

**Files:**
- Create: `lib/opn/handleRefundNotify.ts`

- [ ] **Step 1: Read the ShopeePay analog as the structural reference**

```bash
cat lib/shopeepay/handleRefundNotify.ts
```

Note its public signature, side effects, and return shape. The Opn handler mirrors this shape but reads from `OpnRefund` (Opn webhook `data` block) instead of ShopeePay's `NotifyTransactionPayload`.

- [ ] **Step 2: Implement**

```ts
// lib/opn/handleRefundNotify.ts
import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import type { OpnRefund } from '@/lib/opn/types';
import { claimAndSendRefundEmail } from '@/lib/payments/markRefundAsRefunded';

/**
 * Handle a refund.create webhook event from Opn. Mirrors the
 * ShopeePay handleRefundNotify shape:
 *
 *   1. Find the original payment_transactions row by gateway_charge_id.
 *   2. Insert / update a refund row capturing rfnd_*, amount, status.
 *   3. If the refund equals the full charge amount, flip the rental's
 *      payment_status to 'refunded'. Otherwise leave as 'paid' (partial).
 *   4. Fire the refund email via the shared markRefundAsRefunded helper.
 *
 * Always returns 200 on rows we recognize (idempotent replays included);
 * 500 only for true server-side failures.
 */
export async function handleRefundNotify(
  supabase: SupabaseClient,
  refund: OpnRefund,
  context: { baseUrl: string }
): Promise<Response> {
  const chargeId = refund.charge;
  const refundId = refund.id;

  const { data: txn, error: txnErr } = await supabase
    .from('payment_transactions')
    .select('id, club_rental_id, amount')
    .eq('gateway_charge_id', chargeId)
    .maybeSingle();

  if (txnErr) {
    console.error('[opn/handleRefundNotify] txn lookup failed:', txnErr);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
  if (!txn || !txn.club_rental_id) {
    console.warn(`[opn/handleRefundNotify] no txn for charge ${chargeId} — ack`);
    return NextResponse.json({ object: 'ok' });
  }

  // Persist refund row. Follow whatever shape lib/shopeepay/handleRefundNotify
  // already established (review Task 9's output to mirror columns).
  // Example (adjust if the shopeepay impl uses a separate refunds table):
  await supabase.from('payment_transaction_refunds').upsert(
    {
      payment_transaction_id: txn.id,
      gateway_refund_id: refundId,
      amount: refund.amount,
      voided: refund.voided,
      reason: refund.reason || null,
    },
    { onConflict: 'gateway_refund_id' }
  );

  const isFullRefund = refund.amount >= txn.amount;

  if (isFullRefund) {
    await supabase
      .from('club_rentals')
      .update({ payment_status: 'refunded' })
      .eq('id', txn.club_rental_id);
  }

  void claimAndSendRefundEmail(supabase, txn.id, txn.club_rental_id, {
    transactionRef: refundId,
  }).catch(err => console.error('[opn/handleRefundNotify] email error:', err));

  return NextResponse.json({ object: 'ok' });
}
```

**Note**: the exact refund-row table name (`payment_transaction_refunds` above is a guess) MUST match whatever the ShopeePay impl uses. Re-read `lib/shopeepay/handleRefundNotify.ts` first and copy the table/column shape verbatim.

- [ ] **Step 3: Typecheck**

```bash
npm run typecheck
```

Expected: pass.

- [ ] **Step 4: Commit**

```bash
git add lib/opn/handleRefundNotify.ts
git commit -m "feat(opn): add handleRefundNotify mirroring ShopeePay pattern

Reads refund.create webhook payload, upserts refund row, flips
rental to 'refunded' on full refund, fires refund email via the
shared lib/payments/markRefundAsRefunded helper."
```

---

### Task 11: app/api/webhooks/opn/route.ts

**Files:**
- Create: `app/api/webhooks/opn/route.ts`

- [ ] **Step 1: Implement the webhook route**

```ts
// app/api/webhooks/opn/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/utils/supabase/admin';
import { verifyPayload } from '@/lib/opn/signature';
import { webhookSecrets } from '@/lib/opn/config';
import { claimAndSendConfirmationEmail } from '@/lib/payments/markRentalAsPaid';
import { handleRefundNotify } from '@/lib/opn/handleRefundNotify';
import {
  classifyFailure,
  isChargeSuccessful,
  type OpnCharge,
  type OpnRefund,
  type OpnWebhookEvent,
} from '@/lib/opn/types';

const ACK_OK = { object: 'ok' as const };

function getBaseUrl(): string {
  if (process.env.VERCEL_ENV && process.env.VERCEL_ENV !== 'development' && process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL}`;
  }
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.NEXTAUTH_URL || '';
  if (baseUrl && !baseUrl.startsWith('http')) return `http://${baseUrl}`;
  if (!baseUrl && process.env.NODE_ENV !== 'production') return 'http://localhost:3000';
  return baseUrl;
}

export async function POST(request: NextRequest) {
  // Read raw body BEFORE JSON.parse — signature is computed over the
  // exact bytes Opn sent; JSON.stringify(JSON.parse(x)) is not always
  // identical to x.
  const rawBody = await request.text();
  const headerSig = request.headers.get('omise-signature');
  const headerTs = request.headers.get('omise-signature-timestamp');

  if (!verifyPayload(rawBody, headerSig, headerTs, webhookSecrets())) {
    console.warn('[opn/webhook] signature verification failed');
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Anti-replay: reject if more than 5 min skew. Opn delivers within
  // seconds normally; a stale timestamp is either a replay or a clock
  // problem we want to surface.
  const tsMs = Number(headerTs) * 1000;
  if (!Number.isFinite(tsMs) || Math.abs(Date.now() - tsMs) > 5 * 60_000) {
    console.warn('[opn/webhook] stale or invalid timestamp:', headerTs);
    return NextResponse.json({ error: 'Stale timestamp' }, { status: 401 });
  }

  let event: OpnWebhookEvent;
  try {
    event = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const supabase = createAdminClient();

  switch (event.key) {
    case 'charge.complete':
      return handleChargeComplete(supabase, event.data as OpnCharge);
    case 'charge.create':
      // We don't act until terminal; just ack so Opn doesn't retry.
      return NextResponse.json(ACK_OK);
    case 'refund.create':
      return handleRefundNotify(supabase, event.data as OpnRefund, { baseUrl: getBaseUrl() });
    default:
      console.log('[opn/webhook] unhandled event key:', event.key);
      return NextResponse.json(ACK_OK);
  }
}

async function handleChargeComplete(supabase: ReturnType<typeof createAdminClient>, charge: OpnCharge): Promise<Response> {
  // 1. Lookup payment_transactions by gateway_charge_id.
  const { data: txn, error: txnErr } = await supabase
    .from('payment_transactions')
    .select('id, club_rental_id, amount, status')
    .eq('gateway_charge_id', charge.id)
    .maybeSingle();

  if (txnErr) {
    console.error('[opn/webhook] txn lookup failed:', txnErr);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
  if (!txn) {
    console.warn(`[opn/webhook] no txn for charge ${charge.id} — ack and ignore`);
    return NextResponse.json(ACK_OK);
  }

  // 2. Amount tampering check.
  if (charge.amount !== txn.amount) {
    console.error(
      `[opn/webhook] amount mismatch for ${charge.id}: expected ${txn.amount}, got ${charge.amount}`
    );
    return NextResponse.json({ error: 'Amount mismatch' }, { status: 400 });
  }

  // 3. Idempotency: if already terminal, ack and skip side effects.
  if (txn.status === 'success' || txn.status === 'failed') {
    return NextResponse.json(ACK_OK);
  }

  // 4. Update the row with everything Opn told us.
  const isSuccess = isChargeSuccessful(charge);
  const updates: Record<string, unknown> = {
    status: isSuccess ? 'success' : 'failed',
    raw_webhook_payload: charge as unknown as Record<string, unknown>,
    auth_code: charge.authorized ? (charge as any).authorization_code ?? null : null,
    failure_code: charge.failure_code,
    failure_message: charge.failure_message,
    card_brand: charge.card?.brand ?? null,
    card_last4: charge.card?.last_digits ?? null,
    is_3ds: charge.authorize_uri !== null,
    transaction_fee_rate: charge.transaction_fees?.fee_rate ?? null,
    transaction_vat_rate: charge.transaction_fees?.vat_rate ?? null,
  };
  if (isSuccess) updates.paid_at = new Date().toISOString();

  const { error: updateErr } = await supabase
    .from('payment_transactions')
    .update(updates)
    .eq('id', txn.id);

  if (updateErr) {
    console.error('[opn/webhook] txn update failed:', updateErr);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }

  if (!isSuccess) {
    if (txn.club_rental_id) {
      await supabase
        .from('club_rentals')
        .update({ payment_status: 'failed' })
        .eq('id', txn.club_rental_id);
    }
    return NextResponse.json(ACK_OK);
  }

  // 5. Success path: flip rental + fire email + LINE notification.
  if (!txn.club_rental_id) {
    console.warn(`[opn/webhook] success but no club_rental_id for ${charge.id}`);
    return NextResponse.json(ACK_OK);
  }

  const { data: rental, error: rentalErr } = await supabase
    .from('club_rentals')
    .update({ payment_status: 'paid', expires_at: null })
    .eq('id', txn.club_rental_id)
    .select('*')
    .single();

  if (rentalErr || !rental) {
    console.error('[opn/webhook] rental update failed:', rentalErr);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }

  void claimAndSendConfirmationEmail(supabase, txn.id, txn.club_rental_id, {
    transactionRef: charge.id,
  });

  // Staff LINE notification — fire-and-forget.
  const baseUrl = getBaseUrl();
  if (baseUrl) {
    const lineMessage = [
      `Payment Received (${rental.rental_code})`,
      `Customer: ${rental.customer_name}`,
      `Amount: ฿${(Number(rental.total_price) || 0).toLocaleString()}`,
      `Charge: ${charge.id}`,
      rental.delivery_requested ? `Delivery to: ${rental.delivery_address ?? ''}` : 'Pickup at LENGOLF',
    ].join('\n');

    fetch(`${baseUrl}/api/notifications/line`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: lineMessage }),
    }).catch(err => console.error('[opn/webhook] LINE notification error:', err));
  }

  return NextResponse.json(ACK_OK);
}
```

- [ ] **Step 2: Run typecheck + lint + build**

```bash
npm run typecheck && npm run lint && npm run build
```

Expected: all pass. Build catches Server Component / webpack issues per CLAUDE.md.

- [ ] **Step 3: Commit**

```bash
git add app/api/webhooks/opn/route.ts
git commit -m "feat(opn): add webhook route handling charge.complete / .create / refund.create

Signature verify on raw body before JSON.parse. 5-min anti-replay
window on timestamp. Idempotency via terminal-status check on
payment_transactions. Side-effect order: DB write -> email claim ->
LINE notification (best-effort). 200 ACK on recognized rows incl.
replays; 401 only on bad signature so Opn retries on real failures."
```

---

### Task 12: app/api/payments/opn/intent/route.ts

**Files:**
- Create: `app/api/payments/opn/intent/route.ts`

- [ ] **Step 1: Implement**

```ts
// app/api/payments/opn/intent/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/utils/supabase/admin';
import { createCharge } from '@/lib/opn/client';
import { classifyFailure, isChargeSuccessful } from '@/lib/opn/types';
import { createHash } from 'crypto';

interface IntentBody {
  rental_code?: string;
  token?: string;        // tokn_*
}

function getBaseUrl(): string {
  if (process.env.VERCEL_ENV && process.env.VERCEL_ENV !== 'development' && process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL}`;
  }
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.NEXTAUTH_URL || '';
  if (baseUrl && !baseUrl.startsWith('http')) return `http://${baseUrl}`;
  if (!baseUrl && process.env.NODE_ENV !== 'production') return 'http://localhost:3000';
  return baseUrl;
}

export async function POST(request: NextRequest) {
  let body: IntentBody;
  try {
    body = (await request.json()) as IntentBody;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { rental_code, token } = body;
  if (!rental_code || typeof rental_code !== 'string' || rental_code.length > 32) {
    return NextResponse.json({ error: 'rental_code is required' }, { status: 400 });
  }
  if (!token || typeof token !== 'string' || !token.startsWith('tokn_')) {
    return NextResponse.json({ error: 'Invalid token' }, { status: 400 });
  }

  const supabase = createAdminClient();

  // 1. Validate rental.
  const { data: rental, error: rentalErr } = await supabase
    .from('club_rentals')
    .select('id, rental_code, rental_type, total_price, payment_status, customer_name, expires_at')
    .eq('rental_code', rental_code)
    .single();

  if (rentalErr || !rental) {
    return NextResponse.json({ error: 'Rental not found' }, { status: 404 });
  }
  if (rental.rental_type !== 'course') {
    return NextResponse.json({ error: 'Online payment is not available for this rental type' }, { status: 400 });
  }
  if (rental.payment_status === 'paid') {
    return NextResponse.json({ error: 'This rental has already been paid' }, { status: 409 });
  }
  if (rental.expires_at && new Date(rental.expires_at) < new Date()) {
    return NextResponse.json({ error: 'This reservation has expired' }, { status: 410 });
  }

  // 2. Insert pending payment_transactions row BEFORE calling Opn.
  // Paper trail even if the gateway call times out.
  const amountSatang = Math.round(Number(rental.total_price) * 100);
  if (!Number.isFinite(amountSatang) || amountSatang <= 0) {
    return NextResponse.json({ error: 'Rental has an invalid price' }, { status: 500 });
  }

  const baseUrl = getBaseUrl();
  if (!baseUrl) {
    return NextResponse.json({ error: 'Server misconfiguration' }, { status: 500 });
  }
  const returnUri = `${baseUrl}/payment/return?ref=${rental.rental_code}`;

  const { data: txnRow, error: txnInsertErr } = await supabase
    .from('payment_transactions')
    .insert({
      club_rental_id: rental.id,
      gateway: 'opn',
      gateway_token_id: token,
      amount: amountSatang,
      currency: 'THB',
      status: 'pending',
      return_url: returnUri,
    })
    .select('id')
    .single();

  if (txnInsertErr || !txnRow) {
    console.error('[opn/intent] txn insert failed:', txnInsertErr);
    return NextResponse.json({ error: 'Failed to record payment intent' }, { status: 500 });
  }

  // 3. Create the Omise charge.
  const idempotencyKey = createHash('sha256')
    .update(`${rental_code}:${token}`)
    .digest('hex');

  let charge;
  try {
    charge = await createCharge({
      amountSatang,
      currency: 'thb',
      cardToken: token,
      returnUri,
      metadata: { rental_code, txn_id: txnRow.id },
      idempotencyKey,
    });
  } catch (e) {
    const msg = (e as Error).message?.slice(0, 500) ?? 'unknown';
    console.error('[opn/intent] charge create failed:', e);
    await supabase
      .from('payment_transactions')
      .update({ status: 'failed', error_message: msg })
      .eq('id', txnRow.id);
    return NextResponse.json(
      { status: 'failed', failure_reason: 'unknown', error: 'Payment gateway is not reachable. Please try again.' },
      { status: 502 }
    );
  }

  // 4. Update row with chrg_* + relevant fields.
  await supabase
    .from('payment_transactions')
    .update({
      gateway_charge_id: charge.id,
      is_3ds: charge.authorize_uri !== null,
      raw_create_response: charge as unknown as Record<string, unknown>,
    })
    .eq('id', txnRow.id);

  // Link rental to this txn + set expiry (30 min).
  await supabase
    .from('club_rentals')
    .update({
      payment_status: 'pending',
      payment_transaction_id: txnRow.id,
      expires_at: new Date(Date.now() + 30 * 60_000).toISOString(),
    })
    .eq('id', rental.id);

  // 5. Branch on terminal state.
  if (charge.authorize_uri) {
    return NextResponse.json({
      status: 'requires_3ds',
      authorize_uri: charge.authorize_uri,
    });
  }
  if (isChargeSuccessful(charge)) {
    return NextResponse.json({ status: 'success', ref: rental.rental_code });
  }
  if (charge.status === 'failed') {
    return NextResponse.json({
      status: 'failed',
      failure_reason: classifyFailure(charge.failure_code),
    });
  }

  // Charge is in some pending non-3DS state — rare; fall back to
  // polling page so the user sees "confirming" instead of an error.
  return NextResponse.json({ status: 'success', ref: rental.rental_code });
}
```

- [ ] **Step 2: Run gates**

```bash
npm run typecheck && npm run lint && npm run build
```

Expected: pass.

- [ ] **Step 3: Commit**

```bash
git add app/api/payments/opn/intent/route.ts
git commit -m "feat(opn): add /api/payments/opn/intent — tokenize -> charge -> 3DS-or-result

POST { rental_code, token: tokn_* }. Validates rental (404/409/410
for not-found/paid/expired). Inserts pending txn row BEFORE Omise
call so we always have a paper trail. Returns one of:
  - { status: 'requires_3ds', authorize_uri } -> client redirects
  - { status: 'success', ref } -> client navigates to /payment/return
  - { status: 'failed', failure_reason } -> client renders decline UI"
```

---

### Task 13: app/api/payments/opn/return/route.ts

**Files:**
- Create: `app/api/payments/opn/return/route.ts`

- [ ] **Step 1: Implement (polling endpoint + order summary fold)**

```ts
// app/api/payments/opn/return/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/utils/supabase/admin';
import { retrieveCharge } from '@/lib/opn/client';
import { classifyFailure, isChargeSuccessful, isChargeTerminal } from '@/lib/opn/types';
import { loadRentalOrderSummary } from '@/lib/payments/order-summary';
import { claimAndSendConfirmationEmail } from '@/lib/payments/markRentalAsPaid';

type PublicStatus = 'pending' | 'redirected' | 'success' | 'failed' | 'refunded';

export async function GET(request: NextRequest) {
  const ref = request.nextUrl.searchParams.get('ref');
  if (!ref || ref.length > 32 || !/^[A-Za-z0-9-]+$/.test(ref)) {
    return NextResponse.json({ error: 'Invalid ref' }, { status: 400 });
  }

  const supabase = createAdminClient();

  const { data: rental, error: rentalErr } = await supabase
    .from('club_rentals')
    .select('id, rental_code, total_price, payment_status, rental_type')
    .eq('rental_code', ref)
    .single();

  if (rentalErr || !rental) {
    return NextResponse.json({ error: 'Rental not found' }, { status: 404 });
  }
  if (rental.rental_type !== 'course') {
    return NextResponse.json({ error: 'Not applicable' }, { status: 400 });
  }

  const { data: txn } = await supabase
    .from('payment_transactions')
    .select('id, status, gateway_charge_id, amount, paid_at, failure_code, card_brand, card_last4, auth_code')
    .eq('club_rental_id', rental.id)
    .eq('gateway', 'opn')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  const summary = await loadRentalOrderSummary(supabase, ref);

  if (!txn) {
    return NextResponse.json({
      ref,
      status: 'unpaid' as const,
      total_price: Number(rental.total_price),
      failure_reason: null,
      summary,
    });
  }

  let status = txn.status as PublicStatus;
  let paidAt = txn.paid_at;
  let failureReason = status === 'failed' ? classifyFailure(txn.failure_code) : null;
  let gatewayChargeId = txn.gateway_charge_id;
  let cardBrand = txn.card_brand;
  let cardLast4 = txn.card_last4;
  let authCode = txn.auth_code;

  // If still pending and we have a chrg_*, probe Opn directly.
  if ((status === 'pending' || status === 'redirected') && txn.gateway_charge_id) {
    try {
      const charge = await retrieveCharge(txn.gateway_charge_id);

      if (isChargeSuccessful(charge)) {
        const updates: Record<string, unknown> = {
          status: 'success',
          paid_at: new Date().toISOString(),
          card_brand: charge.card?.brand ?? null,
          card_last4: charge.card?.last_digits ?? null,
          auth_code: (charge as any).authorization_code ?? null,
          is_3ds: charge.authorize_uri !== null,
          transaction_fee_rate: charge.transaction_fees?.fee_rate ?? null,
          transaction_vat_rate: charge.transaction_fees?.vat_rate ?? null,
        };
        await supabase.from('payment_transactions').update(updates).eq('id', txn.id);
        await supabase
          .from('club_rentals')
          .update({ payment_status: 'paid', expires_at: null })
          .eq('id', rental.id);

        status = 'success';
        paidAt = updates.paid_at as string;
        failureReason = null;
        cardBrand = (updates.card_brand as string) || cardBrand;
        cardLast4 = (updates.card_last4 as string) || cardLast4;
        authCode = (updates.auth_code as string) || authCode;

        void claimAndSendConfirmationEmail(supabase, txn.id, rental.id, {
          transactionRef: charge.id,
        });
      } else if (isChargeTerminal(charge) && charge.status === 'failed') {
        await supabase
          .from('payment_transactions')
          .update({
            status: 'failed',
            failure_code: charge.failure_code,
            failure_message: charge.failure_message,
          })
          .eq('id', txn.id);
        await supabase
          .from('club_rentals')
          .update({ payment_status: 'failed' })
          .eq('id', rental.id);

        status = 'failed';
        failureReason = classifyFailure(charge.failure_code);
      }
      // else: still processing — leave as pending; client polls again.
    } catch (e) {
      console.warn('[opn/return] charge probe failed:', e);
      // Don't fail the response — client will poll again.
    }
  }

  return NextResponse.json({
    ref,
    status,
    total_price: Number(rental.total_price),
    gateway_charge_id: gatewayChargeId,
    paid_at: paidAt || null,
    failure_reason: failureReason,
    card_brand: cardBrand,
    card_last4: cardLast4,
    auth_code: authCode,
    summary,
  });
}
```

- [ ] **Step 2: Run gates**

```bash
npm run typecheck && npm run lint && npm run build
```

- [ ] **Step 3: Commit**

```bash
git add app/api/payments/opn/return/route.ts
git commit -m "feat(opn): add /api/payments/opn/return polling endpoint

GET ?ref=CRYYMMDDXXX. Returns current status with a /charges/:id
probe fallback when local row is still pending. On poll-detected
success, flips rental + fires email (race-safe via the existing
confirmation_email_sent_at claim). Returns order summary so the
result page renders the full receipt in one roundtrip."
```

---

## Phase D — UI

### Task 14: components/payment/PoweredByOpn.tsx

**Files:**
- Create: `components/payment/PoweredByOpn.tsx`

- [ ] **Step 1: Implement**

```tsx
// components/payment/PoweredByOpn.tsx
'use client';

import { useTranslations } from 'next-intl';

/**
 * Trust-signal mark shown below the checkout form. Mirrors
 * ShopeepayWordmark's role. No remote logo — uses text + an SSL
 * lock glyph so we never break on Opn's brand-asset CDN.
 */
export function PoweredByOpn() {
  const t = useTranslations('payment.checkout');
  return (
    <div className="flex items-center justify-center gap-2 text-xs text-gray-500 py-1">
      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
      </svg>
      <span>{t('poweredByLabel')}</span>
      <span className="font-semibold text-gray-700">Opn Payments</span>
    </div>
  );
}
```

- [ ] **Step 2: Commit (with i18n key — will land in Task 18)**

```bash
git add components/payment/PoweredByOpn.tsx
git commit -m "feat(opn): add PoweredByOpn trust-signal component

Text + lock-glyph mark to display below the card form. No remote
logo fetch. i18n key payment.checkout.poweredByLabel lands in Task 18."
```

---

### Task 15: PayElement client component

**Files:**
- Create: `app/[locale]/payment/checkout/PayElement.tsx`

- [ ] **Step 1: Implement**

```tsx
// app/[locale]/payment/checkout/PayElement.tsx
'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/navigation';

/**
 * Client island for Opn card-form tokenization.
 *
 * State machine:
 *   idle -> submitting -> (success | 3ds-redirect | declined | tokenize-error)
 *
 * On mount: inject https://cdn.omise.co/omise.js once, wait for
 * window.Omise, set ready=true. Submit triggers Omise.createToken
 * which posts the card directly to Opn's servers (PCI SAQ-A — card
 * never touches our backend), then POSTs the resulting tokn_* to
 * /api/payments/opn/intent.
 */

declare global {
  interface Window {
    Omise?: any;
  }
}

const OMISE_JS_URL = 'https://cdn.omise.co/omise.js';

interface PayElementProps {
  rentalCode: string;
  amount: number;       // THB (display only — server reads from rental)
  publicKey: string;    // pkey_*
  locale: string;
}

type ViewState =
  | { kind: 'idle' }
  | { kind: 'submitting' }
  | { kind: 'tokenize-error'; code: string };

export function PayElement({ rentalCode, amount, publicKey, locale }: PayElementProps) {
  const t = useTranslations('payment.checkout');
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [name, setName] = useState('');
  const [number, setNumber] = useState('');
  const [exp, setExp] = useState('');  // MM/YY
  const [cvv, setCvv] = useState('');
  const [state, setState] = useState<ViewState>({ kind: 'idle' });

  // Load Omise.js once. Idempotent — if another <PayElement> already
  // injected it, just wait for window.Omise.
  useEffect(() => {
    if (window.Omise) {
      setReady(true);
      return;
    }
    let script = document.querySelector<HTMLScriptElement>(`script[src="${OMISE_JS_URL}"]`);
    if (!script) {
      script = document.createElement('script');
      script.src = OMISE_JS_URL;
      script.async = true;
      document.head.appendChild(script);
    }
    const onLoad = () => setReady(!!window.Omise);
    script.addEventListener('load', onLoad);
    return () => script?.removeEventListener('load', onLoad);
  }, []);

  const parsedExp = useMemo(() => {
    const match = exp.match(/^(\d{2})\s*\/\s*(\d{2})$/);
    if (!match) return null;
    const month = Number(match[1]);
    const year = 2000 + Number(match[2]);
    if (month < 1 || month > 12) return null;
    return { month, year };
  }, [exp]);

  const numberDigits = number.replace(/\s+/g, '');
  const isValidForm = Boolean(
    name.trim() &&
    numberDigits.length >= 13 && numberDigits.length <= 19 &&
    parsedExp &&
    cvv.length >= 3 && cvv.length <= 4
  );

  const submit = useCallback(async () => {
    if (!ready || !window.Omise || !parsedExp) return;
    setState({ kind: 'submitting' });
    window.Omise.setPublicKey(publicKey);
    window.Omise.createToken(
      'card',
      {
        name,
        number: numberDigits,
        expiration_month: parsedExp.month,
        expiration_year: parsedExp.year,
        security_code: cvv,
      },
      async (statusCode: number, response: any) => {
        if (statusCode !== 200 || !response?.id) {
          setState({ kind: 'tokenize-error', code: response?.code || 'tokenize_failed' });
          return;
        }
        try {
          const r = await fetch('/api/payments/opn/intent', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ rental_code: rentalCode, token: response.id }),
          });
          const data = await r.json();
          if (data.status === 'requires_3ds' && data.authorize_uri) {
            window.location.href = data.authorize_uri;
            return;
          }
          if (data.status === 'success') {
            router.push(`/payment/return?ref=${rentalCode}`);
            return;
          }
          setState({ kind: 'tokenize-error', code: data.failure_reason || 'unknown' });
        } catch (e) {
          setState({ kind: 'tokenize-error', code: 'network_error' });
        }
      }
    );
  }, [ready, publicKey, name, numberDigits, parsedExp, cvv, rentalCode, router]);

  const submitting = state.kind === 'submitting';
  const errorCode = state.kind === 'tokenize-error' ? state.code : null;

  return (
    <form
      className="bg-white rounded-2xl shadow-sm border border-gray-200 p-5 space-y-4"
      onSubmit={e => {
        e.preventDefault();
        submit();
      }}
    >
      <div>
        <label className="block text-xs font-medium text-gray-500 mb-1" htmlFor="cc-name">
          {t('nameLabel')}
        </label>
        <input
          id="cc-name"
          type="text"
          autoComplete="cc-name"
          value={name}
          onChange={e => setName(e.target.value)}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-600 text-base"
          required
          disabled={submitting}
        />
      </div>

      <div>
        <label className="block text-xs font-medium text-gray-500 mb-1" htmlFor="cc-number">
          {t('numberLabel')}
        </label>
        <input
          id="cc-number"
          type="text"
          inputMode="numeric"
          autoComplete="cc-number"
          value={number}
          onChange={e => setNumber(e.target.value)}
          placeholder="•••• •••• •••• ••••"
          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-600 text-base font-mono"
          required
          disabled={submitting}
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1" htmlFor="cc-exp">
            {t('expLabel')}
          </label>
          <input
            id="cc-exp"
            type="text"
            inputMode="numeric"
            autoComplete="cc-exp"
            value={exp}
            onChange={e => setExp(e.target.value)}
            placeholder="MM/YY"
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-600 text-base font-mono"
            required
            disabled={submitting}
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1" htmlFor="cc-cvv">
            {t('cvvLabel')}
          </label>
          <input
            id="cc-cvv"
            type="text"
            inputMode="numeric"
            autoComplete="cc-csc"
            value={cvv}
            onChange={e => setCvv(e.target.value.replace(/[^\d]/g, ''))}
            maxLength={4}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-600 text-base font-mono"
            required
            disabled={submitting}
          />
        </div>
      </div>

      {errorCode && (
        <div role="alert" aria-live="polite" className="text-sm text-red-600 py-1">
          {t('errorMessage', { code: errorCode })}
        </div>
      )}

      <button
        type="submit"
        disabled={!ready || !isValidForm || submitting}
        className="w-full py-3 rounded-xl font-semibold text-white bg-green-600 hover:bg-green-700 disabled:bg-gray-300 disabled:cursor-not-allowed"
      >
        {submitting ? t('submittingCta') : t('payCta', { amount: `฿${amount.toLocaleString()}` })}
      </button>
    </form>
  );
}
```

- [ ] **Step 2: Run gates**

```bash
npm run typecheck && npm run lint && npm run build
```

Expected: pass. If `window.Omise` causes type issues, the `declare global` block resolves it.

- [ ] **Step 3: Commit**

```bash
git add app/[locale]/payment/checkout/PayElement.tsx
git commit -m "feat(opn): add <PayElement> card-form client component

Loads Omise.js from CDN, renders LENGOLF-branded card-number / exp /
cvv form, calls Omise.createToken('card', …) on submit, POSTs tokn_*
to /api/payments/opn/intent. Branches on response: 3DS redirect (same
tab, Safari iOS-safe), success navigate, decline render. PCI SAQ-A —
card never touches our server. aria-live error region with localized
copy via next-intl."
```

---

### Task 16: app/[locale]/payment/checkout/page.tsx (Server Component)

**Files:**
- Create: `app/[locale]/payment/checkout/page.tsx`

- [ ] **Step 1: Implement**

```tsx
// app/[locale]/payment/checkout/page.tsx
import { getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { createAdminClient } from '@/utils/supabase/admin';
import { loadRentalOrderSummary } from '@/lib/payments/order-summary';
import { OrderSummaryCard } from '@/components/payment/OrderSummaryCard';
import { PoweredByOpn } from '@/components/payment/PoweredByOpn';
import { opnConfig } from '@/lib/opn/config';
import { PayElement } from './PayElement';

export default async function CheckoutPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ ref?: string }>;
}) {
  const { locale } = await params;
  const { ref } = await searchParams;
  const t = await getTranslations('payment.checkout');

  if (!ref) return <MissingRefView />;

  const supabase = createAdminClient();
  const summary = await loadRentalOrderSummary(supabase, ref);
  if (!summary) return <MissingRefView />;

  if (summary.payment_status === 'paid') return <AlreadyPaidView ref={ref} />;
  if (summary.expires_at && new Date(summary.expires_at) < new Date())
    return <ExpiredView />;

  return (
    <main className="min-h-screen bg-gray-50 py-8 px-4">
      <div className="w-full max-w-md mx-auto space-y-4">
        <OrderSummaryCard summary={summary} />
        <PayElement
          rentalCode={ref}
          amount={summary.total_price}
          publicKey={opnConfig.publicKey}
          locale={locale}
        />
        <PoweredByOpn />
        <p className="text-xs text-gray-500 text-center px-2">{t('saqaNote')}</p>
      </div>
    </main>
  );
}

async function MissingRefView() {
  const t = await getTranslations('payment.checkout');
  return (
    <main className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-sm border border-gray-200 p-8 text-center">
        <h1 className="text-xl font-semibold text-gray-900 mb-2">{t('errorTitle')}</h1>
        <p className="text-sm text-gray-600 mb-6">{t('missingRefBody')}</p>
        <Link href="/course-rental" className="block w-full py-3 rounded-xl font-semibold text-white bg-green-600 hover:bg-green-700">
          {t('backCta')}
        </Link>
      </div>
    </main>
  );
}

async function AlreadyPaidView({ ref }: { ref: string }) {
  const t = await getTranslations('payment.checkout');
  return (
    <main className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-sm border border-gray-200 p-8 text-center">
        <h1 className="text-xl font-semibold text-gray-900 mb-2">{t('alreadyPaidTitle')}</h1>
        <p className="text-sm text-gray-600 mb-6">{t('alreadyPaidBody')}</p>
        <Link href={{ pathname: '/payment/return', query: { ref } }} className="block w-full py-3 rounded-xl font-semibold text-white bg-green-600 hover:bg-green-700">
          {t('viewReceiptCta')}
        </Link>
      </div>
    </main>
  );
}

async function ExpiredView() {
  const t = await getTranslations('payment.checkout');
  return (
    <main className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-sm border border-gray-200 p-8 text-center">
        <h1 className="text-xl font-semibold text-gray-900 mb-2">{t('expiredTitle')}</h1>
        <p className="text-sm text-gray-600 mb-6">{t('expiredBody')}</p>
        <Link href="/course-rental" className="block w-full py-3 rounded-xl font-semibold text-white bg-green-600 hover:bg-green-700">
          {t('newBookingCta')}
        </Link>
      </div>
    </main>
  );
}
```

- [ ] **Step 2: Verify `loadRentalOrderSummary` returns `payment_status` + `expires_at`**

```bash
grep -n "payment_status\|expires_at" lib/payments/order-summary.ts
```

If those fields aren't currently in the summary type, extend the SELECT and add to the returned shape. The preflight views above depend on them.

- [ ] **Step 3: Run gates**

```bash
npm run typecheck && npm run lint && npm run build
```

- [ ] **Step 4: Commit**

```bash
git add app/[locale]/payment/checkout/page.tsx lib/payments/order-summary.ts
git commit -m "feat(opn): add /payment/checkout Server Component with preflight views

Renders OrderSummaryCard + <PayElement> + PoweredByOpn for the happy
path. Preflight branches for MissingRef / AlreadyPaid / Expired so
we never paint a form the user can't complete. publicKey passed
as prop from server context (safe — pkey_* is browser-exposable)."
```

---

### Task 17 (**MILESTONE 2**): app/[locale]/payment/return/page.tsx (Client page with state machine)

**Files:**
- Create: `app/[locale]/payment/return/page.tsx`

- [ ] **Step 1: Implement the polling state machine**

The shape mirrors the ShopeePay branch's `/payment/result` exactly — copy that file as a starting point (`git show origin/claude/admiring-ride-526456:app/[locale]/payment/result/page.tsx`), then:

- Replace `transactionSn` references with `gateway_charge_id`
- Replace `ShopeepayWordmark` with `PoweredByOpn` in the receipt
- Add `card_brand · •••• card_last4` line below the amount
- Add a `<details>` fold-out for `auth_code`
- Change the fetched API URL from `/api/payments/shopeepay/status` to `/api/payments/opn/return`
- Replace all `shopeepay` strings in i18n keys with `opn` (or use a shared `payment.return.*` namespace — confirm against Task 18 i18n layout)

```tsx
// app/[locale]/payment/return/page.tsx
'use client';

import { useEffect, useMemo, useState } from 'react';
import { useFormatter, useTranslations } from 'next-intl';
import { useSearchParams } from 'next/navigation';
import { Link } from '@/i18n/navigation';
import { PoweredByOpn } from '@/components/payment/PoweredByOpn';
import type { RentalOrderSummary } from '@/lib/payments/order-summary';

interface StatusResponse {
  ref: string;
  status: 'unpaid' | 'pending' | 'redirected' | 'success' | 'failed' | 'refunded';
  total_price: number;
  gateway_charge_id?: string | null;
  paid_at?: string | null;
  failure_reason?: 'declined' | 'cancelled' | 'expired' | 'unknown' | null;
  card_brand?: string | null;
  card_last4?: string | null;
  auth_code?: string | null;
  summary?: RentalOrderSummary | null;
}

const POLL_INTERVAL_MS = 2500;
const MAX_POLLS = 6;
const LATE_THRESHOLD = 3;

type ViewState =
  | { kind: 'checking'; attempt: number }
  | { kind: 'confirming-late'; attempt: number }
  | { kind: 'success'; data: StatusResponse }
  | { kind: 'failed'; reason: 'declined' | 'cancelled' | 'expired' | 'unknown' }
  | { kind: 'missing-ref' };

export default function PaymentReturnPage() {
  const t = useTranslations('payment.return');
  const format = useFormatter();
  const params = useSearchParams();
  const ref = params?.get('ref') ?? null;

  const [state, setState] = useState<ViewState>(() =>
    ref ? { kind: 'checking', attempt: 0 } : { kind: 'missing-ref' }
  );

  useEffect(() => {
    if (!ref) return;
    let cancelled = false;
    let pollCount = 0;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;

    const poll = async () => {
      if (cancelled) return;
      pollCount += 1;
      try {
        const res = await fetch(`/api/payments/opn/return?ref=${encodeURIComponent(ref)}`, { cache: 'no-store' });
        if (cancelled) return;
        if (res.status === 404) { setState({ kind: 'missing-ref' }); return; }
        if (!res.ok) {
          if (pollCount < MAX_POLLS) { timeoutId = setTimeout(poll, POLL_INTERVAL_MS); }
          else { setState({ kind: 'failed', reason: 'unknown' }); }
          return;
        }
        const data = (await res.json()) as StatusResponse;
        if (data.status === 'success') { setState({ kind: 'success', data }); return; }
        if (data.status === 'failed') { setState({ kind: 'failed', reason: data.failure_reason || 'unknown' }); return; }
        const nextKind = pollCount >= LATE_THRESHOLD ? 'confirming-late' : 'checking';
        setState({ kind: nextKind, attempt: pollCount });
        if (pollCount < MAX_POLLS) { timeoutId = setTimeout(poll, POLL_INTERVAL_MS); }
        else { setState({ kind: 'failed', reason: 'cancelled' }); }
      } catch {
        if (cancelled) return;
        if (pollCount < MAX_POLLS) { timeoutId = setTimeout(poll, POLL_INTERVAL_MS); }
        else { setState({ kind: 'failed', reason: 'unknown' }); }
      }
    };

    poll();
    return () => {
      cancelled = true;
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, [ref]);

  const retryHref = useMemo(
    () => (ref ? { pathname: '/payment/checkout' as const, query: { ref } } : '/course-rental'),
    [ref]
  );

  return (
    <main className="min-h-screen bg-gray-50 py-10 px-4">
      <div className="w-full max-w-md mx-auto">
        {(state.kind === 'checking' || state.kind === 'confirming-late') && (
          <CheckingView state={state} t={t} />
        )}
        {state.kind === 'success' && <SuccessView data={state.data} t={t} format={format} />}
        {state.kind === 'failed' && <FailedView reason={state.reason} ref={ref} retryHref={retryHref} t={t} />}
        {state.kind === 'missing-ref' && <MissingRefView t={t} />}
      </div>
    </main>
  );
}

function CheckingView({ state, t }: any) {
  const isLate = state.kind === 'confirming-late';
  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-8 text-center" role="status" aria-live="polite">
      <div className="mx-auto mb-6 w-12 h-12 border-4 border-green-600 border-t-transparent rounded-full animate-spin" />
      <h1 className="text-xl font-semibold text-gray-900 mb-2">{isLate ? t('confirmingLateTitle') : t('checkingTitle')}</h1>
      <p className="text-sm text-gray-600">{isLate ? t('confirmingLateBody') : t('checkingBody')}</p>
    </div>
  );
}

function SuccessView({ data, t, format }: any) {
  const formatDate = (iso: string) =>
    format.dateTime(new Date(`${iso}T00:00:00+07:00`), { timeZone: 'Asia/Bangkok', month: 'short', day: 'numeric' });
  const formatPaidAt = (iso: string) =>
    format.dateTime(new Date(iso), { timeZone: 'Asia/Bangkok', year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });

  return (
    <div className="space-y-4" role="status" aria-live="polite">
      <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-8 text-center">
        <div className="mx-auto mb-4 w-14 h-14 rounded-full bg-green-100 flex items-center justify-center">
          <svg className="w-7 h-7 text-green-600" fill="none" stroke="currentColor" strokeWidth={3} viewBox="0 0 24 24" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <h1 className="text-xl font-semibold text-gray-900 mb-2">{t('successTitle')}</h1>
        <p className="text-sm text-gray-600">{t('successBody')}</p>
      </div>

      <section className="bg-white rounded-2xl shadow-sm border border-gray-200 p-5" aria-labelledby="receipt-heading">
        <h2 id="receipt-heading" className="sr-only">{t('successTitle')}</h2>
        {data.summary && (
          <>
            <div className="space-y-3 text-sm">
              {data.summary.club_set_name && (
                <div className="flex justify-between gap-3">
                  <span className="text-gray-500">{t('successClubSetLabel')}</span>
                  <span className="font-medium text-gray-900 text-right">{data.summary.club_set_name}</span>
                </div>
              )}
              <div className="flex justify-between gap-3">
                <span className="text-gray-500">{t('successDatesLabel')}</span>
                <span className="font-medium text-gray-900 text-right">
                  {formatDate(data.summary.start_date)} → {formatDate(data.summary.end_date)}
                  <span className="text-gray-500 font-normal"> · {t('successDaysCount', { count: data.summary.duration_days })}</span>
                </span>
              </div>
            </div>
            <hr className="my-4 border-gray-100" />
          </>
        )}
        <div className="space-y-2 text-sm">
          <div className="flex justify-between gap-3">
            <span className="text-gray-500">{t('successRentalCodeLabel')}</span>
            <span className="font-mono font-semibold text-gray-900">{data.ref}</span>
          </div>
          <div className="flex justify-between gap-3">
            <span className="text-gray-500">{t('successAmountLabel')}</span>
            <span className="font-bold text-gray-900">฿{format.number(data.total_price)}</span>
          </div>
          {(data.card_brand || data.card_last4) && (
            <div className="flex justify-between gap-3">
              <span className="text-gray-500">{t('successCardLabel')}</span>
              <span className="text-gray-700">{data.card_brand || ''} {data.card_last4 ? `•••• ${data.card_last4}` : ''}</span>
            </div>
          )}
          {data.paid_at && (
            <div className="flex justify-between gap-3">
              <span className="text-gray-500">{t('successPaidAtLabel')}</span>
              <span className="text-gray-700">{formatPaidAt(data.paid_at)}</span>
            </div>
          )}
          {data.gateway_charge_id && (
            <div className="flex justify-between gap-3 items-baseline">
              <span className="text-gray-500">{t('successChargeIdLabel')}</span>
              <span className="font-mono text-xs text-gray-600 break-all max-w-[55%]">{data.gateway_charge_id}</span>
            </div>
          )}
          {data.auth_code && (
            <details className="text-xs text-gray-500 pt-1">
              <summary className="cursor-pointer">{t('successAuthCodeSummary')}</summary>
              <div className="font-mono mt-1">{data.auth_code}</div>
            </details>
          )}
        </div>
      </section>

      <PoweredByOpn />

      <div className="flex flex-col gap-2 pt-2">
        <Link href="/course-rental" className="w-full py-3 text-center rounded-xl font-semibold text-white bg-green-600 hover:bg-green-700">
          {t('newBookingCta')}
        </Link>
        <Link href="/" className="w-full py-3 text-center rounded-xl font-semibold text-gray-700 bg-gray-100 hover:bg-gray-200">
          {t('homeCta')}
        </Link>
      </div>
    </div>
  );
}

function FailedView({ reason, ref, retryHref, t }: any) {
  const titles = { declined: t('declinedTitle'), cancelled: t('cancelledTitle'), expired: t('expiredTitle'), unknown: t('failedTitle') } as const;
  const bodies = { declined: t('declinedBody'), cancelled: t('cancelledBody'), expired: t('expiredBody'), unknown: t('failedBody') } as const;
  const canRetry = (reason === 'declined' || reason === 'cancelled' || reason === 'unknown') && !!ref;
  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-8 text-center" role="alert">
      <div className={`mx-auto mb-4 w-14 h-14 rounded-full flex items-center justify-center ${reason === 'expired' ? 'bg-gray-100' : 'bg-red-100'}`}>
        <svg className={`w-7 h-7 ${reason === 'expired' ? 'text-gray-500' : 'text-red-600'}`} fill="none" stroke="currentColor" strokeWidth={3} viewBox="0 0 24 24" aria-hidden="true">
          {reason === 'expired'
            ? <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            : <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />}
        </svg>
      </div>
      <h1 className="text-xl font-semibold text-gray-900 mb-2">{titles[reason as keyof typeof titles]}</h1>
      <p className="text-sm text-gray-600 mb-6">{bodies[reason as keyof typeof bodies]}</p>
      <div className="flex flex-col gap-2">
        {canRetry && (
          <Link href={retryHref} className="w-full py-3 text-center rounded-xl font-semibold text-white bg-green-600 hover:bg-green-700">
            {t('retryCta')}
          </Link>
        )}
        <Link href="/course-rental" className="w-full py-3 text-center rounded-xl font-semibold text-gray-700 bg-gray-100 hover:bg-gray-200">
          {t('newBookingCta')}
        </Link>
        {reason === 'declined' && (
          <a href="https://lin.ee/uxQpIXn" target="_blank" rel="noopener noreferrer" className="w-full py-3 text-center rounded-xl font-semibold text-[#06C755] bg-white border border-[#06C755] hover:bg-[#06C755]/5">
            {t('contactLineCta')}
          </a>
        )}
      </div>
    </div>
  );
}

function MissingRefView({ t }: any) {
  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-8 text-center">
      <h1 className="text-xl font-semibold text-gray-900 mb-2">{t('expiredTitle')}</h1>
      <p className="text-sm text-gray-600 mb-6">{t('expiredBody')}</p>
      <Link href="/course-rental" className="block w-full py-3 text-center rounded-xl font-semibold text-white bg-green-600 hover:bg-green-700">
        {t('newBookingCta')}
      </Link>
    </div>
  );
}
```

- [ ] **Step 2: Run gates**

```bash
npm run typecheck && npm run lint && npm run build
```

- [ ] **Step 3: Commit**

```bash
git add app/[locale]/payment/return/page.tsx
git commit -m "feat(opn): add /payment/return polling page with state machine

Mirrors the ShopeePay /payment/result shape but polls /api/payments/
opn/return and renders Opn-specific receipt fields (gateway_charge_id
as chrg_* support ref, card_brand · •••• last4, auth_code fold-out).
Same 6-attempt 15s polling budget; same checking → confirming-late
→ success/declined/cancelled/expired/unknown state machine."
```

---

### Task 18: i18n message additions (5 locales)

**Files:**
- Modify: `messages/en.json`
- Modify: `messages/th.json`
- Modify: `messages/ko.json`
- Modify: `messages/ja.json`
- Modify: `messages/zh.json`
- Modify: `types/messages.d.ts` (if it auto-generates from en.json, may be no-op)

- [ ] **Step 1: Add the EN source-of-truth keys to messages/en.json**

Add a `payment` namespace at the top level (or extend if it exists):

```json
{
  "payment": {
    "checkout": {
      "errorTitle": "Reservation not found",
      "missingRefBody": "We couldn't find that reservation. It may have expired.",
      "backCta": "Back to course rental",
      "alreadyPaidTitle": "Already paid",
      "alreadyPaidBody": "This reservation has already been paid for. Open it to see your receipt.",
      "viewReceiptCta": "View receipt",
      "expiredTitle": "Reservation expired",
      "expiredBody": "Your reservation hold has expired. Please book again.",
      "newBookingCta": "Start a new booking",
      "nameLabel": "Cardholder name",
      "numberLabel": "Card number",
      "expLabel": "Expiry (MM/YY)",
      "cvvLabel": "Security code",
      "payCta": "Pay {amount}",
      "submittingCta": "Processing…",
      "errorMessage": "Your card couldn't be processed ({code}). Please check the details and try again.",
      "poweredByLabel": "Securely processed by",
      "saqaNote": "Your card details are sent directly to our payment processor and never touch our servers."
    },
    "return": {
      "checkingTitle": "Confirming your payment…",
      "checkingBody": "This usually takes a few seconds.",
      "confirmingLateTitle": "Still confirming…",
      "confirmingLateBody": "This can take a moment. Please don't close this page.",
      "successTitle": "Payment received!",
      "successBody": "Thank you. We've sent a receipt to your email.",
      "successClubSetLabel": "Club set",
      "successDatesLabel": "Dates",
      "successDaysCount": "{count, plural, =1 {# day} other {# days}}",
      "successRentalCodeLabel": "Reservation",
      "successAmountLabel": "Total",
      "successCardLabel": "Card",
      "successPaidAtLabel": "Paid",
      "successChargeIdLabel": "Transaction",
      "successAuthCodeSummary": "Show authorization code",
      "newBookingCta": "Start a new booking",
      "homeCta": "Go to homepage",
      "declinedTitle": "Your card was declined",
      "declinedBody": "The bank rejected this charge. Try another card, or contact us on LINE.",
      "cancelledTitle": "Payment cancelled",
      "cancelledBody": "The payment was cancelled before it completed. You can try again.",
      "expiredTitle": "Reservation expired",
      "expiredBody": "This payment session has expired. Please book again.",
      "failedTitle": "Something went wrong",
      "failedBody": "We couldn't confirm your payment. Please try again or contact us.",
      "retryCta": "Try payment again",
      "contactLineCta": "Contact us on LINE"
    }
  }
}
```

- [ ] **Step 2: Mirror into th / ko / ja / zh**

Translate each key into the target language. Use the existing translation style in `messages/{locale}.json` as a reference. For ko, follow the existing tone (해요체 — note the LIFF translation skill `liff-translation` for full Korean review later).

Per the spec's Known follow-ups section, native speaker review for ko is deferred. For th/ja/zh, harvest analogous phrases from `lib/liff/booking-translations.ts` where they exist; AI-translate the rest.

- [ ] **Step 3: Run typecheck**

```bash
npm run typecheck
```

Expected: pass. If `types/messages.d.ts` is generated from en.json, it picks up the new keys automatically and TS verifies all other locales have parity.

If typecheck fails with "missing key in messages/th.json" etc., add the missing keys with a TODO comment for native review.

- [ ] **Step 4: Run build**

```bash
npm run build
```

Expected: pass with NO `MISSING_MESSAGE` warnings. Per CLAUDE.md, that warning is a real hydration bug — don't dismiss.

- [ ] **Step 5: Commit**

```bash
git add messages/
git commit -m "feat(opn): add payment.checkout + payment.return i18n keys across 5 locales

EN source of truth. TH/JA/ZH harvested from LIFF translations where
analogous keys exist, otherwise AI-translated. KO is AI-only and
should get a native-speaker review pass before the broader Korean
launch (per the main-site i18n spec's known follow-ups)."
```

---

## Phase E — Docs + verification

### Task 19: docs/superpowers/specs/opn-dev-setup.md

**Files:**
- Create: `docs/superpowers/specs/opn-dev-setup.md`

- [ ] **Step 1: Write the local dev setup guide**

```markdown
# Opn Payments — Local Dev Setup

Get a working `/payment/checkout` flow against Opn test mode with the webhook firing back to your localhost.

## Prerequisites

1. Opn test account: https://dashboard.omise.co/test/
2. `.env.local` populated:
   ```
   OPN_PUBLIC_KEY=pkey_test_*
   OPN_SECRET_KEY=skey_test_*
   OPN_WEBHOOK_SECRET=<from dashboard > Webhook Endpoints>
   OPN_API_VERSION=2019-05-29
   ```
3. Either the `omise` CLI OR `ngrok` for tunneling webhooks to localhost.

## Option A — omise CLI (recommended)

```bash
# install (one-time)
npm install -g @omise/cli
# or use the binary from https://github.com/omise/omise-cli/releases

omise listen --forward-to http://localhost:3000/api/webhooks/opn
```

Copy the printed webhook signing secret into `.env.local` as `OPN_WEBHOOK_SECRET`. Restart `npm run dev`.

## Option B — ngrok

```bash
ngrok http 3000
# Copy the https://...ngrok-free.app URL.
# In Opn dashboard > Webhook Endpoints, add:
#   https://<your-ngrok-url>/api/webhooks/opn
```

The webhook signing secret is shown after you save the endpoint. Paste into `.env.local`.

## Test cards

- Successful charge: `4242 4242 4242 4242`, any future exp, any CVV
- 3DS-enabled successful: dashboard > Settings > 3DS — enable, then any test card triggers the issuer simulator
- Insufficient funds: `4242 4242 4242 4241`
- Other decline codes: see https://www.omise.co/api-test-cards

## Verify the flow

1. Create a course-rental that needs payment (`/course-rental` → submit form → get redirected to `/payment/checkout?ref=CR…`).
2. Pay with `4242 4242 4242 4242`. Expect either same-page success or 3DS redirect → return → success.
3. Check `payment_transactions` row: `status='success'`, `gateway_charge_id='chrg_*'`, `confirmation_email_sent_at` populated.
4. Check `club_rentals` row: `payment_status='paid'`, `expires_at` cleared.
5. Confirmation email arrived (check the SMTP test inbox or wherever `EMAIL_HOST` points in dev).
```

- [ ] **Step 2: Commit**

```bash
git add docs/superpowers/specs/opn-dev-setup.md
git commit -m "docs(opn): add local dev setup guide for Opn test-mode integration"
```

---

### Task 20: docs/superpowers/specs/opn-uat-checklist.md

**Files:**
- Create: `docs/superpowers/specs/opn-uat-checklist.md`

- [ ] **Step 1: Write the UAT checklist**

```markdown
# Opn Payments — UAT Checklist

Execute against `lengolf-opn-uat.vercel.app` (manual alias on the `feat/opn-payments` branch's preview deployment).

## Prerequisites

- [ ] All `OPN_*` env vars set in Vercel **Preview** environment
- [ ] Manual alias `lengolf-opn-uat.vercel.app` created and points at the latest `feat/opn-payments` preview deployment
- [ ] Opn dashboard webhook endpoint configured: `https://lengolf-opn-uat.vercel.app/api/webhooks/opn`
- [ ] OPN_WEBHOOK_SECRET in Vercel Preview matches the dashboard endpoint's secret

## Case 1 — Successful card payment (no 3DS)

- [ ] Visit `/course-rental`, create a rental, get redirected to `/payment/checkout?ref=CR…`
- [ ] Pay with test card `4242 4242 4242 4242`
- [ ] Redirected to `/payment/return?ref=CR…` showing spinner → success card within ~5s
- [ ] Receipt shows `chrg_*`, `4242 •••• 4242`, paid timestamp
- [ ] Confirmation email arrives at customer email within ~30s
- [ ] Supabase: `payment_transactions.status='success'`, `gateway_charge_id` populated, `confirmation_email_sent_at` not null
- [ ] Supabase: `club_rentals.payment_status='paid'`, `expires_at` cleared
- [ ] Staff LINE notification fires (check the LINE channel)

## Case 2 — Successful card payment (with 3DS)

- [ ] Toggle 3DS ON in Opn dashboard Settings
- [ ] Repeat Case 1 — expect a redirect to Opn's 3DS simulator, approve, redirect back
- [ ] `payment_transactions.is_3ds=true`
- [ ] All other assertions from Case 1 hold

## Case 3 — Card declined

- [ ] Pay with `4242 4242 4242 4241` (insufficient funds)
- [ ] `/payment/return` shows "Your card was declined" with retry + LINE-contact CTAs
- [ ] `payment_transactions.status='failed'`, `failure_code='insufficient_fund'`
- [ ] `club_rentals.payment_status='failed'`
- [ ] No confirmation email sent

## Case 4 — User cancels

- [ ] Start a payment, abandon during 3DS (close the tab)
- [ ] After ~15s, polling exhausts and `/payment/return` shows "Payment cancelled" with retry CTA
- [ ] `payment_transactions.status='pending'` (cleanup cron will mark it failed eventually)

## Case 5 — Webhook idempotency

- [ ] Trigger a payment to success
- [ ] In Opn dashboard, click "Resend" on the webhook delivery
- [ ] Server log shows "ack 200" with no double-email (the email-claim dedup blocks it)

## Case 6 — Refund (dashboard-initiated)

- [ ] In Opn dashboard, find the successful charge from Case 1 and issue a full refund
- [ ] Within ~10s, `payment_transactions.status` updates (or a refund row is inserted, depending on Task 9's schema decision)
- [ ] `club_rentals.payment_status='refunded'`
- [ ] Refund email fires

## Case 7 — Signature attack rejection

- [ ] Use `curl` to POST a forged payload to `/api/webhooks/opn` with no `Omise-Signature` header
- [ ] Server returns 401 (NOT 200) so a real attacker can't replay
- [ ] Server log shows "signature verification failed"

## Manual smoke-test the i18n

- [ ] Visit `/th/payment/checkout?ref=CR…` — entire form is in Thai, no `MISSING_MESSAGE` warnings in server log
- [ ] Same for `/ko/`, `/ja/`, `/zh/`

## After UAT signs off

- [ ] Document any failure cases observed → file as issues
- [ ] Notify user → they handle cutover (set OPN_* in Prod env, approve merge to main, decommission timeline starts)
```

- [ ] **Step 2: Commit**

```bash
git add docs/superpowers/specs/opn-uat-checklist.md
git commit -m "docs(opn): add UAT checklist covering 7 cases against the lengolf-opn-uat alias"
```

---

### Task 21 (**MILESTONE 2 verify**): Manual dev smoke test

**Files:** (no code changes)

- [ ] **Step 1: Verify .env.local has test OPN_* values**

Confirm `cat .env.local | grep OPN_` shows all 5 vars populated with `pkey_test_*` / `skey_test_*` etc. If missing, this is a user step — pause and ask.

- [ ] **Step 2: Start dev server**

```bash
npm run dev
```

Expected: no module-load errors. Server listens on http://localhost:3000.

- [ ] **Step 3: Start `omise listen` in a second terminal**

```bash
omise listen --forward-to http://localhost:3000/api/webhooks/opn
```

- [ ] **Step 4: Create a test rental → pay**

Use the app's existing course-rental flow to create a rental that needs payment. Navigate to `http://localhost:3000/payment/checkout?ref=<the rental code>`.

Pay with `4242 4242 4242 4242`, expiry `12/30`, CVV `123`. Confirm:
- Form renders, submit button enables after fields are valid
- Submit triggers the spinner
- On success: redirect to `/payment/return?ref=…`
- Receipt renders with chrg_*, card brand, last4

- [ ] **Step 5: Verify side effects**

Query Supabase from the MCP or psql:

```sql
SELECT id, status, gateway_charge_id, card_brand, card_last4, paid_at, confirmation_email_sent_at
  FROM public.payment_transactions
  WHERE created_at > NOW() - INTERVAL '5 minutes'
  ORDER BY created_at DESC LIMIT 5;

SELECT rental_code, payment_status, expires_at
  FROM public.club_rentals
  WHERE updated_at > NOW() - INTERVAL '5 minutes'
  ORDER BY updated_at DESC LIMIT 5;
```

Expected: txn row has all populated fields; rental flipped to `paid` with `expires_at = NULL`.

- [ ] **Step 6: Verify webhook fired**

In the `omise listen` terminal, look for the `charge.complete` event and `200 OK` response. In the Next.js dev server log, look for absence of `signature verification failed`.

- [ ] **Step 7: Report MILESTONE 2 to user**

> **MILESTONE 2 reached** — `/payment/checkout` renders against Opn test mode, `Omise.createToken` produces `tokn_*`, `/api/payments/opn/intent` creates a charge, webhook fires back to localhost, payment_transactions + club_rentals + confirmation email all settle correctly. The integration backbone is sound. Ready for UAT alias setup.

(No git commit — this task verifies prior work.)

---

## Self-review

After all tasks land, run this end-to-end:

```bash
npm run typecheck   # PASS
npm run lint        # PASS
npm run test        # PASS — at least 30 new tests across opn-signature + opn-classify-failure
npm run build       # PASS — no MISSING_MESSAGE warnings during SSG
```

Plus the manual UAT checklist in Task 20 against `lengolf-opn-uat.vercel.app` before any merge talk.

## Deviation from spec

The spec's "Testing strategy" table listed an integration-test file at `__tests__/opn-webhook.test.ts` covering signature verification, idempotency, amount mismatch, and refund event handling against a mocked Supabase + Omise SDK. **That layer is dropped from v1.** Reasons:

- The project has no existing route-integration test infrastructure. The `__tests__/` directory only holds pure unit tests (`opn-signature`, `opn-classify-failure`, `shopeepay-signature`, `sample`) plus a shell smoke-test for middleware. Building the supabase-admin + omise-SDK mock harness adds meaningful scope (~half a task on its own).
- The existing ShopeePay branch shipped without route integration tests and is the precedent the team has accepted.
- Coverage for those scenarios is delegated to the manual UAT checklist (Task 20) — Cases 1, 3, 5, 6, 7 directly exercise the webhook signature/idempotency/refund paths against a real Opn test environment.

**Add the integration test layer in v1.1** if regression risk after the cutover justifies the infrastructure investment. Tracking notes for that future PR: build a `__tests__/helpers/mocks/supabase-admin.ts` factory + an `__tests__/helpers/mocks/omise.ts` factory; reuse across opn-webhook + shopeepay-webhook tests.
