# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview
LENGOLF Booking System - Next.js 14 full-stack golf bay booking management with integrated VIP customer portal. Built with TypeScript, Supabase PostgreSQL, and NextAuth.js multi-provider authentication.

## Commands

### Development
```bash
npm run dev           # Start development server
npm run build         # Production build
npm run start         # Production server
npm run typecheck     # TypeScript type checking (run before commits)
npm run lint          # ESLint code quality check
npm run test          # Run Jest test suite
npm run test:watch    # Jest in watch mode
npm run format        # Prettier code formatting
```

## Architecture Overview

### Core Stack
- **Framework**: Next.js 14 with App Router (NOT Pages Router)
- **Database**: Supabase PostgreSQL with Row Level Security (RLS) enabled
- **Authentication**: NextAuth.js v4 with Google/Facebook/LINE/Guest providers
- **UI**: Tailwind CSS + Shadcn/UI components
- **API**: Next.js API routes with TypeScript

### Database Security
- **CRITICAL**: All user data protected by Row Level Security (RLS)
- Use `createServerClient()` for server-side operations
- Use `createBrowserClient()` for client-side operations
- Always validate authentication before database operations

### Key File Locations

#### Authentication & Users
- NextAuth config: `app/api/auth/options.ts`
- User profiles: `utils/supabase/crm.ts`
- VIP status: `lib/vipService.ts`
- Supabase clients: `utils/supabase/client.ts` & `utils/supabase/server.ts`

#### Booking System
- Availability API: `app/api/availability/`
- Booking creation: `app/api/bookings/create/route.ts`
- Booking components: `app/(features)/bookings/components/`
- Bay assignment logic: `utils/booking-utils.ts`

#### LIFF (LINE Front-end Framework) Pages
- Booking page: `app/liff/booking/page.tsx`
- Membership page: `app/liff/membership/page.tsx`
- Contact/Bay Rates/Coaching: `app/liff/contact/`, `app/liff/bay-rates/`, `app/liff/coaching/`
- LIFF API endpoints: `app/api/liff/` (booking/user, membership/data, language, etc.)
- Language persistence: `lib/liff/language-persistence.ts` (shared utility for all LIFF pages)
- Translations: `lib/liff/translations.ts`, `lib/liff/booking-translations.ts`, `lib/liff/membership-translations.ts`

#### VIP Portal
- VIP dashboard: `app/(features)/vip/dashboard/page.tsx`
- VIP components: `components/vip/`
- VIP API endpoints: `app/api/vip/`
- VIP status caching: 3-minute TTL with user-scoped invalidation

## Critical Development Guidelines

### Database Operations
- **NEVER bypass RLS** - all queries must be user-scoped
- Profile creation auto-triggers VIP customer data creation
- Package data synced from external CRM (read-only)
- Use `backoffice` schema for CRM data (read-only)

### API Patterns
- Use `NextRequest` and `NextResponse` for App Router APIs
- Implement Zod validation where available
- Target <500ms response time (95th percentile)
- Return standardized error responses

### Component Architecture
- UI components: `components/ui/` (Shadcn/UI)
- VIP components: `components/vip/`
- Shared components: `components/shared/`
- Follow server component patterns, client only when needed

### VIP System
- VIP status determined by `vip_customer_data` table presence
- Account linking connects `profiles` to CRM via `crm_customer_mapping`
- Customer matching uses confidence scoring (0.75 threshold)
- Package tracking with real-time usage analytics

