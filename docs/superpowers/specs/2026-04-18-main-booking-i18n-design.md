# Main Booking Site i18n — Design Spec

**Date:** 2026-04-18
**Project:** lengolf-booking-new
**Scope:** Add localization to the non-LIFF customer-facing surface of `booking.len.golf` using `next-intl`, matching the grammar already used by the marketing site `len.golf`.

## Context

LENGOLF runs three frontend apps that share one Supabase project:

| App | URL | i18n state (today) |
|---|---|---|
| lengolf-website (marketing) | len.golf | `next-intl` v3, 5 locales (en/th/ko/ja/zh), locale-prefixed routes |
| lengolf-booking-new — LIFF pages | liff.line.me/... | Hand-rolled TS dictionaries in `lib/liff/`, 4 locales (en/th/ja/zh), localStorage + `customers.preferred_language` |
| lengolf-booking-new — main flow | booking.len.golf | **English only** |

The main flow is the outlier. Logged-in customers already have a `preferred_language` recorded from LIFF, and each booking already records `bookings.language` at creation, but none of it surfaces in `/bookings`, `/vip`, `/play-and-food`, `/golf-club-rental`, or auth pages.

## Goals

1. Main booking flow and VIP portal fully localized in 5 languages (`en`, `th`, `ko`, `ja`, `zh`), matching the marketing site.
2. URL grammar consistent with `len.golf` (locale-prefixed, `as-needed`).
3. Server-rendered emails (booking confirmation, review request, account emails) render in the customer's language.
4. Returning customers keep their language across devices via `customers.preferred_language`.
5. No regression for existing English users — current unprefixed URLs keep working.

## Non-Goals (phase 1)

- LIFF pages stay on the existing hand-rolled system. They migrate in phase 2.
- No `Accept-Language` header sniffing. Anon visitors get English.
- DB seed data (bay names, CRM package names) stays as-is.
- Admin/internal surfaces — there are none in this app.

---

## 1. Routing & URL strategy

- Install `next-intl@^3`.
- `i18n/routing.ts`:
  ```ts
  export const routing = defineRouting({
    locales: ['en', 'th', 'ko', 'ja', 'zh'],
    defaultLocale: 'en',
    localePrefix: 'as-needed',
    localeCookie: { name: 'NEXT_LOCALE', maxAge: 60 * 60 * 24 * 365 },
  })
  ```
- Routes move under `app/[locale]/`:
  - `app/[locale]/page.tsx`
  - `app/[locale]/(features)/bookings/**`
  - `app/[locale]/(features)/vip/**`
  - `app/[locale]/(features)/auth/**`
  - `app/[locale]/play-and-food/**`
  - `app/[locale]/golf-club-rental/**`
- Stay outside `[locale]`:
  - `app/api/**` (API routes — locale comes from cookie or body)
  - `app/liff/**` (phase 2)

**Behavior**
- English users: unprefixed URLs (`/bookings`, `/vip/dashboard`) — no change.
- Non-English: prefixed (`/th/bookings`, `/ja/vip/dashboard`).
- `/` → rewrites to `/bookings`; for locale `x`, `/{x}` → rewrites to `/{x}/bookings`. Middleware update handles both cases.

## 2. Middleware

Current `middleware.ts` does three things:
1. Redirects LINE in-app browser to `/liff/*` equivalents.
2. Rewrites `/` → `/bookings`.
3. Runs NextAuth session check on non-LIFF routes.

All three remain. `createMiddleware(routing)` from next-intl runs after the LIFF redirect check and before NextAuth token check. Matcher extended to include locale-prefixed paths:
```ts
matcher: [
  '/',
  '/(en|th|ko|ja|zh)/:path*',
  '/bookings/:path*',
  '/vip/:path*',
  '/liff/:path*',
]
```

## 3. Locale resolution

Order (applied in middleware and in `getRequestConfig`):
1. URL locale prefix (if present).
2. `NEXT_LOCALE` cookie.
3. For authenticated requests with no cookie: read `customers.preferred_language` once, set the cookie, redirect to the prefixed URL. After that, cookie is authoritative.
4. Fallback: `'en'`.

No `Accept-Language` sniffing — too surprising for users and adds an extra redirect.

## 4. Message catalog

- Files: `messages/{en,th,ko,ja,zh}.json`.
- Top-level namespaces:
  - `common` — buttons, generic labels
  - `nav` — header/footer nav items
  - `auth` — login/signup flows
  - `bookings` — multi-step booking flow
  - `vip` — dashboard, profile, bookings, packages, membership
  - `playAndFood` — play & food packages page
  - `clubRental` — club rental page
  - `errors` — API error messages surfaced in UI
  - `emails` — email subject lines and bodies
- English (`en.json`) is source-of-truth.
- Other locales seeded by:
  1. Copying overlapping keys from `lengolf-website/messages/{th,ko,ja,zh}.json` where they exist (nav, CTAs, common phrases).
  2. Filling booking-specific strings manually (with DeepL assist where appropriate).
- Loaded in `i18n/request.ts` via `getRequestConfig`.
- Type safety: declare `messages/en.json` as the `Messages` interface augmentation so missing keys become TS errors across all locales.

## 5. Language switcher

- New file: `components/shared/LanguageSwitcher.tsx`.
- Dropdown listing the 5 locales with native names (`English`, `ไทย`, `한국어`, `日本語`, `中文`).
- Placed in the main header and on auth/login screens.
- On change:
  1. Writes `NEXT_LOCALE` cookie (via `document.cookie` for immediate client read + server echo).
  2. Calls `router.replace(pathname, { locale: next })` to swap URL prefix.
  3. If user is authenticated, fires `POST /api/user/language` to mirror the value into `customers.preferred_language`.

