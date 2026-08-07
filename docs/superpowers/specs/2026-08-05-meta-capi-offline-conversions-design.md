# Nightly Meta Conversions API upload for bookings

**Date:** 2026-08-05
**Status:** approved, not yet implemented
**Related:** `docs/superpowers/specs/2026-07-25-gclid-capture-design.md` (the Google Ads
equivalent), `lengolf-ads-etl/src/extractors/google/conversion-upload.ts` (the precedent).

## Problem

Meta cannot see 86% of bookings. Measured 2026-08-04 over Jul 4 – Aug 2, excluding
`customer_notes ILIKE '%TEST BOOKING%'`: of 804 bookings, 116 come through the web flow
and are visible to the browser pixel, 217 are LIFF (`app/liff/*` loads no GTM, because GTM
is injected only in `app/[locale]/layout.tsx`), and 471 are staff-created — walk-in, phone
or LINE chat, identified by having no `Booking creation` row in
`public.booking_process_logs`.

Those counts include cancelled bookings. The identifier-quality figures further down
exclude them (411 staff-created rather than 471), because cancelled bookings are never
uploaded.

The consequence is that paid social looks like it converts at zero. The account spent
฿26,303 in the 30 days to 2026-08-03 with no conversion signal reaching it at all.

This spec covers a scheduled job that uploads bookings to Meta's Conversions API so
Facebook can attribute them to ad clicks via hashed identifiers.

## What the investigation changed

Four findings from the pre-design investigation materially altered the brief. They are
recorded here because each one is a trap that a future reader would otherwise re-enter.

### 1. The pixel on the site is not ours

`480537434714703` is the only Meta pixel in the published container `GTM-MKCHVJKW`
(verified by fetching `gtm.js` directly, not by trusting a doc). It is **not reachable
from the LENGOLF Meta estate**:

| Check | Result |
| --- | --- |
| Businesses visible to the ads-ETL token | `Lengolf` (334346549230611) only |
| `Lengolf` `owned_pixels` | 985627110141024, 1008057267532486, 1326508338698235, 1616521625632431 |
| `Lengolf` `client_pixels` | none |
| Pixels on `act_725466328005161` | the same four |
| `GET /480537434714703` | `(#100) Missing perms` |

The custom audiences referencing it are named `MTZ - website 90 days` and
`MTZ - Bay rates`, which points at Marketyze. The working conclusion is that the site
fires an agency-owned pixel.

All four LENGOLF-owned pixels are cold — zero events in the trailing 7 days, most recent
fire on any of them 2026-03-14.

**Decision: consolidate on `1326508338698235` (LENGOLF v2).** It is owned by the Lengolf
business and already attached to the ad account, so conversions sent to it can be
attributed and, later, optimised against.

### 2. There is no server-side CAPI to share helpers with

The brief assumed `/api/bookings/create` already sends CAPI events and that this job
should reuse its hashing and transport. It does not. The route imports
`sanitizeAttribution` and persists `gclid`/`gbraid`/`wbraid` + UTMs onto the booking row,
and it correctly defers side effects under `after()`, but it sends nothing to Meta. The
Google-side hashing lives in `lengolf-ads-etl`, a separate repo and separate deployable,
so it is not importable either. **The helpers in this spec are new.**

### 3. Browser-side dedup is a no-op today

Dedup requires matching `event_name` + `event_id` on both sides. The container fires
`PageView`, `CompleteRegistration`, and custom micro-events (`BookNowButton`, `BayRate`,
`LineButton`, `EventSubmit`, …). It fires **no `Purchase`**, and passes **no `eventID`** to
any `fbq` call.

So the server becomes the sole source of the `Purchase` conversion, and there is nobody on
the other side of the dedup. We still derive a stable `event_id` from the booking id,
because the real duplicate risk is ours: a retried cron tick, two overlapping ticks, or a
send that succeeds and then fails to record. That risk is live from day one.

### 4. Identifier quality is the dominant design constraint