## Environment Variables (Required)
```bash
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
NEXTAUTH_SECRET=
NEXTAUTH_URL=
LINE_CHANNEL_ACCESS_TOKEN=
LINE_GROUP_ID=            # staff notification group; required in every env that fires LINE
MARKETING_PREFS_SECRET=   # 64 hex chars (`openssl rand -hex 32`) — see Marketing-consent deploy notes below
SHOPEEPAY_BASE_URL=       # https://api.wallet.airpay.co.th (prod) or https://api.uat.wallet.airpay.co.th (UAT)
SHOPEEPAY_CLIENT_ID=      # ShopeePay-issued; see ShopeePay deploy notes below
SHOPEEPAY_SECRET_KEY=     # ShopeePay-issued HMAC secret
SHOPEEPAY_MERCHANT_EXT_ID=# 'lengolf'
SHOPEEPAY_STORE_EXT_ID=   # 'lengolf'
BACKOFFICE_API_TOKEN=     # ≥32 chars, shared with lengolf-forms backoffice for refund route auth
EMAIL_HOST=               # SMTP server hostname or IP
EMAIL_PORT=               # SMTP port (default: 587)
EMAIL_SECURE=             # Use SSL/TLS (default: false)
EMAIL_USER=               # SMTP username
EMAIL_PASSWORD=           # SMTP password
EMAIL_TLS_REJECT_UNAUTHORIZED=false  # Set to false to allow self-signed certificates (default: true)
NEXT_PUBLIC_GOOGLE_MAPS_API_KEY=  # Browser-restricted Maps JS API key; enables Places autocomplete on delivery address. HTTP-referrer-restricted in GCP Console (booking.len.golf/* + localhost:3000/*). Same project as lengolf-forms.
```

## Marketing-consent deploy notes (PR #18, merged 2026-04-26)

The marketing-consent feature (`/preferences/[token]`, GuestForm + BookingDetails opt-in checkboxes) ships a **build-time env-var assertion** in `lib/marketing-prefs/token.ts` that throws if `MARKETING_PREFS_SECRET` is missing or under 64 chars. The assertion fires during Next.js's `Collecting page data` phase, which means:

- **Every Vercel environment must have the secret set BEFORE merging** any code that imports `lib/marketing-prefs/token.ts`. Set it across Production + Preview + Development. Otherwise every PR's preview deploy will fail with `Failed to collect page data for /api/preferences/[token]`. (We learned this the hard way — the merge of PR #18 errored three times until the secret landed.)
- **Use the same value across all three environments** so preference-center URLs minted in dev/preview verify correctly against prod.
- **`vercel redeploy <id>` does NOT pick up newly-set env vars** — it reuses the prior build config. To force a fresh build with current env vars, push an empty commit: `git commit --allow-empty -m "trigger redeploy"` && `git push`.
- **Don't `echo "$SECRET" | vercel env add` from PowerShell.** PowerShell's pipe semantics differ from bash; in practice it stored the literal string `\r\n` (4 chars) as the value, breaking the assertion. Use the Vercel dashboard, or run `vercel env add` interactively and paste when prompted.

If you rotate `MARKETING_PREFS_SECRET`, every previously-minted preference URL stops verifying. That's intended (it's the kill-switch for emails containing leaked links). Compose a fresh batch of preference URLs for any subsequent email send.

### ⚠️ The DB migration is a deploy prerequisite too (bitten 2026-07-26)

The feature's migration `supabase/migrations/20260426120000_add_marketing_opt_in_audit_columns.sql` was **never applied to prod at merge time**, and the failure mode is vicious: all three consent-write paths (`app/api/bookings/create`, `app/api/preferences/[token]`, `app/api/vip/profile`) name `marketing_opt_in_changed_at`/`marketing_opt_in_source` in a single PostgREST update, and PostgREST rejects the **entire** update when any named column is missing (PGRST204) — so `marketing_opt_in` itself never got written either. Every booking-checkbox opt-in from 2026-04-26 to 2026-07-26 was silently lost (the booking route swallows the error with `console.warn`), and the preference center couldn't record opt-outs. Discovered only because an analytics question noticed zero 2026 opt-ins. Lessons: (1) a repo migration file is not an applied migration — verify against `supabase_migrations.schema_migrations`; (2) fire-and-forget consent writes hide schema drift — if you see `[Booking] Failed to update marketing_opt_in` in Vercel logs, treat it as a schema-drift alarm, not noise.

