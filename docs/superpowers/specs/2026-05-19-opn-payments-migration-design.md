# Opn Payments Migration — Design Spec

**Date:** 2026-05-19
**Project:** lengolf-booking-new
**Branch:** `feat/opn-payments` (off `origin/claude/admiring-ride-526456` @ `86e9849`)
**Scope:** Replace the reverted ShopeePay CwS integration with [Opn Payments](https://www.omise.co) (formerly Omise) as the card gateway for course-club-rental payments. Card-only in v1; PromptPay and other sources deferred to v1.1.

## Context

LENGOLF finished UAT on ShopeePay Checkout-with-Shopee (PR [#20](https://github.com/.../pull/20), merged then reverted to `570857c`) and hit two dealbreakers:

1. ShopeePay's checkout requires every customer to enter a Thai phone number and log into a Shopee/ShopeePay account before they can pay with a card — no genuine guest card flow.
2. The CwS flow is a full-page redirect away from `booking.len.golf`.

~60% of LENGOLF's course-rental customers are international tourists (JP, KR, CN, Western). Both blockers are unacceptable for that audience.

Opn Payments was selected primary because:
- Local JCB acquiring partnership since 22 Dec 2022 — important for Japanese tourists.
- Flat 3.65% across all card brands with no foreign-card surcharge.
- Omise.js inline tokenization keeps us PCI **SAQ-A** (card never touches our server).
- Partial-refund API (matches the ShopeePay UAT Case 2 capability).
- HMAC-SHA256 webhook signatures with dual-signature key-rotation support.

Stripe Thailand is the same-day fallback **only if Opn KYC slips >4 weeks** — Stripe's DX is best-in-class but its 4.75% + ฿10 international card rate hurts on a tourist-heavy mix.

The reverted ShopeePay code lives on `origin/claude/admiring-ride-526456` (HEAD `86e9849`) and is the architectural reference for this work — file-by-file ports below.

## Goals

1. Card-only Opn integration replacing the ShopeePay redirect flow for course club rentals.
2. International tourists can pay with their card without entering Thai phone numbers or creating gateway accounts.
3. Inline tokenization — customer never leaves `booking.len.golf` (3DS aside, which is a same-tab redirect to the issuer).
4. PCI footprint stays at SAQ-A.
5. Webhook is the authoritative writer of `payment_status = 'paid'`, with `/api/payments/opn/return` polling as a graceful fallback when the webhook is delayed (same pattern as the existing ShopeePay branch).
6. ShopeePay code stays in-tree and unchanged for a 60-day post-cutover parallel-run window before decommission.

## Non-Goals (v1)

- **PromptPay, TrueMoney, Internet Banking, other Opn sources** — v1.1+ (the schema makes room via `gateway_token_id` accepting `src_*`).
- **Saved cards / Omise customers API** — one-shot charge per rental.
- **Apple Pay / Google Pay** — Opn sources; treat like PromptPay.
- **Manual capture (auth+capture split)** — v1 auto-captures; payment is the trigger for staff prep, so no business reason to delay.
- **Inline 3DS iframe** — most issuer banks forbid iframe embedding; same-tab redirect to `authorize_uri` only.
- **Reconciliation cron** — log + alert in v1 (`SELECT … WHERE status='pending' AND created_at < now() - interval '30 min'`), build the cron in v1.1 only if real data shows it's needed.
- **Admin-initiated refund endpoint** (`/api/payments/opn/refund`) — deferred to v1.1. v1 handles refunds the same way ShopeePay does: staff issue them from the Opn merchant dashboard, and our `refund.create` webhook updates `payment_transactions` + sends the refund email. The ShopeePay branch has no `/api/payments/shopeepay/refund` route either — refund initiation has never been in-app. Deferring avoids designing admin-auth from scratch in v1 (this app has no staff-role precedent — NextAuth is configured for customers/VIP only). v1.1 builds the endpoint once the admin-UI surface is settled.
- **ShopeePay decommission** — separate PR, 60 days post-cutover.
- **Setting `OPN_*` in Vercel Production env** — user action at cutover.
- **Merging to `main`** — gated on user cutover approval after live keys arrive (~15 business days for KYC).
- **Stripe Thailand fallback** — only if Opn KYC slips >4 weeks; user explicitly directs.

---

## 1. Customer flow

```
┌──────────────────┐
│ /course-rental   │  user submits rental form
│ submit handler   │  → POST creates club_rentals row
└────────┬─────────┘  → returns rental_code
         │
         ▼
┌──────────────────────────────────────────────────────────┐
│ /[locale]/payment/checkout?ref=CRYYMMDDXXX               │
│ • Server Component: loadRentalOrderSummary → render OK   │
│ • Client island <PayElement>:                            │
│     - Loads Omise.js from CDN in useEffect               │
│     - Renders LENGOLF-branded card-number/exp/cvv form   │
│     - On submit: Omise.createToken('card', {…})          │
│     - POST { rental_code, token: tokn_* }                │
│             ↓                                            │
│         /api/payments/opn/intent                         │
└──────────────────┬───────────────────────────────────────┘
                   │
                   ▼
       ┌─────────────────────────┐
       │  intent route:          │
       │  1. validate rental     │
       │  2. INSERT pending      │
       │     payment_transactions│
       │  3. omise.charges.create│
       │     ({card, amount, …,  │
       │      return_uri})       │
       │  4. UPDATE row w/ chrg_*│
       │  5. return:             │
       │     • { 3ds: authz_uri }│
       │     • OR { paid: true } │
       │     • OR { declined }   │
       └────────┬────────────────┘
                │
       ┌────────┴───────────────────────┐
       │                                │
       ▼                                ▼
  same-tab redirect to            client navigates to
  authorize_uri (3DS)             /payment/return?ref=...
       │                                │
       ▼                                │
  issuer → return_uri =                 │
  /payment/return?ref=...               │
       │                                │
       └────────────────┬───────────────┘
                        ▼
       ┌────────────────────────────────┐
       │ /[locale]/payment/return       │
       │ • Polls /api/payments/opn/     │
       │   return?ref=... every 2.5s    │
       │ • Renders: checking →          │
       │   confirming-late → success/   │
       │   declined/cancelled/expired   │
       │ • On success: receipt card     │
       └────────────────────────────────┘

Parallel, async:
  Omise → POST /api/webhooks/opn (charge.complete) →
    verify HMAC → idempotency check → flip rental.payment_status='paid' →
    claimAndSendConfirmationEmail() → fire LINE staff notification
```

## 2. Library layout (`lib/opn/*` + shared `lib/payments/*`)

1:1 file-by-file port of `lib/shopeepay/*` from `origin/claude/admiring-ride-526456`, with two helpers lifted into a gateway-agnostic `lib/payments/` namespace (still importable by `lib/shopeepay/*` during the parallel-run window).

| File | Purpose | Notes vs ShopeePay |
|---|---|---|
| `lib/opn/config.ts` | Asserts `OPN_PUBLIC_KEY`, `OPN_SECRET_KEY`, `OPN_WEBHOOK_SECRET`, `OPN_API_VERSION` at module load. Coherence guard: `VERCEL_ENV === 'production'` requires `skey_*` not `skey_test_*` (Opn switches modes by key prefix, not base URL). | Same `required()` helper. Coherence guard inspects key prefix instead of UAT host substring. Build-time fail-fast — see CLAUDE.md "Marketing-consent deploy notes". |
| `lib/opn/signature.ts` | Pure module. `signPayload(timestamp, rawBody, secret)` returns hex HMAC-SHA256 over `${timestamp}.${rawBody}`. `verifyPayload(rawBody, headerSig, headerTs, secrets[])` accepts an array of secrets for dual-rotation. | Different HMAC scheme + dual-signature support. No env deps — unit-testable. |
| `lib/opn/client.ts` | Wraps the official `omise` npm package (`omise-node`). Single shared instance initialized with `secretKey` + `omiseVersion`. Exports `createCharge()`, `retrieveCharge()`, `createRefund()`, `listRefunds()`. | Replaces ShopeePay's hand-rolled HTTP client. SDK handles retries, timeouts, error shapes. |
| `lib/opn/types.ts` | TS types narrowing the omise-node response shapes. `isChargeSuccessful(charge)`, `extractFailureReason(charge)` discriminators. `classifyFailure(failure_code)` for taxonomy mapping (see §7). | Same pattern as ShopeePay's `isFinalSuccess` / `extractReferenceId`. |
| `lib/payments/markRentalAsPaid.ts` | **Lifted from `lib/shopeepay/markRentalAsPaid.ts`.** Gateway-agnostic email-claim dedup via conditional UPDATE on `payment_transactions.confirmation_email_sent_at`. Accepts a `gatewayMetadata` arg (`{ transactionSn }` for ShopeePay, `{ gatewayChargeId, authCode }` for Opn) so both gateways consume the same primitive. | Move + import-path update in `lib/shopeepay/*`. Net: one tested code path, two callers. |
| `lib/payments/order-summary.ts` | **Lifted from `lib/shopeepay/order-summary.ts`.** Given a rental_code, returns the data the receipt UI needs (rental_code, club set, dates, line items, total). Identical regardless of gateway. | Move + import-path update. Net: one tested code path. |

## 3. API surface

All routes live under `app/api/payments/opn/*` and `app/api/webhooks/opn/route.ts`. All use `createAdminClient()` (service-role; `payment_transactions` is server-only per `~/.claude/plans/humming-singing-candy.md` allowlist).

| Route | Method | Auth | Body / Query | Returns |
|---|---|---|---|---|
| `/api/payments/opn/intent` | POST | implicit-via-`rental_code` (matches ShopeePay's `/create` capability model) | `{ rental_code: string, token: 'tokn_*' }` | One of three terminal cases:<br>`{ status: 'requires_3ds', authorize_uri }`<br>`{ status: 'success', ref }`<br>`{ status: 'failed', failure_reason }`<br>Idempotency-Key header to Omise = `SHA256(rental_code + token)` so a double-click can't double-charge. |
| `/api/payments/opn/return` | GET | implicit-via-`ref` | `?ref=CRYYMMDDXXX` | `StatusResponse` shape from the ShopeePay branch's `/status` (status, total_price, paid_at, failure_reason, summary). `transaction_sn` → `gateway_charge_id`. Reads txn row → if pending, calls `omise.charges.retrieve(chrg_*)` → if terminal, flips row and fires `claimAndSendConfirmationEmail` async. |
| `/api/webhooks/opn` | POST | HMAC signature verify on raw body | Opn webhook payload | Branches on `event.key`: `charge.complete` → flip rental + email; `charge.create` → log only; `refund.create` → mirror ShopeePay's `handleRefundNotify` pattern (`lib/opn/handleRefundNotify.ts`) — mark refund row terminal + send refund email. 200 OK on rows we recognize incl. idempotent replays. 401 on bad signature so Opn retries. |

**Refund initiation is OUT OF SCOPE for v1** (see Non-Goals). Staff issue refunds from Opn's merchant dashboard; our webhook reacts. No `/api/payments/opn/refund` route is built in this PR. v1.1 picks it up once the admin-UI pattern is settled.

**Folded into `/return`:** the original brief listed a separate `/api/payments/opn/summary` route. The data overlaps with what `/return` already returns; folding keeps the API surface smaller. Will re-split if `/payment/checkout` later needs summary without invoking gateway-probe side-effects.

**Dropped from v1:** the original brief also listed `/api/payments/opn/refund`. The ShopeePay branch has no in-app refund route either — the existing pattern is dashboard-initiated refunds processed via webhook. Deferred to v1.1 once admin-UI lands.

**`/intent` write order:** insert pending `payment_transactions` row BEFORE calling Omise, UPDATE with `chrg_*` and result after. Same pattern as ShopeePay's `/create`. Guarantees a paper trail even on gateway timeout.

**Webhook → `payment_transactions` join key:** `gateway_charge_id = charge.id`. Opn doesn't carry a merchant-supplied reference field that's also unique; the `chrg_*` ID is the only stable join. We pass `rental_code` in `metadata.rental_code` for grepping but don't join on it.

## 4. UI pages

### `app/[locale]/payment/checkout/page.tsx` — Server Component

```tsx
export default async function CheckoutPage({ searchParams }) {
  const { ref } = await searchParams;
  if (!ref) return <MissingRefView />;

  const supabase = createAdminClient();
  const summary = await loadRentalOrderSummary(supabase, ref);
  if (!summary) return <MissingRefView />;

  // Preflight: never paint a form the user can't complete
  if (summary.payment_status === 'paid') return <AlreadyPaidView ref={ref} />;
  if (summary.expires_at && new Date(summary.expires_at) < new Date())
    return <ExpiredView ref={ref} />;

  return (
    <main className="min-h-screen bg-gray-50 py-8 px-4">
      <div className="w-full max-w-md mx-auto space-y-4">
        <OrderSummaryCard summary={summary} />
        <PayElement
          rentalCode={ref}
          amount={summary.total_price}
          publicKey={process.env.OPN_PUBLIC_KEY!}
        />
        <PoweredByOpn />
      </div>
    </main>
  );
}
```

`OrderSummaryCard` reused unchanged from the ShopeePay branch. `PoweredByOpn` is a new trust-signal component mirroring `ShopeepayWordmark`.

### `<PayElement>` — Client Component

State machine: `idle → submitting → (success | 3ds-redirect | declined | tokenize-error)`.

On mount, inject `https://cdn.omise.co/omise.js` once, wait for `window.Omise`, set `omiseReady=true`. Render cardholder name / number (with brand-icon swap via `Omise.card.detectBrand`) / expiry MM/YY / CVV / submit button (disabled until ready). Error region is `aria-live="polite"` with translated copy per locale (next-intl `useTranslations`).

On submit:
1. `Omise.setPublicKey(publicKey)`
2. `Omise.createToken('card', { name, number, expiration_month, expiration_year, security_code }, cb)`
3. POST `{ rental_code, token: response.id }` to `/api/payments/opn/intent`
4. Branch on response:
   - `requires_3ds`: `window.location.href = authorize_uri` (same tab — Safari iOS blocks popups)
   - `success`: `router.push('/[locale]/payment/return?ref=...')`
   - `failed`: render decline UI with retry CTA

**Why custom React vs OmiseCard.open() hosted modal** (both have identical SAQ-A footprint):
1. `aria-live` error region speaks the customer's language via next-intl, not Omise's English defaults.
2. Disabled submit button until SDK is ready — fast-clicker on slow connection never hits a no-op.
3. Visual matches `OrderSummaryCard` directly above; reads as one polished surface.

### `app/[locale]/payment/return/page.tsx` — Client page

Identical state-machine shape to ShopeePay branch's `/payment/result`. Polls `/api/payments/opn/return?ref=...` every 2.5s, max 6 attempts (15s budget):

| State | Trigger | Visual |
|---|---|---|
| `checking` | attempts 1–3 (~7.5s) | spinner + "Confirming your payment…" |
| `confirming-late` | attempts 4–6 (~7.5–15s) | spinner + "Still confirming — this can take a moment" |
| `success` | terminal | green check + receipt card |
| `failed: declined` | terminal | red X + "Card was declined" + retry + LINE-contact CTA |
| `failed: cancelled` | terminal OR poll budget exhausted | gray X + "Payment was cancelled" + retry |
| `failed: expired` | terminal | gray clock + "Reservation expired" + book-again |
| `failed: unknown` | terminal | generic |
| `missing-ref` | no `?ref` or 404 | same as ShopeePay branch |

Receipt card differs from ShopeePay branch's `SuccessView` in three places:
- `transactionSn` → `gateway_charge_id` (`chrg_*`) as the support-lookup reference
- New line: `card_brand · •••• card_last4` (from Omise charge object)
- New fold-out: `auth_code` (support-only, for chargeback disputes)

## 5. Schema migration

Single idempotent migration: `supabase/migrations/<timestamp>_add_opn_fields_to_payment_transactions.sql`

```sql
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

CREATE INDEX IF NOT EXISTS payment_transactions_gateway_charge_id_idx
  ON public.payment_transactions (gateway_charge_id);
```

- Index is critical — the webhook handler looks up rows by `gateway_charge_id` on every Omise callback.
- The `gateway` column stays TEXT (no enum constraint), so adding the value `'opn'` is a code-only change.
- Reuses the existing `confirmation_email_sent_at` column for the cross-actor email-claim dedup.
- Capture Opn's `transaction_fees { fee_rate, vat_rate }` block on every charge — the reconciliation hook for accounting.

## 6. Webhook signature scheme

**Header contract** (per Opn webhook docs):
- `Omise-Signature`: hex HMAC-SHA256 of `${timestamp}.${rawBody}`. During key rotation, the header carries multiple comma-separated signatures.
- `Omise-Signature-Timestamp`: Unix timestamp (seconds) that was concatenated.

**`lib/opn/signature.ts`** — pure module, no env deps:

```ts
import { createHmac, timingSafeEqual } from 'crypto';

export function signPayload(timestamp: string, rawBody: string, secret: string): string {
  return createHmac('sha256', secret).update(`${timestamp}.${rawBody}`, 'utf8').digest('hex');
}

export function verifyPayload(
  rawBody: string,
  headerSig: string | null | undefined,
  headerTs: string | null | undefined,
  secrets: readonly string[]
): boolean {
  if (!headerSig || !headerTs || !secrets.length) return false;
  const provided = headerSig.split(',')
    .map(s => s.trim())
    .filter(Boolean)
    .map(s => safeHexToBuffer(s))
    .filter((b): b is Buffer => b !== null);
  if (!provided.length) return false;
  for (const secret of secrets) {
    const expected = Buffer.from(signPayload(headerTs, rawBody, secret), 'hex');
    if (provided.some(p => p.length === expected.length && timingSafeEqual(p, expected))) {
      return true;
    }
  }
  return false;
}
```

**Webhook anti-replay**: reject if `Math.abs(Date.now() - Number(headerTs) * 1000) > 5 * 60_000` (5-minute skew window).

**Dual-secret rotation** via env:
- `OPN_WEBHOOK_SECRET` — always set, the active secret.
- `OPN_WEBHOOK_SECRET_PREVIOUS` — set ONLY during a 24h rotation window; cleared afterwards.

Verifier passes `[active, previous].filter(Boolean)` so EITHER secret can verify ANY of the comma-separated header signatures.

## 7. Failure-reason taxonomy

Opn's `charge.failure_code` enum maps to our four-value `FailureReason` taxonomy (`declined | cancelled | expired | unknown`) — same shape as the ShopeePay branch's `/payment/result` so the same UI component renders.

| Opn `failure_code` | Our `FailureReason` | UX |
|---|---|---|
| `insufficient_fund`, `insufficient_balance`, `stolen_or_lost_card`, `payment_rejected`, `confirmed_amount_mismatch` | `declined` | "Card was declined" + retry + LINE contact CTA |
| `payment_cancelled` | `cancelled` | "Cancelled" + retry CTA |
| `failed_processing`, `timeout`, `failed_fraud_check` | `unknown` | Generic + retry CTA |
| (charge never confirmed within 30 min — no failure_code, stays pending) | `expired` | "Reservation expired" + book-again CTA |
| anything else | `unknown` | Generic |

Stored verbatim in `payment_transactions.failure_code` + `.failure_message` for support lookup. The mapping table lives in `lib/opn/types.ts::classifyFailure()` — one place to update when Opn adds codes.

## 8. 3DS handling

- `omise.charges.create({ … return_uri: '${BASE_URL}/[locale]/payment/return?ref=...' })`.
- If response has `authorize_uri` → `/intent` returns `{ status: 'requires_3ds', authorize_uri }` → client does `window.location.href = authorize_uri` (same-tab).
- Issuer redirects browser back to our `return_uri` — `/payment/return` page mounts and starts polling.
- Polling endpoint calls `omise.charges.retrieve(chrg_*)` if local row is still `pending` (mirrors ShopeePay's `/transaction/check` fallback).
- **Stored**: `is_3ds = (authorize_uri != null)` so reporting can distinguish 3DS conversion impact.

## 9. Refund flow (v1: dashboard-initiated, webhook-reactive)

- **Initiation**: staff use Opn's merchant dashboard to issue full or partial refunds. No in-app admin endpoint in v1.
- **Reaction**: Opn sends `refund.create` webhook → `/api/webhooks/opn` routes to `lib/opn/handleRefundNotify.ts` → mirrors ShopeePay's `handleRefundNotify` pattern: locate the original `payment_transactions` row by `gateway_charge_id`, insert/update a child refund row, flip `club_rentals.payment_status = 'refunded'` if fully refunded, send refund email via the shared `claimAndSendRefundEmail` helper (to be lifted analogously to `claimAndSendConfirmationEmail`).
- **Opn limits to be aware of**: max 15 partial refunds per charge, must be within 365 days of capture. Our webhook handler reflects whatever Opn allows; we don't pre-validate.
- **v1.1**: build `/api/payments/opn/refund` POST endpoint with admin-auth once the admin-UI pattern is settled. Both initiation paths produce the same `refund.create` webhook, so the v1 webhook handler is forward-compatible.

---

## Environment variables

Five new vars, all asserted at module load in `lib/opn/config.ts`:

| Var | Where set | Notes |
|---|---|---|
| `OPN_PUBLIC_KEY` | Prod + Preview + Dev | `pkey_*` live, `pkey_test_*` test. Safe to expose; passed to `<PayElement>` as a server-component prop. |
| `OPN_SECRET_KEY` | Prod + Preview + Dev | `skey_*` / `skey_test_*`. Server-only. **Coherence guard**: `VERCEL_ENV === 'production'` requires `skey_*` prefix; else throw at module load. |
| `OPN_WEBHOOK_SECRET` | Prod + Preview + Dev | Active signing secret. |
| `OPN_WEBHOOK_SECRET_PREVIOUS` | Prod only, optional | Set during rotation; cleared 24h after. Verifier accepts either. |
| `OPN_API_VERSION` | Prod + Preview + Dev | Pin to a known version (e.g. `2019-05-29`). Avoids silent breakage. |

**Set Preview + Development before the first push** of any code that imports `lib/opn/config.ts`. Production stays empty until cutover; that's fine because the branch doesn't merge to `main` until cutover.

**`vercel env add` from PowerShell**: NEVER pipe (per `~/.claude/CLAUDE.md`). Add interactively or via the Vercel dashboard. User does this themselves. No secrets in chat or committed files.

## Testing strategy

| Layer | Coverage | File |
|---|---|---|
| Unit | Signature sign/verify, dual-rotation, failure classifier | `__tests__/opn-signature.test.ts`, `__tests__/opn-classify-failure.test.ts` |
| Unit | Shared `markRentalAsPaid` email-claim dedup — expand to cover both gateways | `__tests__/mark-rental-as-paid.test.ts` |
| Integration | Webhook route: valid sig + payload → DB flip + email; invalid sig → 401; replay → 200 no-op; amount mismatch → 400; refund event → refund row updates; stale timestamp → 401 | `__tests__/opn-webhook.test.ts` |
| Manual (dev) | Full `/payment/checkout` flow against Opn test mode with their 3DS test card (`4242 4242 4242 4242` w/ 3DS enabled in dashboard). Webhook delivery via `omise listen` CLI → forwards to localhost. | `docs/superpowers/specs/opn-uat-checklist.md` (written during implementation) |
| Manual (staging) | Same as above but against the manual Vercel alias once live keys land | same checklist |

**Pre-commit gates** (per CLAUDE.md):
```bash
npm run typecheck   # must pass
npm run lint        # must pass
npm run test        # all green, esp. new opn-signature tests
npm run build       # CRITICAL — typecheck+lint don't catch Server Component / webpack errors
```

Plus a real `npm run dev` + browser smoke test before declaring any UI change done.

---

## Rollout & ops

### Branch + Vercel discipline

- **Branch**: `feat/opn-payments` off `origin/claude/admiring-ride-526456` @ `86e9849`.
- **Worktree**: `.claude/worktrees/opn-payments/` (already created; this spec lives there).
- **Upstream tracking**: explicitly unset on `feat/opn-payments` (otherwise auto-tracked to `claude/admiring-ride-526456` and a `git push` would land on the ShopeePay UAT branch — disaster). Future push requires explicit `-u origin feat/opn-payments`.

### Vercel aliases (manual, survive branch-delete per `feedback_vercel_branch_alias_lifecycle.md`)

| Alias | Points at | Purpose |
|---|---|---|
| `lengolf-shopeepay-uat.vercel.app` | `claude/admiring-ride-526456` preview (unchanged) | Preserved during parallel-run window for ShopeePay refund Case 2 testing |
| `lengolf-opn-uat.vercel.app` | `feat/opn-payments` preview (NEW) | Opn UAT. Webhook endpoint for Opn dashboard. User creates the alias when first preview deployment lands. |

### Don't-merge rule

**No merge to `main` until ALL of:**
1. Live Opn keys exist (after KYC, ~15 business days).
2. All 5 `OPN_*` env vars set in Vercel Production.
3. User explicitly approves cutover.

This is the `feedback_uat_merge_blocks_prod.md` lesson: module-load env-var assertions block every team prod build if envs aren't set. The cost of skipping this rule is a 33-file revert (cf. `570857c`).

### Dev-mode webhook delivery

Two options, both documented in `docs/superpowers/specs/opn-dev-setup.md` (written during implementation):
1. `omise listen --forward-to localhost:3000/api/webhooks/opn` — canonical Opn-supported flow.
2. `ngrok http 3000` + paste tunnel URL into Opn dashboard webhook config.

First manual UAT pass uses `omise listen`.

### Decommission timeline (NOT in this PR)

After Opn is live 60 days with healthy metrics, a separate clean-delete PR:
- Delete `lib/shopeepay/*`, `app/api/payments/shopeepay/*`, `app/api/webhooks/shopeepay/*`, `app/[locale]/payment/start/*`, `app/[locale]/payment/result/*`, `components/payment/ShopeepayWordmark.tsx`, ShopeePay tests.
- Remove `SHOPEEPAY_*` env vars from all Vercel envs.
- Drop the `lengolf-shopeepay-uat.vercel.app` alias.

---

## Open at implementation time (not blocking design approval)

1. **Manual UAT alias creation timing**. User creates `lengolf-opn-uat.vercel.app` against the first preview deployment of `feat/opn-payments`. Not blocking design; blocking first webhook UAT.
2. **Opn API version pin**. The spec sets `OPN_API_VERSION` (e.g. `2019-05-29`) but the exact version to pin should be the latest stable as of integration day, confirmed from Opn dashboard. Pin in the env-vars table before merging.

---

## Decision log (brainstorming session 2026-05-19)

- **v1 scope**: card only. PromptPay deferred to v1.1.
- **Page flow**: `/payment/checkout` (summary + inline card form) → `/payment/return?ref=…` (3DS landing + receipt). Non-3DS charges also redirect through `/payment/return` so receipts render from one component.
- **Card UI**: custom React form + programmatic `Omise.createToken('card', {…})` on submit. NOT `OmiseCard.open()` hosted modal.
- **Paid-status writer**: webhook + polling fallback (both can flip `rental.payment_status='paid'`; email-claim dedup prevents double-sends). Matches existing ShopeePay pattern.
- **UAT alias name**: `lengolf-opn-uat.vercel.app`. Existing `lengolf-shopeepay-uat.vercel.app` preserved unchanged during parallel-run window.
- **`/summary` route**: folded into `/return` (data overlap; can re-split later if needed).
- **`/refund` admin endpoint**: deferred to v1.1 (discovered during planning that the ShopeePay branch never built one either — refund initiation has always been dashboard-only; webhook handles the reaction).
- **Reconciliation cron**: deferred to v1.1; v1 ships with a logging+alert query only.