Measured over the fixed window `created_at` in `[2026-07-04, 2026-08-03)` Bangkok,
non-cancelled, `customer_notes NOT ILIKE '%TEST BOOKING%'`. The window is pinned rather
than relative so these figures stay reproducible:

| Channel | Bookings | Distinct booking emails | `@len.golf` placeholder rows | Distinct phones | Real email recoverable via `customers` |
| --- | --- | --- | --- | --- | --- |
| staff-created | 411 | **20** | **383** | 213 | 139 |
| web/LIFF | 241 | 106 | 0 | 105 | 162 |

383 of the 411 staff bookings carry **one shared `@len.golf` placeholder address**.
Hashing and sending it would tell Meta that a single person booked 383 times, and if that
mailbox belongs to a real Meta user, every staff booking misattributes onto them. It must
never be sent.

`public.customers.email` is clean — zero placeholders — and recovers a real address for
139 of those 411 bookings. So identity resolves from the customer record first.

Note the phone column is the *stronger* identifier on exactly the channel where email
fails: 213 distinct phones across 411 staff bookings, against 20 distinct emails.

Phone shapes are genuinely mixed. Observed prefixes include Thai `0xx` (10 digits),
`66xx` (11), bare 9-digit Thai missing the leading zero, and real international numbers
(`+65`, `+49`, `+44`, `+62`, `+88`). A blanket `+66` prefix corrupts the internationals.

`public.customers.normalized_phone` is **not** E.164 — max length 9, no `+`, no country
code. It is a last-9-digits internal dedup key and is unsuitable as a Meta identifier.

## Prerequisites

Both are manual and only the account owner can do them. The code fails soft without them,
so merge order is safe, but nothing reaches Meta until both are done.

1. **System User token.** Business Settings → System Users → create → assign dataset
   `1326508338698235` and ad account `act_725466328005161` as assets → generate token with
   `ads_management`. System User tokens do not expire and are not tied to a personal
   login. (The existing ads-ETL token in `marketing.platform_tokens` is a *user* token
   whose data-access window lapses 2026-09-24, and it cannot see the dataset anyway.)
   Set `META_CAPI_ACCESS_TOKEN` across **Production + Preview + Development** before merge.
2. **Repoint GTM tag #48** `fbq('init', …)` from `480537434714703` to `1326508338698235`.
   Until this happens the dataset receives only our server events and web traffic keeps
   feeding the agency's pixel.

Env vars, all read lazily:

| Var | Purpose |
| --- | --- |
| `META_CAPI_ACCESS_TOKEN` | System User token, `ads_management` |
| `META_CAPI_DATASET_ID` | `1326508338698235` |
| `META_CAPI_TEST_EVENT_CODE` | optional; routes a run to Events Manager Test Events |

`CRON_API_KEY` already exists and is reused.

## Architecture

```
pg_cron (nightly, ~03:00 Asia/Bangkok)
  └─ net.http_get + Bearer CRON_API_KEY (from Vault)
       └─ GET /api/cron/meta-capi-upload
            ├─ candidates: bookings ⋈ customers, LEFT ANTI JOIN marketing.meta_capi_uploads
            ├─ lib/meta/identity.ts   → resolve + normalise + hash
            ├─ lib/meta/capi.ts       → POST /v22.0/{dataset}/events
            └─ record outcome in marketing.meta_capi_uploads
```

### `lib/meta/config.ts`

`getMetaCapiConfig(): MetaCapiConfig | null`. Reads `process.env` **inside the function**
and returns `null` when the token or dataset id is absent or blank.

**It must never throw at module load.** This repo has been burned twice — the
`MARKETING_PREFS_SECRET` assertion and the `SHOPEEPAY_*` assertion both failed the Next.js
build during `Collecting page data` and blocked every deploy until env vars landed in all
three Vercel environments. See CLAUDE.md. Callers log once and skip.

### `lib/meta/identity.ts`

Pure, no I/O, fully unit-testable.

- `normalizeEmail(raw)` — trim, lowercase. Returns `null` for blank or for any address
  matching the placeholder denylist (`@len.golf`).
