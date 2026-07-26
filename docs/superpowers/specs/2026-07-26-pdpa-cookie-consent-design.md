# PDPA cookie consent — banner, Consent Mode v2, GTM gating — design

Date: 2026-07-26
Repos: `lengolf-booking-new` (booking.len.golf) + `lengolf-website` (www.len.golf) + GTM container `GTM-MKCHVJKW`
Status: **specced for future implementation — not scheduled.** Owner decision 2026-07-26: keep on the shelf until prioritized. Ship no later than the first newsletter send (see Risk & urgency).

## Problem

Thailand's PDPA requires explicit, informed, **prior** consent before non-essential
cookies/trackers process personal data of people in Thailand. Browse-on/implied
consent is not valid. Both LENGOLF sites currently load every tracker
unconditionally, pre-consent, with no banner and no Consent Mode — verified
2026-07-26 in code, in the GTM container inventory, and live in the dataLayer
(the gclid capture spec §5 documented the same posture on 2026-07-25 and
explicitly deferred the decision to the owner; this spec is that decision).

What fires today on every page with no consent:

| Tracker | ID | Cookies / data |
|---|---|---|
| GA4 | `G-08BZ5M40SG` | `_ga`, `_ga_*`; behavioral analytics + customer ids via `userProfileAvailable` |
| Google Ads + Conversion Linker | `AW-16456389020` | `_gcl_au`, `_gcl_aw`, `_gcl_gb`, `_gcl_ag`; cross-domain across `.len.golf` |
| Meta Pixel (GTM tag #48, all pages, priority 10000) | `480537434714703` | `_fbp`; PageView + funnel events to Meta |
| TikTok (via "FB & TT" custom-HTML tags; `ttq` stub in booking layout) | — | funnel events to TikTok |
| Enhanced Conversions (GTM vars 91/92/93 → `awec`) | — | **customer email + phone** mapped into Google tags |

The Enhanced Conversions email/phone flow is the aggravator: this is not
anonymous analytics, it is identified personal data leaving for third parties
with no recorded consent basis.

## Risk & urgency (assessed 2026-07-26)

- **Obligation: unambiguous.** PDPA consent rules squarely cover this tracker set.
- **Enforcement risk today: low-to-moderate.** All PDPC fines to date (first:
  THB 7M, Jul 2024; eight orders / THB 14.5M, Aug 2025) involved data breaches
  at larger operators, complaint-driven. No known fine purely for a missing
  cookie banner. Thai enforcement is complaint-driven: realistic vectors are a
  disgruntled customer/competitor complaint, or this gap compounding penalties
  if LENGOLF ever suffers an actual incident.
- **Trend: banners are now the norm** on serious Thai sites (banks, retail,
  hotels). Absence is increasingly conspicuous — including to corporate-events
  clients whose procurement checks vendor compliance.
- **Concrete deadline trigger:** ship this BEFORE the first marketing email to
  the rebuilt newsletter list, and before any major paid-ads scale-up. Sending
  marketing while the consent surface is visibly non-compliant is the scenario
  that invites the complaint. "This quarter" tier — not an emergency, not
  indefinitely deferrable.

## Design

### D1. Build in-house; no third-party CMP

A CMP subscription (Cookiebot/CookieYes/…) adds an external script (ironic),
monthly cost, and styling constraints. Our needs are small: 3 categories, 5
locales, 2 sites, 1 GTM container. Build a shared-pattern banner component in
each repo. Trade-off accepted: we own compliance details ourselves
(equal-weight buttons, records, re-consent) — captured in this spec.

### D2. Consent model

- Categories: **necessary** (always on: session/auth cookies, `NEXT_LOCALE`,
  `lengolf_consent` itself), **analytics** (GA4), **advertising** (Google Ads,
  Conversion Linker, Meta, TikTok, Enhanced Conversions).
- Banner buttons: **Accept all** / **Decline all** / **Settings** — equal
  visual weight (no dark patterns; decline must be one click, same prominence).
- Defaults before interaction: everything except necessary **denied**.
- Consent stored in first-party cookie `lengolf_consent` with
  `Domain=.len.golf` so one choice covers both sites (and any future
  subdomain). 12-month expiry, then re-prompt. Payload:
  `{ v: 1, ts: <ISO>, analytics: bool, advertising: bool }`.
  Bump `v` to force re-consent when the tracker set changes materially.
- No per-visitor consent DB logging in v1 — the cookie is the record (creating
  a visitor-identity table just to log cookie consent generates more personal
  data than it protects). Revisit only if counsel asks for stronger records.
- A persistent "Cookie settings" link in both footers reopens the panel
  (withdrawal must be as easy as consent — same rule the preference center
  follows for marketing email).

### D3. Google Consent Mode v2, defaults denied, advanced mode

In both layouts, the FIRST statements inside the existing GTM `<Script>` block
(same block, above the GTM IIFE — same-block ordering guarantees it runs
before GTM loads; no new script strategy needed):

```js
window.dataLayer = window.dataLayer || [];
function gtag(){dataLayer.push(arguments);}
gtag('consent', 'default', {
  ad_storage: 'denied',
  ad_user_data: 'denied',
  ad_personalization: 'denied',
  analytics_storage: 'denied',
  wait_for_update: 500
});
gtag('set', 'ads_data_redaction', true);
gtag('set', 'url_passthrough', true);
// then read lengolf_consent cookie; if present, immediately:
// gtag('consent', 'update', { analytics_storage: ..., ad_storage: ...,
//   ad_user_data: ..., ad_personalization: ... });
```

Banner interaction fires the same `consent update` + pushes a
`consent_updated` dataLayer event.

**Advanced vs basic mode — decision: advanced** (tags load and send cookieless
pings when denied; Google models conversions). Rationale: preserves ~some ads
measurement while keeping cookies/identifiers off pre-consent; cookieless pings
carry no PDPA-personal identifiers. If counsel later prefers the strictest
reading, fallback is basic mode (gate the GTM loader itself on consent) — a
~10-line change, noted here so it's a knob, not a redesign.

### D4. GTM container changes (the gating)

Google-platform tags (GA4 `gaawe`, Ads `awct`, `googtag`, Conversion Linker
`gclidw`) honor Consent Mode natively once defaults exist — no per-tag change
needed for cookie behavior. The custom-HTML pixels do NOT; they need explicit
consent checks:

- Meta tags **#48, 15, 46, 10, 26, 13, 24, 20, 32** and TikTok halves of the
  same tags: set *Additional consent checks → Require `ad_storage` granted*.
- GA4 event tags keep working via consent mode; no change.
- Add a `consent_updated` custom-event trigger if any tag should re-fire
  post-grant (e.g. Meta PageView for the already-loaded page — decide during
  implementation; default: don't re-fire, first navigation covers it).
- Publish sequence per the `gtm-mcp` skill (workspace ids go stale after every
  publish; verify against the live `gtm.js`, not the API response).

### D5. Banner component (per repo, same pattern)

`lengolf-booking-new`:
- `components/shared/CookieConsent.tsx` — client component; bottom sheet on
  mobile, bottom-left card on desktop; LENGOLF green per `lengolf-design`.
- Rendered from `app/[locale]/layout.tsx` (same scope as GTM — LIFF and
  `/auth/error` load neither GTM nor banner; nothing to consent to there).
- Copy via next-intl `common.cookieConsent.*` in all 5 catalogs
  (`messages/{en,th,ko,ja,zh}.json`) — en/th human-reviewed before ship, ko/ja/zh
  AI + review pass like the rest of the catalog.
- Reads/writes `lengolf_consent`, calls `gtag('consent','update',…)`.

`lengolf-website`: same component copied (two repos, no shared package — accept
the duplication; note both file paths in the compliance memory so drift is
findable). Locales en/th.

### D6. Server-side / offline uploads interplay

The `lengolf-ads-etl` offline conversion uploader continues on the
transactional-measurement basis per the gclid spec §5 — out of scope here.
Once the banner ships, a follow-up in that repo should populate
`ClickConversion.consent` (`ad_user_data`, `ad_personalization`) from the
stored consent where a click ID exists; until then it stays unset. One-line
task, noted in `project_gclid_capture_2026_07` memory when this ships.

### D7. Companion deliverable: privacy-policy rewrite

Current policy (www.len.golf/privacy-policy/, Oct 2024) is template-grade: no
PDPA reference, no data-subject rights, no retention, no named trackers, no
opt-out pointer. Rewrite (Thai + English, same page) must add:

1. Controller identity + contact (keep; already present).
2. PDPA lawful bases per purpose (booking fulfillment = contract; marketing =
   consent; measurement = legitimate interest/consent per final counsel read).
3. Named tracker table (mirror the one in this spec) + link to cookie settings.
4. Data-subject rights (access, rectification, deletion, withdrawal,
   complaint to PDPC) + how to exercise (info@len.golf).
5. Retention statement (needs an owner decision — currently indefinite).
6. Marketing opt-out: link the preference center; note LINE/email channels.
7. Cross-border hosting disclosure (Supabase/Vercel infrastructure abroad).

### Verification checklist (clean cookie jar per `_gcl_*` memory — a stale jar
gives false results in BOTH directions)

1. Fresh profile → load booking.len.golf → **no** `_ga*`, `_fbp`, `_gcl_*`
   cookies; only necessary + `NEXT_LOCALE`. Network shows cookieless `collect`
   pings only (advanced mode) and **zero** requests to `facebook.net`/TikTok.
2. Accept all → cookies appear; Meta PageView fires on next navigation; Tag
   Assistant shows all consent signals granted.
3. Decline all → same as (1) persistently; booking funnel still fully usable.
4. Consent on www.len.golf → visible on booking.len.golf without re-prompt
   (`.len.golf` cookie) and vice versa.
5. Settings link reopens panel; withdrawal drops `analytics/advertising` to
   denied and (document: existing `_ga`/`_fbp` cookies are then inert but not
   deleted — banner should best-effort delete them on withdrawal).
6. Regression: `course_rental_step_viewed` / `booking_confirmed` etc. still
   reach GA4 after consent; GA4 realtime + GTM preview.
7. All 5 locales render; TH copy reviewed by a native speaker.

## Effort

~3–4 days total: banner + consent-mode wiring booking repo (1d), website repo
(0.5–1d), GTM consent checks + publish + live verification (0.5d), QA matrix
above (0.5d), privacy-policy rewrite draft for counsel (1d, parallelizable).

## Out of scope

- LIFF pages (no GTM loads there — nothing to gate).
- OCPB direct-marketing registration check (phone call, not code).
- Breach-response plan, retention schedule (separate one-pagers).
- Email pipeline itself (must not ship before this does).

## Open decisions for the owner at implementation time

1. Advanced vs basic Consent Mode (spec default: advanced).
2. Re-consent interval (spec default: 12 months).
3. Retention period statement for the privacy policy (no default — needs a
   real number, e.g. "active customer + N years").
4. Whether counsel wants consent-event logging beyond the cookie (spec
   default: no).
