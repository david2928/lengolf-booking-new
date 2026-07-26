# Google Ads click-ID (gclid/gbraid/wbraid) capture — design

Date: 2026-07-25
Repo: `lengolf-booking-new`
Status: approved, ready for implementation

## Problem

`lengolf-ads-etl` uploads offline conversions to Google Ads daily. As of
2026-07-25 the uploads are *healthy* — the GAQL resource
`offline_conversion_upload_conversion_action_summary` reports EXCELLENT /
100% success / no alerts for both:

| Conversion action | ID | Fed by |
|---|---|---|
| Offline Booking - Enhanced | 7522058856 | `public.bookings` |
| Offline Rental - Enhanced | 7670649287 | `public.club_rental_orders` |

But `metrics.all_conversions` is **0** for both. The uploader
(`buildUserIdentifiers` in `src/extractors/google/conversion-upload.ts`)
sends *only* hashed user identifiers — SHA-256 email and E.164 phone.
Identifier-only uploads attribute only when Google can match them back to a
stored ad click. The booking flow never captured a click ID, so there is no
click to match, and nothing attributes.

This spec covers capturing and persisting the click IDs. Extending the
uploader is a separate task in `lengolf-ads-etl`.

## Verified starting state

- `public.bookings` **already has** `gclid`, `utm_source`, `utm_medium`,
  `utm_campaign`, `gclid_conversion_uploaded` from an earlier, abandoned
  effort. All NULL across all 11,113 rows — nothing ever wrote to them.
- No `gbraid` / `wbraid` columns anywhere.
- `public.club_rental_orders` has **no** attribution columns at all, only a
  coarse `source` text (`website` / `staff` / `booking_app` / `line`).
- Zero occurrences of `gclid|gbraid|wbraid|utm_|clickId` in the app code.
- `public.google_ads_offline_conversions` is a two-branch `UNION ALL` over
  `bookings` and `club_rental_orders`. It applies **no** marketing-consent
  filter — it gates on booking status, non-null email/phone, a test-email
  denylist, `is_test`, and a 90-day window.

## The cross-domain problem, and why it is already solved

Almost all paid clicks land on **len.golf** (the marketing site), not on
booking.len.golf. Last 30 days:

| Landing page | Clicks |
|---|---|
| `len.golf` / `www.len.golf/` + `/lessons`, `/golf-courses/…`, blog | ~3,000 |
| `booking.len.golf/golf-club-rental` | 38 |

The user lands on len.golf with `?gclid=…`, then clicks through to
booking.len.golf where the query string is gone. Reading `location.search`
in this app alone would capture roughly nothing.

**Verified empirically in a browser on 2026-07-25:** landing on
`https://www.len.golf/?gclid=TeSt_ClAuDe_123` causes the Google tag to write

```
_gcl_aw=GCL.1784978748.TeSt_ClAuDe_123
```

and that cookie is **readable verbatim on `booking.len.golf`**. The Google
tag writes `_gcl_*` cookies on the registrable domain (`.len.golf`), so they
are shared across subdomains in both directions. The booking app's GTM
config already declares `linker: { domains: ['len.golf'] }`
([app/[locale]/layout.tsx:153](../../../app/[locale]/layout.tsx)).

Consequence: **no changes to `lengolf-website`, no linker work, and no URL
decoration are needed for gclid.** Reading the cookie is sufficient.

The braids get cookies too, verified the same way against a clean cookie jar:

| URL param | Cookie written | Format |
|---|---|---|
| `?gclid=X` | `_gcl_aw` | `GCL.<unix-seconds>.X` (documented) |
| `?wbraid=X` | `_gcl_gb` | `GCL.<unix-seconds>.X` (same shape) |
| `?gbraid=X` | `_gcl_ag` | `2.1.k X $i<unix-seconds>` (undocumented) |

Note the counter-intuitive naming: **gbraid goes to `_gcl_ag`, and wbraid
goes to `_gcl_gb`.** An initial test suggested wbraid had no cookie at all;
that was an artifact of a pre-existing `_gcl_aw` in the jar. Re-tested with
all `_gcl_*` cookies cleared, `?wbraid=CLEAN_WB_ONLY` reliably produced
`_gcl_gb=GCL.1784981831.CLEAN_WB_ONLY`.