- `normalizePhoneE164(raw)` — `parsePhoneNumberFromString(raw, 'TH')` via
  `libphonenumber-js`, return `.number` when `.isValid()`, else `null`. The `'TH'` default
  region resolves bare local formats while leaving explicit international numbers intact.
- `normalizeName(raw)` — split into first/last, trim, lowercase, strip punctuation.
- `hashIdentifier(normalized)` — `sha256(normalized).digest('hex')`.
- `buildUserData({ bookingEmail, customerEmail, phone, name })` → `{ em?, ph?, fn?, ln?,
  country? }` with every value hashed, plus a non-PII `matchKeys: string[]` (`['em','ph']`)
  for diagnostics. Returns `null` when neither `em` nor `ph` survives.

Email precedence is `customers.email` → `bookings.email`, each passed through the denylist.

`libphonenumber-js@1.12.8` is already in the tree as a transitive dependency of
`react-phone-number-input`. Promote it to a direct dependency in `package.json` — no
install-size change, it just declares the contract we now depend on.

### `lib/meta/capi.ts`

- `buildPurchaseEvent(booking)` → a Meta server event.
- `sendEvents(config, events, opts)` → `POST https://graph.facebook.com/v22.0/{dataset}/events`
  with `{ data, access_token, test_event_code? }`. Chunks at 1000 events per request.
  Returns `{ eventsReceived, fbTraceId, error? }`.

Event shape:

| Field | Value |
| --- | --- |
| `event_name` | `Purchase` |
| `event_id` | `booking-<bookings.id>` |
| `event_time` | `created_at` as unix seconds |
| `action_source` | `physical_store` for staff-created, `website` for web/LIFF (see below) |
| `custom_data.value` | `1200` |
| `custom_data.currency` | `THB` |
| `user_data` | hashed identifiers from `buildUserData` |

`event_time` is `created_at` — the moment the conversion happened. It is **not**
`date`/`start_time`, which is the play date and is usually in the future; Meta rejects
future events.

**Channel detection.** "staff-created" means *no* `Booking creation` row in
`public.booking_process_logs` for that booking id — the same predicate used throughout
this spec's measurements. Web and LIFF bookings both write that row, and nothing in
`bookings` distinguishes them from each other, so they share `action_source: 'website'`.
That is correct for both: LIFF is a webview. The candidate query computes this once with a
`LEFT JOIN LATERAL … LIMIT 1` (or an `EXISTS` subselect) rather than issuing a second
round trip per booking.

Per-booking value is 1200 THB, per the notes on GTM tag 62 in `GTM-MKCHVJKW`. Do not use
1813 — that was the per-*customer* figure and overstates a booking by ~46%.

### `marketing.meta_capi_uploads`

```sql
create table marketing.meta_capi_uploads (
  booking_id     text primary key references public.bookings(id),
  event_id       text not null,
  event_name     text not null default 'Purchase',
  event_time     timestamptz not null,
  value          numeric not null,
  currency       text not null default 'THB',
  action_source  text not null,
  match_keys     text[],          -- WHICH identifier kinds were sent, never values
  status         text not null,   -- pending | uploaded | failed | skipped
  events_received int,
  fbtrace_id     text,
  error_message  text,
  retry_count    int not null default 0,
  uploaded_at    timestamptz,
  created_at     timestamptz not null default now()
);
create index on marketing.meta_capi_uploads (status, created_at);
```

A side table rather than a boolean on `bookings` (the brief allowed either). It carries
retry counts, error text and match-quality diagnostics without widening the hot `bookings`
table, and it mirrors `marketing.google_ads_conversion_uploads`. `bookings.gclid_conversion_uploaded`
exists but is vestigial — the Google uploader tracks state in its own side table too.

`match_keys` records identifier *kinds* (`{em,ph}`), never values. No raw PII is stored.

### `app/api/cron/meta-capi-upload/route.ts`

- `export const dynamic = 'force-dynamic'`, `export const maxDuration = 60`.
- Bearer `CRON_API_KEY` with the same length-check + constant-time compare as
  `app/api/cron/club-rental-expired-notify/route.ts`. Missing/short key → 503, bad token
  → 401.
