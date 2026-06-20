# Course rental flow entry — premium landing redesign

**Date:** 2026-06-20
**Surface:** `booking.len.golf/course-rental` (booking app) — the first step of the course-rental booking flow
**File:** `app/[locale]/course-rental/page.tsx` (the `step === 'dates'` block)
**Status:** Design approved (mockups iterated + signed off). Ready for implementation plan.

---

## 1. Problem

Customers arrive at the course-rental flow from the polished len.golf ad/SEO landing page
(`golf-course-club-rental` — full-bleed hero, trust bar, club showcase, pricing, FAQ). When they
click "Book", they hand off to `booking.len.golf/course-rental`, which **opens cold on a bare
date-picker** ("Step 1: Dates & Duration"): no hero, no photography of the clubs, no value
proposition, no trust signals, and inconsistent greens (`green-600`, `#003d1f`, `#1B5E20`,
`#007429`) instead of the brand `#005a32`. The transition feels like dropping onto a different,
lesser website, which undercuts conversion and the premium positioning.

## 2. Goal

Make the flow's entry feel like a **seamless, premium continuation of the len.golf ad page** —
inviting, on-brand, modern — while staying an efficient booking flow. Reuse the proven design
DNA from the len.golf course-rental page rather than inventing new patterns.

Primary optimization (per stakeholder): **premium / modern look**, with **instant confirmation
via credit-card payment** called out as a headline value prop.

## 3. Scope

### In scope
- Redesign the **`dates` step** of `app/[locale]/course-rental/page.tsx` into a premium,
  responsive landing screen:
  - **Desktop (md+):** two-column split — aspirational hero panel (left) + booking card (right).
  - **Mobile:** stacked — hero → overlapping booking card → trust strip → club showcase.
  - These are one responsive screen (the same direction at two breakpoints), not two pages.
- Brand-correctness cleanup on this screen: canonical green tokens, Poppins weights, gold accent
  used sparingly, no emoji, no em dashes (` · ` middot for separators).
- Real hero + club photography via `next/image` (Supabase storage), with photo "slots" reserved
  for future lifestyle shots.
- i18n keys for all new copy across `en/th/ko/ja/zh`.

### Out of scope (deferred / unchanged)
- **Direction B (showcase-first / set-before-dates reorder)** — future phase; needs new
  per-set lifestyle photography and indicative-availability UX.
- The later steps (`set`, `delivery`, `contact`, `review`, `confirmation`) — beyond inheriting
  brand-token cleanup if trivially adjacent; their structure is unchanged.
- Any change to availability logic, the reserve API, payment flow, or `STEP_ORDER`.
- A full marketing rebuild of `/course-rental` (len.golf already owns the marketing page).

## 4. Design specification

### 4.1 Layout
- `STEP_ORDER` unchanged: `['dates', 'set', 'delivery', 'contact', 'review']`. This redesign only
  re-skins/restructures the **`dates`** step. Date-first flow is preserved.
- Desktop split: hero panel ~`1.1fr`, booking card ~`1fr`, inside the existing page container.
- Mobile: hero (full-width) → booking card pulled up to overlap hero bottom (`-mt`) → trust
  strip → club showcase.

### 4.2 Hero panel
- Background: `golf/hero-course-rental.webp` (real photo) under a diagonal green gradient
  `linear-gradient(135deg, rgba(0,55,28,0.88), rgba(0,82,46,0.62), rgba(0,82,46,0.42))`
  (mirrors len.golf hero treatment). Photo served via Supabase image-transform (webp + width).
- Chips: `★★★★★ 5.0 · 579 Google reviews` (count sourced from a shared constant / live source,
  NOT hardcoded) + `Instant confirmation` (lime bolt icon).
- H1 (white, Poppins 800, uppercase): "Premium clubs for any Bangkok course".
  Contrast note: set heading color explicitly (white) — do not rely on inherited color.
- Tagline (italic): "Own the experience, not the gear." (canonical course-rental hook).
- Desktop only: value-prop checklist — tour-grade sets · pay by card confirmed instantly ·
  delivered to your hotel ฿500 · multi-day packages save up to 50% — plus a small "Featured:
  Callaway Paradym" mini-card with real thumbnail.

### 4.3 Booking card (the actual date picker, restyled)
- Elevated white card containing the existing inputs: Start date, End date, Pickup time,
  Return time (unchanged fields, validation, and `goNext` behaviour).
- Primary CTA: "Check availability" (= existing `goNext` → `set` step). Disabled until all four
  fields set, exactly as today.