Course-rental payments and refunds flow through ShopeePay's Checkout-with-Shopee (CwS) integration. Three production prerequisites — all five SHOPEEPAY_* + BACKOFFICE_API_TOKEN env vars must be set across **Production + Preview + Development BEFORE merging code that imports `lib/shopeepay/config.ts`**, OR the build fails at `Collecting page data` with:

```
Error: SHOPEEPAY_BASE_URL is required for ShopeePay integration.
```

Same trap as MARKETING_PREFS_SECRET above — once you have a build-time env-var assertion in the dependency graph of any route, every subsequent push to main fails until envs land. The original PR (#20) was reverted on 2026-05-15 specifically because prod env vars weren't set; the integration only re-shipped successfully on 2026-05-27 after the env discipline was followed.

### Production-vs-staging coherence guard

`lib/shopeepay/config.ts` throws if `VERCEL_ENV=production` sees a `.uat.` base URL — that combination ships UAT credentials to a prod-tagged deployment. The guard is intentional. To run prod-creds-in-UAT testing (which is how we did our final-mile QA), use the inverse — Preview env with prod base URL is allowed because Preview deployments don't carry VERCEL_ENV=production.

### Wire-shape gotchas (learned the hard way)

ShopeePay's API is internally inconsistent across endpoint families; never pattern-extrapolate. The published docs at https://product.shopeepay.com are reliable but easy to misread. Verified in UAT:

| Endpoint | Path | Reference field |
|---|---|---|
| Order create | `/v3/merchant-host/order/create` | `payment_reference_id` |
| Transaction check | `/v3/merchant-host/transaction/check` | `reference_id` |
| Refund create | `/v3/merchant-host/transaction/refund/create-new` | `reference_id` |
| Notify webhook | (callback URL) | `reference_id` |

Refund endpoint additionally requires `transaction_type: 13` (uint32) — undocumented as required; missing it returns the misleading `errcode:1 "Non-refundable transaction type"`. The wire client at `lib/shopeepay/client.ts` auto-injects this.

Webhook payload payment_method arrives as a **number** (e.g. `16`) but the DB column is TEXT — the handler coerces via `String(...)`. Notify payloads use `reference_id` despite docs claiming `payment_reference_id`; `extractReferenceId()` in `lib/shopeepay/types.ts` accepts either.

### Refund webhook is dormant on ShopeePay's side

As of 2026-05-25, ShopeePay confirmed they do NOT emit refund-status webhooks yet ("currently in development"). The refund flow runs synchronously via `POST /api/payments/shopeepay/refund` — the gateway response is the only signal we get and our route writes the DB from it. The handler in `lib/shopeepay/handleRefundNotify.ts` is wired live but rarely triggered; it'll start firing automatically when ShopeePay ships the callback. Don't delete it.

### Payment webhook idempotency posture

ShopeePay re-sends the payment notify ~5 min after refund (observed 2026-05-26 on CR-20260526-F94F). The handler's idempotency guard at `app/api/webhooks/shopeepay/route.ts` must cover ALL four terminal states (`success`/`failed`/`refunded`/`partially_refunded`) — without `refunded` in that set, the replay re-overwrites refund state back to paid. Fix is in commit `305a1dc`.

Additionally for the `success` terminal state, the guard ALSO verifies the rental's `payment_status='paid'` before short-circuiting. If a prior delivery committed the txn update but failed the rental update mid-handler (transient DB blip → 500 → retry), strict idempotency would silence the retry and orphan the rental at `payment_status='pending'`. The fallthrough lets the retry repair it. Fix in commit `15eec1a`.

### Side-effects must be awaited, not fired-and-forgotten

`void promise()` and `.catch(handler)` patterns DIE on Vercel — the function instance gets torn down the moment the response is sent, killing any in-flight Supabase or self-fetch sockets. Surfaces as `TypeError: fetch failed` in logs ~2-10s after the route returned. All side-effects in this codebase (customer email, staff LINE) are `await` + `try/catch`. Don't reintroduce fire-and-forget. See `feedback_vercel_void_fire_and_forget_dies.md` in personal memory for the full diagnosis.

### Refunds must flip lifecycle status

A FULL refund must update `club_rentals.payment_status='refunded'` AND `status='cancelled'`. The availability query at `/api/clubs/availability` filters on `status IN ('reserved','picked_up')`; a fully-refunded rental with `status='reserved'` silently keeps blocking the slot. Partial refunds leave `status='reserved'` (booking remains active for the remaining balance). Both refund write paths (`/api/payments/shopeepay/refund/route.ts` and the dormant `lib/shopeepay/handleRefundNotify.ts`) follow this rule.

### Callback URL registration

Production callback URL is `https://booking.len.golf/api/webhooks/shopeepay`. Send this to ShopeePay support (contact: pearpearpearpearpear@seamoney.com) so they configure it on the production merchant. No IP whitelisting needed — confirmed 2026-05-26. Same URL serves both payment notifies AND (eventually) refund notifies.

### Customer-side data model

`club_rentals` has two orthogonal status columns; never conflate them:
- `status` — lifecycle: `reserved` → `picked_up` → `returned` → `cancelled`
- `payment_status` — payment lifecycle: `pending` / `paid` / `failed` / `refunded` / `partially_refunded`

Plus `payment_method_chosen` (`online_shopeepay` | `cash_at_pickup`) and `contact_preference` (`line` | `email` | `whatsapp`) as separate columns — these used to be blended into the free-form `notes` column which leaked staff metadata into customer emails. Don't merge them back.

The customer confirmation email subject + heading + "what happens next" copy branches per `paymentStatus` ('paid' / 'pay_at_pickup') so we don't claim "Reservation Confirmed!" to a customer who hasn't paid yet. i18n keys for all 5 locales exist; if you add a state, update `messages/{en,th,ko,ja,zh}.json` together.

Course-rental email LANGUAGE resolves from `club_rental_orders.language` first (the site locale the customer booked in — written at order creation, validated via `isValidLocale`), falling back to `customers.preferred_language` for staff-created/legacy orders (NULL), then 'en'. Never derive the locale from the URL prefix client-side — English is unprefixed under `localePrefix: 'as-needed'`; use `useLocale()`. (PR #60, 2026-07-08 — an English-site booking was getting Thai emails via a stale `preferred_language`.)

### Callback to ShopeePay support

If anything misbehaves at the wire level (404s, wrong field names, missing required fields), email pearpearpearpearpear@seamoney.com with a side-by-side `curl` of a known-working endpoint (e.g. `transaction/check`) vs the failing one. The format that worked was in commit `29542ab` — same host, same auth, same signing setup, only the path differs. That made the diagnosis a ~1-day turnaround instead of a multi-day ticket.

## Google Ads attribution capture (PR #84, merged 2026-07-25)

`lib/attribution/click-ids.ts` captures the Google Ads click ID + UTMs so the
daily offline-conversion upload in `lengolf-ads-etl` has a click to attribute
against. Before this, uploads succeeded but `metrics.all_conversions` was 0 for
both conversion actions — identifier-only uploads (hashed email + phone) only
convert when Google can match them to a stored ad click.

`components/shared/AttributionCapture.tsx` is mounted in `app/[locale]/layout.tsx`.
Both write paths (`/api/bookings/create`, `/api/clubs/order`) re-validate via
`sanitizeAttribution` and persist to `bookings` / `club_rental_orders`.

### Ads land on len.golf, not here — read the cookie, not the URL

~97% of paid clicks land on `len.golf` (~3,000/30d) rather than
`booking.len.golf` (38/30d), so the query string is gone by the time the visitor
reaches the booking flow. **Do not "simplify" this to reading
`location.search`** — it would capture almost nothing.

What makes it work: Google's tag writes its `_gcl_*` cookies on the
**registrable domain** (`.len.golf`), so they're readable across subdomains. No
cross-domain linker work and no `lengolf-website` changes are needed.

| URL param | Cookie | Format |
|---|---|---|
| `gclid` | `_gcl_aw` | `GCL.<unix-seconds>.<value>` (documented) |
| `wbraid` | `_gcl_gb` | `GCL.<unix-seconds>.<value>` |
| `gbraid` | `_gcl_ag` | `2.1.k<value>$i<unix-seconds>` (undocumented) |

**The naming is inverted from what you'd guess — `gbraid` goes to `_gcl_ag`, not
`_gcl_gb`.** When probing what the tag writes, clear ALL `_gcl_*` cookies first
and test one param at a time: a pre-existing cookie produces a false
"no cookie written" result. That mistake made it into the design spec once.

### Compare click TIME, never field identity

The cookie fallback picks the newest candidate by click time. An earlier version
gated on "does this cookie differ from what we stored" and silently destroyed
iOS attribution: a braid record stores `gclid = null`, so any `_gcl_aw` compared
as different — and that cookie lives 90 days, so a stale one from an old search
click overwrote the braid that actually converted, on the very next page load.

Related invariants, each of which has a test:
- `capturedAt` is the **click** time, not the visit. Cookie parsers require a
  parseable timestamp and return null without one; URL click IDs are dated from
  the matching cookie where possible. An undatable click stamped "now"
  resurrects an expired ID, and since a click ID takes precedence over hashed
  identifiers at Google's end, that turns a weak-but-working upload into a
  guaranteed miss.
- Click times are clamped to `now` — a future-dated value makes the 90-day TTL
  unable to ever fire.
- The recency floor only applies when the stored record actually holds a click.
  Capture runs at hydration, before the `afterInteractive` GTM snippet writes
  any cookie, so a first-load UTM-only record carries a *visit* timestamp.
- Only ONE of gclid/gbraid/wbraid is ever stored (precedence gclid → gbraid →
  wbraid), enforced in both `parseUrl` and `sanitizeAttribution`. Google rejects
  a conversion carrying two, and `user_identifiers` cannot be combined with the
  braids at all.

Regression tests must thread one `resolveCapture` result into the next call —
the clobber bug only manifests across page loads and no single-call test catches
it.

### Uploading is a separate repo

`lengolf-ads-etl` owns the upload. When verifying whether conversions actually
attributed, use the GAQL resource
`offline_conversion_upload_conversion_action_summary` — **not**
`metrics.all_conversions`, and **not** the `status='uploaded'` column in
`marketing.google_ads_conversion_uploads`. Neither of the latter is evidence of
attribution; both read healthy while nothing attributes.

Don't change `primary_for_goal` on conversion action 7670649287 — it's
deliberately secondary and flipping it triggers 2–3 weeks of Smart Bidding
relearning.

Design spec: `docs/superpowers/specs/2026-07-25-gclid-capture-design.md`.

## Common Gotchas

### Authentication
- Guest users have limited functionality
- VIP features require authenticated + linked CRM accounts
- LINE integration prepared but not fully deployed

### Performance
- VIP profile data cached (3-minute TTL)
- Availability queries optimized for real-time responses
- Use proper loading states and error boundaries

### Booking Flow
- Multi-step: Date → Bay → Time → Details → Confirmation
- Real-time availability with database-backed bay checking
- Support for both regular and package-based bookings
- Automated review request scheduling (30min post-session)

### LIFF / iOS Compatibility
- iOS Safari and LIFF WebView do NOT support `showPicker()` on hidden date inputs
- Never use `sr-only` + programmatic `showPicker()`/`focus()`/`click()` for native inputs on mobile
- Instead, overlay the native `<input>` with `opacity: 0` over a visual button so iOS gets a real user gesture
- Always set `fontSize: '16px'` on mobile inputs to prevent iOS auto-zoom

### LIFF Language System
- Language preference persisted to `customers.preferred_language` column
- Each booking records `bookings.language` at creation time
- Shared utility `lib/liff/language-persistence.ts` used by all LIFF pages
- Resolution priority: localStorage > DB (cross-device sync) > LINE SDK > 'en'
- `POST /api/liff/language` saves preference with cache invalidation
- Pages with `lineUserId` sync to DB; pages without (contact, bay-rates, coaching) use localStorage only

## Key Files to Understand First
1. `app/layout.tsx` - Root layout and providers
2. `app/api/auth/options.ts` - Authentication configuration  
3. `utils/supabase/server.ts` - Server-side database client
4. `components/vip/DashboardView.tsx` - VIP portal main component
5. `app/(features)/bookings/page.tsx` - Booking flow entry point

## When Making Changes
1. Maintain RLS compliance for all database operations
2. Follow established component patterns in VIP/booking systems
3. Test authentication flows after auth-related changes
4. **ALWAYS run `npm run typecheck` before every commit** - never skip this step
5. Validate API changes against frontend implementations

## Commit Workflow (MANDATORY)
1. Make code changes
2. Run `npm run typecheck` to verify no TypeScript errors
3. Fix any errors before proceeding
4. Only then commit and push

---

## 🔒 Supabase Security — Non-Negotiable Rules

This database was hardened after a security audit. Don't regress it.

### The single most important rule

`utils/supabase/server.ts` exports `createServerClient()` which uses
`SUPABASE_SERVICE_ROLE_KEY` and is marked `import 'server-only'`.
**Never change the env var back to `NEXT_PUBLIC_SUPABASE_ANON_KEY`** — a
dozen+ server API routes depend on bypassing RLS via service_role, and
the anon-level grants those routes used to rely on are now gone.

### Client selection

- **Server code** (`app/api/**`, `lib/`, `utils/`, server components, server
  actions): use `createServerClient()` from `@/utils/supabase/server`.
- **Browser code** (`'use client'`): use `createClient()` from
  `@/utils/supabase/client`. This is the anon-key client. Because this
  project uses real Supabase Auth via `@supabase/ssr` middleware, logged-in
  customers carry a Supabase JWT and `auth.uid()` IS the profile id — so
  RLS policies with `auth.uid() = id` DO fire. (Different from lengolf-forms,
  which uses NextAuth and hits as pure anon.)

### The browser-side table allowlist is not duplicated here

Specific grants drift. See the shared security memory for the current list
of tables the browser client is allowed to touch:
`~/.claude/plans/humming-singing-candy.md`

Adding a new browser-side `.from(...)` call to a table not on that list
means writing a `GRANT` migration + updating the memory. Prefer moving
the call to an API route using `createServerClient()` instead.

### Hard red flags — stop and reconsider

- A file under `app/api/**` importing from `@/utils/supabase/client` (the
  anon browser factory) instead of `@/utils/supabase/server`
- Any inline `createClient(..., process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)`
- A browser component doing `.insert(...)` or `.update(...)` against a
  non-profile table — refactor to an API route using `createServerClient()`
- A migration that does `GRANT ALL ... TO anon` on anything in `public` or
  on any of the admin schemas (accounting, finance, marketing, products,
  simulator, ai_eval) — these are locked

---

## 🌐 Main-site i18n (non-LIFF)

The customer-facing non-LIFF surface (`/bookings`, `/vip`, `/play-and-food`,
`/golf-club-rental`, `/auth/login`) uses `next-intl@^3` with 5 locales:
`en` (default, unprefixed), `th`, `ko`, `ja`, `zh`. LIFF pages still use
the hand-rolled system in `lib/liff/` (phase 2 will unify them).

### Key files
- `i18n/routing.ts` — locale config, `Locale` type, `localeNativeName`,
  `isValidLocale` guard. `localePrefix: 'as-needed'` with `NEXT_LOCALE`
  cookie (1-year).
- `i18n/request.ts` — message loader. Uses `isValidLocale` instead of v4's
  `hasLocale`.
- `i18n/navigation.ts` — typed `Link`, `redirect`, `usePathname`,
  `useRouter` re-exports. **Use these, not `next/navigation`, for
  locale-aware routing.**
- `messages/{en,th,ko,ja,zh}.json` — message catalogs. `en.json` is
  source-of-truth; `types/messages.d.ts` types the shape so missing keys
  in other locales become TS errors.
- `middleware.ts` — composes LIFF redirect → `/auth/error` skip → LINE-UA
  detection → `next-intl` middleware → root `/{locale}` → `/{locale}/bookings`
  rewrite → NextAuth token check. Don't reorder without re-reading.
- `lib/i18n/persist-language.ts` — shared helper that writes
  `customers.preferred_language`. Used by `/api/user/language` (NextAuth
  users) and `/api/liff/language` (LIFF users).
- `components/shared/LanguageSwitcher.tsx` — dropdown. `variant='dark'`
  (default, booking header) or `'light'` (auth login card). Writes the
  cookie + mirrors to DB for logged-in users.

### Translation conventions
- Client: `useTranslations('ns.sub')` + `useFormatter()`. Server:
  `getTranslations('ns.sub')` + `getFormatter()`.
- Top-level namespaces: `common`, `nav`, `auth`, `bookings`, `vip`,
  `playAndFood`, `clubRental`, `errors`, `emails`. `bookings` and `vip`
  use sub-namespaces per page/step (`bookings.dateStep`, `vip.dashboard`,
  etc.). Don't create `misc`/`other` buckets.
- ICU named placeholders (`{name}`, `{date}`) and ICU plural syntax for
  counts (`{hours, plural, =1 {# hour} other {# hours}}`).
- DB seed data (bay names, CRM package names) stays untranslated.
- Emails: `lib/emailService.ts` takes `language: Locale`. Booking-derived
  emails resolve from `bookings.language`; account emails from
  `customers.preferred_language`. Uses `createTranslator` / `createFormatter`.

### Middleware smoke tests
`npm run test:middleware` (requires `npm run dev` running). Covers
cookie-driven root redirect, cookie-driven `/auth/login` redirect,
`/auth/error` stays English, root rewrite, and `/th` → `/th/bookings`.

### Non-negotiable gotchas (real bugs we already hit)

- **`i18n/request.ts` MUST set `timeZone: 'Asia/Bangkok'`.** Omit it and
  next-intl resolves the zone from the *server runtime* — **UTC on Vercel** —
  then auto-forwards that zone to the client provider, so the browser formats
  in UTC too. A calendar pick is a local-midnight `Date`, and Bangkok midnight
  is 17:00 the previous day in UTC, so every `format.dateTime` rendered one day
  early: picking Jul 30 displayed "Wed, Jul 29, 2026" in production for three
  months (2026-04-18 → 2026-07-27, PR #113). **This cannot reproduce on a
  Bangkok dev machine** — server and browser agree locally, so typecheck, lint
  and build all passed while prod was broken. To verify anything date-related,
  run `TZ=UTC npm run dev -- -p 3100` to emulate Vercel. A missing zone also
  fires an `ENVIRONMENT_FALLBACK` IntlError on every render — if you see that,
  it's this. Note standalone `createFormatter({ locale })` (email code) does
  NOT read this config and stays correct only by passing `timeZone` per call.
  Related: never derive `yyyy-mm-dd` from a local `Date` via
  `toISOString().split('T')[0]` — in +07 that returns **yesterday** for any
  time before 07:00. Guarded by `__tests__/i18n-timezone.test.ts`.
- **Root `app/layout.tsx` MUST own `<html>` and `<body>`.** Not a
  passthrough. Next.js App Router tolerates `return children` in dev and
  explodes in production with a hydration cascade: React error #418 →
  `HierarchyRequestError: Only one element on document allowed` →
  `NotFoundError: removeChild`. Symptom is a white screen on Vercel with
  local dev appearing to work. The root layout uses `getLocale()` from
  `next-intl/server` to pick `lang` — this falls back to the default for
  non-`[locale]` routes (LIFF, `/auth/error`), which is what we want.
- **`NextIntlClientProvider` in v3 needs explicit `locale` + `messages`.**
  They do NOT auto-forward from the server context like v4. Every
  `[locale]/layout.tsx` must `await getMessages()` and pass both props.
  Missing this makes every client `useTranslations` throw
  `MISSING_MESSAGE` at hydration time — which cascades into the same
  white-screen symptom as the root-layout bug above.
- **`MISSING_MESSAGE` warnings during build are real bugs, not prerender
  noise.** We dismissed 200 of these as a "known next-intl v3 quirk"
  and shipped the white-screen bug to Vercel twice. If you see the
  warning repeat across pages during SSG, investigate the client
  provider wiring — don't filter it out.
- **Client hydration is not validated by typecheck + lint + build.**
  Those exercise the static-rendering path only. For any UI change
  touching layouts, providers, or i18n, do a real `npm run dev` + page
  load before declaring done. Build-green + prod-broken is the default
  outcome if you skip this.
- **Dev-server staleness with server-only modules.** Changes to
  `lib/emailService.ts` and other `'server-only'` files occasionally
  don't pick up via HMR. If email or API behavior looks wrong and the
  code clearly has the fix, stop dev, `rm -rf .next`, restart.
- **Bare-locale URLs cannot use middleware rewrite — must redirect.**
  Rewriting `/{locale}` → `/{locale}/bookings` via
  `NextResponse.rewrite(url)` silently collapses the locale back to
  `en` downstream — the page renders with `<html lang="en">` and
  English content despite the URL prefix. Visible only in the
  browser (or `curl -s | grep '<html lang'`) — never caught by
  typecheck/lint/build. Shipped to prod once (PR #24, May 2026); fix
  is `NextResponse.redirect(url, 308)` so the browser refetches the
  canonical `/{locale}/bookings`. Keep the rewrite for `/` (default
  locale needs no prefix under `as-needed`). The `LanguageSwitcher`
  amplifies the bug: at `/`, `usePathname()` returns `/` and switching
  produces `/ko`, `/th`, etc. — once trapped, every subsequent switch
  stays on bare URLs. The 308 breaks the trap. See the
  `next-intl-v3` skill for the predicate + test pattern.
- **CJK Han Unification fallback.** See
  `app/globals.css` — we add `html[lang="ja|ko|zh"] body` font stacks
  even though we don't load Noto fonts, as a belt-and-suspenders against
  the kind of bug that hit `lengolf-website` (`fe54c90`). If you ever
  load `next/font/google` Noto variants here, make sure each locale's
  native font is FIRST in its own stack.

### Reuse opportunity for LIFF phase 2

`lib/liff/{translations,booking-translations,membership-translations}.ts`
carries ~1,700 lines of human-reviewed Thai/Japanese/Chinese translations
covering booking + membership flows. When phase 2 migrates LIFF onto
`messages/*.json`, harvest these first (keys with semantic matches) and
only AI-translate the residue. Task 12 on the main-site migration
originally missed this and we paid for it during the translation pass.

### Known follow-ups (not blocking merge)
- **Korean native-speaker review.** `messages/ko.json` was AI-translated
  with no LIFF source to anchor against. Tone (해요체) and particle usage
  should be reviewed by a native speaker before promoting `ko` publicly.
  Thai/Japanese/Chinese were partially seeded from LIFF (human-reviewed)
  + AI for new keys; lower risk but a review pass is still recommended.
- **LIFF unification (phase 2).** LIFF pages still use the hand-rolled
  system in `lib/liff/{translations,booking-translations,membership-translations}.ts`.
  Phase 2 migrates them onto the same `messages/` catalog. The shared
  `persistCustomerLanguage` helper is already in place as the stepping
  stone — `app/api/liff/language/route.ts` already calls it.
- **Admin/LINE notification date formatting.** `app/api/notifications/line/route.ts`,
  `app/api/clubs/reserve/route.ts`, `utils/booking-formatter.ts` still use
  `toLocaleDateString('en-GB', …)` for staff-facing outputs. English-only
  is fine for now — but if any of these strings later land in a
  customer-facing translated email, they need migrating to `createFormatter`.