All three therefore survive the len.golf → booking.len.golf hop. The
`_gcl_ag` shape is undocumented, so that parser is best-effort and returns
null rather than guessing if Google changes it.

## Google API constraints (research, 2026-07-25)

These govern the ETL follow-up, and they dictate what we must store
*separately* rather than collapsing into one column.

- **Exactly one** of `gclid` / `gbraid` / `wbraid` may be set per
  `ClickConversion`. Combining any two is an error. (The upload-clicks guide
  contains a contradictory "we recommend setting both the GCLID and GBRAID"
  line; the error documentation and the API support answers both say
  one-only. Treat one-only as authoritative.)
- `gclid` + `user_identifiers` together **is** permitted, and **`gclid`
  takes precedence** — the hashed identifiers are ignored. Adding gclid is
  therefore a strict upgrade to the current upload, not a regression risk.
- `user_identifiers` **cannot** be combined with `gbraid`/`wbraid` —
  enhanced conversions for leads is incompatible with them. Braid-keyed rows
  must be uploaded *without* hashed email/phone.
- Conversion actions with **one-per-click** counting reject gbraid/wbraid.
  Both of ours are `counting_type = 3` (MANY_PER_CLICK), so braids are safe.
  Both also carry a 90-day click-through lookback window.
- gclid lifetime is 90 days; conversions from clicks older than that are
  never attributed. Clicks younger than 6 hours return "click too recent".
- `ClickConversion.consent` (`ad_user_data`, `ad_personalization`) is
  "highly recommended"; leaving it unset risks non-attribution.

Click-ID semantics: `gclid` on non-iOS; `gbraid` when the click originates
inside an iOS app (Google app, YouTube); `wbraid` for iOS browser → web.
The `LENGOLF PPC - v1` campaign is Performance Max, which serves heavily
into iOS in-app inventory, so braids are not negligible here.

## Design

### 1. Capture utility — `lib/attribution/click-ids.ts`

Resolution order:

1. URL query params (`gclid`, `gbraid`, `wbraid`, `utm_*`) — authoritative
   when present
2. Otherwise the `_gcl_aw` / `_gcl_gb` / `_gcl_ag` cookies

Captured values are written to `localStorage` under `lengolf.attribution`
with a `capturedAt` timestamp. Reads discard entries older than **90 days**,
matching Google's gclid window — a click ID we could no longer upload
successfully is worse than no click ID, because `gclid` takes precedence over
`user_identifiers` at Google's end, so a dead ID converts a weak-but-working
upload into a guaranteed miss.

**Newest click wins.** The cookie branches are compared by *click time*, not
by "does this differ from what we stored". `_gcl_aw` lives 90 days, so a
visitor who searched once and later clicked an iOS ad still carries the old
cookie; an identity comparison sees `stored.gclid === null` on a braid
record, treats the stale cookie as new, and overwrites the braid that
actually converted — destroying exactly the identifiers this feature exists
to capture. Each cookie parser therefore requires a parseable click
timestamp and returns null without one; an undatable cookie would have to be
stamped "now", which is how an expired ID gets resurrected as fresh.

`capturedAt` reflects the **click**, not the visit. Re-landing on the same
click URL (refresh, back button, a shared link) keeps the original age.

Only one of the three identifiers is ever stored. Google permits exactly one
per uploaded conversion, so both `parseUrl` and `sanitizeAttribution`
collapse to a single ID with precedence gclid → gbraid → wbraid. Enforcing
it at the boundary that owns the DB row means the uploader — in a different
repo, likely written later by someone else — can trust the data.

### 2. Capture trigger

A small `'use client'` component mounted inside `NextIntlClientProvider` in
[app/[locale]/layout.tsx](../../../app/[locale]/layout.tsx), alongside
`ChatWidgetLoader`. It runs capture on every page load, so entry point does
not matter.

This placement is what makes the values survive:
- the multi-step booking wizard,
- the language-switch remount (which resets every `useState`),
- and the NextAuth OAuth round-trip, which today drops anything not in the
  explicit `callbackUrl` built at
  [useBookingFlow.ts:121](../../../app/[locale]/(features)/bookings/hooks/useBookingFlow.ts).