- Under-CTA: `Free pickup · Delivery ฿500 · Slot held 30 min`.
- **Instant-card-payment strip** (highlighted): "Pay by card, confirmed instantly · Visa ·
  Mastercard · JCB · secure 3-D Secure checkout."
  - Accuracy gate: this claim is true for **card** payment only. Cash-at-pickup stays
    "reservation received." The strip is gated on the Opn card gateway being live
    (PR #33 / `feat/opn-payments-v2`); until cutover, either hide it or word it for the current
    gateway. Implementation plan must make this conditional, not hardcoded-on.

### 4.4 Trust strip (mobile)
- `From ฿1,200/day` · `Hotel delivery` · `Save up to 50%` on a `#F6FFFA` mint band.

### 4.5 Club showcase (orientation, not selection)
- Replaces the current tiny `PREVIEW_SETS` thumbnail strip with three real photographic cards:
  Paradym (Premium+, featured, gold `#c8a96e` accent border), Warbird (Premium), Majesty
  Shuttle (Premium · Ladies'). Each shows real image + name + tier badge + "from ฿X/day".
- Remains **orientation only** on the `dates` step — real availability-filtered selection still
  happens on the `set` step. (Keeps flow logic unchanged; avoids Direction-B complexity.)

### 4.6 Brand tokens (replace ad-hoc values on this screen)
- Primary `#005a32`, alt/CTA `#007429` (hover `#045923`), lime accent `#7CB342`, gold accent
  `#c8a96e`, mint surface `#F6FFFA`. Poppins family. Uppercase for brand wordmark/CTA/H1 only.
- No emoji anywhere; no em dashes in copy.

## 5. Code structure

The page file is large (~1280 lines). To keep this change clean and reviewable, extract the
redesigned `dates`-step UI into small presentational components under
`app/[locale]/course-rental/components/` (new folder):
- `HeroPanel.tsx` — hero (shared by desktop/mobile via responsive classes).
- `BookingDateCard.tsx` — the four inputs + CTA + payment strip (props: current state + setters
  + `onContinue`/`canContinue`).
- `SetShowcase.tsx` — the three orientation cards (reads available/preview sets).
Parent `page.tsx` wires existing state into these; no state-management change. This is a targeted
improvement justified by the file size, not a broad refactor.

## 6. i18n

- Add/adjust keys under `courseRental` in `messages/en.json` (source of truth) and mirror to
  `th/ko/ja/zh`. New copy: hero headline, tagline, the two hero chips, desktop value props,
  instant-card-payment strip, trust-strip chips, showcase card labels.
- `types/messages.d.ts` enforces shape — missing keys in other locales = TS error.
- Thai: prefer human-reviewed wording (harvest from len.golf `CourseClubRental` messages where
  semantically equivalent). Korean is AI-translated — flag for native review (known follow-up).
- next-intl v3 gotcha: every new key MUST exist in all 5 locales or hydration throws
  `MISSING_MESSAGE` → white screen. Verify with a real dev-server page load, not just build.

## 7. Non-functional requirements

- **Performance / LCP:** booking.len.golf has a tracked mobile-perf issue. Hero image uses
  `priority` + responsive `sizes`, served via Supabase transform (webp, sized). Showcase images
  lazy-load. Don't ship the raw 2.5 MB Paradym PNG.
- **Accessibility:** real `<h1>`, `alt` text on all images, verified white-on-dark-green
  contrast, `fontSize: 16px` on mobile inputs (iOS no-zoom). Keep the existing iOS-safe native
  date/time input pattern (no `showPicker()` on hidden inputs — per project CLAUDE.md).
- **Responsive:** mobile-first; single screen that splits at `md`.

## 8. Testing / verification

- `npm run typecheck`, `npm run lint`, `npm run build` (build catches Server/Client + i18n).
- **Real `npm run dev` + page load** at mobile and desktop widths — hydration is NOT covered by
  build (project has been burned by this twice). Watch for `MISSING_MESSAGE` warnings.
- Render all 5 locales; confirm no missing keys and Thai/CJK copy fits.
- Confirm the booking flow still advances correctly: dates → `set` → … → confirmation, with no
  change to availability/reserve/payment behaviour.

## 9. Risks

| Risk | Mitigation |
|---|---|
| Missing i18n key in a non-en locale → white screen (next-intl v3) | Add keys to all 5 locales together; dev-server smoke test per locale |
| Instant-confirmation copy inaccurate before Opn cutover | Gate the payment strip on card-gateway availability; don't hardcode-on |
| Hardcoded review count goes stale | Source `5.0 / 579` from a shared constant or live `getGoogleReviews()` source |
| Heavy hero/club images hurt mobile LCP | Supabase image-transform (webp + width), `priority` hero, lazy showcase |
| Generic-green regressions creep back | Use brand tokens; review diff for `green-600`/ad-hoc hexes on this screen |

## 10. Open questions (non-blocking)

- Photography: ship now with the existing single hero + product shots; slot in lifestyle photos
  (July shoot / `website-assets/briefs/2026-07/`) when available. (Decision: ship now.)
- Whether to also retire the standalone `golf-club-rental` indoor page's stylistic drift in a
  later pass (out of scope here).