- Config absent → log once, return 200 `{ skipped: 'not configured' }`. Never throw.
- Candidates: `status <> 'cancelled'`, `customer_notes NOT ILIKE '%TEST BOOKING%'`,
  `created_at >= now() - interval '7 days'`, no row in `marketing.meta_capi_uploads`
  (or `status='failed' AND retry_count < 3`), oldest first, `LIMIT 200`.
- **Re-filter on the 7-day cutoff after building the batch.** Meta returns an error for
  the *entire request* if any `event_time` exceeds 7 days, so one stale row poisons every
  other event in the batch.
- Bookings whose identifiers all fail resolution are recorded `skipped` — they are not
  retried forever.
- Stage `pending` → POST → record `uploaded`/`failed`. Staging failure aborts before
  sending; sending untracked events is how duplicates are created.
- All work is awaited. A cron response reports its own outcome, so there is nothing to
  defer. (Had there been, it would go under `after()` from `next/server` — never a bare
  floating promise. See CLAUDE.md.)
- Returns `{ scanned, sent, skipped, failed }`.

### Scheduling

pg_cron nightly at 20:00 UTC (03:00 Asia/Bangkok), `net.http_get` with the Bearer token
from Vault — the same pattern as `club-rental-expired-notify-1min`. Nightly against a
7-day window leaves six days of slack to recover from an outage.

## Privacy

- SHA-256 over the normalised value; raw PII never leaves the process.
- Identifier values are never logged. Logs carry counts and `match_keys` kinds only.
- The tracking table stores no raw PII.
- Server-only: the route uses `createServerClient()` and the token is a non-`NEXT_PUBLIC_`
  env var, so it cannot reach the browser bundle.

## Testing

Unit:

- Known-vector SHA-256 (`test@example.com` → its documented digest).
- Phone table covering every shape observed in production: `0812345678`, `66812345678`,
  `812345678`, `+6591234567`, `+4917612345678`, blank, garbage.
- Placeholder denylist: `@len.golf` rejected from both the booking and customer field.
- Email precedence: customer record wins over booking row.
- `event_id` stability: same booking id → same event id across calls.
- 7-day cutoff excludes an 8-day-old booking.
- `getMetaCapiConfig()` returns `null` rather than throwing when env is absent.

Integration:

- `?dryRun=1` builds the payload and returns counts + `match_keys` without POSTing.
- `META_CAPI_TEST_EVENT_CODE` routes a real run into Events Manager → Test Events for
  live verification without polluting the dataset.

## Out of scope, logged as follow-ups

- **Capture `_fbp` / `_fbc`.** The direct analogue of `lib/attribution/click-ids.ts` for
  Meta. A `_fbc` ties a conversion to a specific ad click instead of relying on a hashed
  phone matching; it is the single largest match-quality lever available and would want
  the same clean-jar testing discipline the `_gcl_*` work needed.
- **Real-time CAPI in `/api/bookings/create`** under `after()`, importing these same
  helpers. Cuts latency from up to 24h to seconds.
- **`lengolf-ads-etl` phone normalisation.** `conversion-upload.ts:445` has Thai-only
  logic with the same international-number defect, so a slice of the *Google* offline
  conversions is likely being dropped or mangled too.
- **Campaign objectives.** No ad set currently optimises toward a pixel — every
  `promoted_object` is a `page_id` or absent, because all five live campaigns are
  `OUTCOME_TRAFFIC`/`OUTCOME_ENGAGEMENT`. Conversion data will improve reporting
  immediately but cannot influence delivery until objectives change.

## Explicitly not doing

- **No backfill.** Meta's `event_time` limit is 7 days; the Jul 4 – Aug 2 history is
  outside it. Conversion history begins the day this is switched on. The 62-day figure
  that appears in older Meta docs belongs to the legacy Offline Conversions API, which is
  the deprecated path.
- **No module-load env assertion.** Non-negotiable — see the two prior incidents in
  CLAUDE.md.