LIFF pages are deliberately excluded — they live outside `[locale]`, run
inside the LINE in-app browser, and receive no ad traffic.

### 3. Transport and server-side validation

Both submit paths read the store and add the fields to their POST body:

| Client | API | Table |
|---|---|---|
| `BookingDetails.tsx` | `/api/bookings/create` | `bookings` |
| `course-rental/page.tsx` | `/api/clubs/order` | `club_rental_orders` |

Each route sanitises before persisting: length cap (512) and a
`[A-Za-z0-9_.\-]` charset allowlist; anything failing either check becomes
`null`. This mirrors the existing posture for client-supplied add-ons at
[app/api/bookings/create/route.ts:300](../../../app/api/bookings/create/route.ts),
where server-side re-resolution prevents a forged payload reaching staff
notifications. Click IDs never reach a notification, but they do reach an
outbound Google API call, so the same "never trust the client blindly" rule
applies.

Capture failures are non-fatal everywhere. A booking must never fail
because attribution was unavailable.

### 4. Migrations

- `bookings`: add `gbraid`, `wbraid` (text, nullable). The other five
  columns already exist.
- `club_rental_orders`: add `gclid`, `gbraid`, `wbraid`, `utm_source`,
  `utm_medium`, `utm_campaign`, `gclid_conversion_uploaded` — mirroring
  `bookings` so the ETL view's two `UNION ALL` branches stay symmetric.

Migration files land in `supabase/migrations/` and are applied to project
`bisimqmtxjsptehhqpeg`.

### 5. Consent / PDPA posture — deliberately unchanged

No new consent gate. The live posture already uploads hashed email and
phone for every non-cancelled booking with no `marketing_opt_in` check, on a
transactional-measurement basis distinct from the marketing consent governed
by the preference center. Click IDs are pseudonymous ad identifiers that
Google's own tag already writes on our domains under the existing cookie
posture (verified: no consent banner and no consent-mode signals in the
dataLayer on either domain).

Adding a consent gate here would be a *new, stricter* posture than what is
live — a deliberate policy decision for the owner, not something to
introduce as a side effect of this change. Documented, not changed.

## Out of scope

The `lengolf-ads-etl` follow-up. It needs to:

1. Expose `gclid`, `gbraid`, `wbraid` on
   `public.google_ads_offline_conversions` (both `UNION ALL` branches).
2. Select **exactly one** click identifier per `ClickConversion`, preferring
   `gclid` → `gbraid` → `wbraid`.
3. **Drop `user_identifiers` entirely on braid-keyed rows** — the
   combination is rejected.
4. Populate `ClickConversion.consent`.
5. Keep sending identifier-only conversions for rows with no click ID; that
   path is unchanged.
6. **Not** touch `primary_for_goal` on 7670649287. It is deliberately
   secondary; flipping it triggers 2–3 weeks of Smart Bidding relearning and
   is the owner's decision.

When verifying, use the GAQL resource
`offline_conversion_upload_conversion_action_summary`. Neither
`metrics.all_conversions` nor the `status='uploaded'` column in
`marketing.google_ads_conversion_uploads` is evidence that a conversion
actually attributed.

## Follow-ups (not blocking)

- **UTMs from len.golf landings** are lost. The account-level
  tracking template appends them, but they do not cross the subdomain
  boundary. `utm_*` will populate only for direct-to-booking landings. Not
  an attribution problem — gclid is the attribution key — only an internal
  reporting nicety.
- **No backfill is possible.** Existing bookings have no click ID and
  Google's window is 90 days. Fix-forward only.

## Testing

- Unit tests for cookie parsing (`_gcl_aw`, `_gcl_gb`, `_gcl_ag`), TTL
  expiry, newest-click-wins across *multiple page loads* (a single
  `resolveCapture` call cannot reproduce the stale-cookie clobber), and the
  server-side charset/length validation.
- `npm run typecheck`, `npm run lint`, `npm run build`.
- A real `npm run dev` + browser page load: verify capture from a URL param,
  and verify capture from a pre-set `_gcl_aw` cookie with no URL param.
  Build-green does not validate client hydration.