## 6. Shared language-persistence helper

Extract a shared module `lib/i18n/persist-language.ts` that:
- Validates the incoming locale against `routing.locales`.
- Writes `customers.preferred_language` via `createServerClient()`.
- Invalidates any language-related cache entries.

`POST /api/user/language` (new) and the existing `POST /api/liff/language` both call this helper. This is the stepping stone to phase 2 — LIFF keeps its current entry point but shares the persistence logic.

## 7. Emails

**Resolution of email language:**
- Booking confirmation → `booking.language` (already recorded at creation; LIFF sets it today, the new main flow will set it from the request locale).
- Review request → `booking.language`.
- Account emails (password reset, VIP link confirmation) → `customers.preferred_language`, fallback `'en'`.

**Implementation:**
- `emailService.ts` gains a required `language: Locale` parameter.
- Subjects and bodies authored in `messages/*.json` under the `emails.*` namespace.
- Uses `createTranslator({ locale, messages })` from next-intl — no request context needed.
- Date formatting via next-intl `createFormatter`.

**Write path:**
- `POST /api/bookings/create` writes `booking.language` from the request's resolved locale. This matches what LIFF already does.

## 8. Formatting & dynamic content

- **Dates:** `useFormatter().dateTime(date, { dateStyle: 'long' })` — locale-aware.
- **Currency:** THB stays THB in all locales; formatting via `useFormatter().number(amount, { style: 'currency', currency: 'THB' })`.
- **DB seed data:** bay names ("Bay 1", "Bay 2"), CRM package names — not translated.
- **API error strings:** APIs return `{ errorCode: string, params?: object }`. The client looks up `errors.{errorCode}` via `t()`. Existing API routes that throw human-readable strings get refactored as part of the relevant migration chunk.

## 9. Migration order

The implementation plan will chunk the work as follows:

1. **Scaffolding** — install `next-intl`, add `i18n/routing.ts` + `i18n/request.ts`, update middleware, move routes under `[locale]`, add `messages/en.json` skeleton. Verify `npm run build` passes and English flow is unchanged.
2. **Language switcher** — `components/shared/LanguageSwitcher.tsx`, `lib/i18n/persist-language.ts`, `POST /api/user/language`. Header integration.
3. **`/bookings` flow** — biggest surface. Replace hardcoded strings with `t()` calls; author `messages/en.json` keys.
4. **`/vip/*`** — dashboard, profile, bookings, packages, membership.
5. **Auth + misc pages** — `/auth/login`, `/play-and-food`, `/golf-club-rental`.
6. **Emails** — refactor `emailService.ts` to take `language`, translate templates, wire booking creation to record request locale into `booking.language`.
7. **Translation seeding** — copy overlapping keys from `lengolf-website/messages/*`, fill gaps, review with native speakers per locale.
8. **End-to-end smoke testing** — for each locale, run: `/` → `/bookings` → select date/bay/time → login → confirm → receive email in correct locale → `/vip/dashboard` → language switcher round-trip.

## 10. Testing

- **Typecheck:** `next-intl` `Messages` augmentation makes missing keys TypeScript errors. `npm run typecheck` catches drift between locales.
- **Build:** `npm run build` — catches Server Component issues the typecheck misses.
- **Jest unit tests:** `lib/i18n/persist-language.ts` — cookie/DB interaction; locale validation; fallback behavior.
- **Manual E2E:** Per-locale checklist covering the 8 flows above.
- **Regression:** explicit test that unprefixed English URLs continue to resolve (no unintended redirects).

## 11. Rollout

- Single PR per migration chunk (8 PRs total) rather than one big-bang PR. Each chunk is independently deployable: chunks 1–2 add infrastructure without removing English strings; chunks 3–6 replace strings incrementally; chunk 7 adds translation content.
- After each chunk: `typecheck` + `build` + manual smoke on English before merge.
- Feature-flag-free: `as-needed` locale prefix means non-English locales are reachable only via explicit switcher use until the switcher ships in chunk 2.

## 12. Risks & mitigations

| Risk | Mitigation |
|---|---|
| Broken deep links in email confirmations | English URLs keep working (unprefixed). Existing `/vip/bookings/{id}` links remain valid. |
| NextAuth callback URL collisions | `/api/*` excluded from locale prefix by matcher. OAuth callback URLs unchanged. |
| LIFF regression from shared middleware changes | Middleware matcher preserves `/liff/:path*` handling ahead of next-intl. LIFF route-detection kept as-is. |
| Missing translations visible to users | English-only production load until chunk 7; locales validated via TS types before any user sees them. |
| Translator/DeepL quality for domain terms | Seed from `lengolf-website` catalogs (already human-reviewed) where keys overlap; human review per locale in chunk 7. |

## 13. Phase 2 preview (out of scope here)

- Migrate `/liff/*` to consume the same `messages/` catalog and `lib/i18n/persist-language.ts`.
- Custom locale resolver for LIFF that still honors `liff.getLanguage()` and `customers.preferred_language` but reads from the unified catalog.
- Retire `lib/liff/translations.ts`, `booking-translations.ts`, `membership-translations.ts` once all LIFF components migrated.
- Keep LIFF URLs unprefixed (they're registered in LINE console); `as-needed` + English default makes this automatic.

---

## Open items

None at spec time. All scope questions resolved during brainstorming:
- 5 locales ✓
- Locale-prefixed URLs (`as-needed`) ✓
- English default for anon, DB preference for logged-in ✓
- Emails in scope ✓
- LIFF deferred to phase 2 ✓
