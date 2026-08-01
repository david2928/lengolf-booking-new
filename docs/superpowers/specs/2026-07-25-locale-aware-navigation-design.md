# Locale-aware navigation across the booking flow and VIP portal

**Date:** 2026-07-25
**Base branch:** `feat/slice-8-split-details`
**Status:** approved

## Problem

`CLAUDE.md` states that `i18n/navigation.ts` re-exports typed `Link`, `redirect`,
`usePathname` and `useRouter`, and that these must be used instead of
`next/navigation` / `next/link` for locale-aware routing. Routing is configured
with `localePrefix: 'as-needed'` over `en` (unprefixed), `th`, `ko`, `ja`, `zh`.

Large parts of the customer-facing surface ignore this. A customer browsing
`/th/bookings` who selects a Play & Food package, completes a booking, or signs
in mid-flow is navigated to an unprefixed path and silently drops back to
English. The confirmation page is the worst case, since that is where booking
details and next steps are shown.

The sweep found the problem is wider than plain `Link`/`useRouter` misuse. There
are four distinct classes:

1. **Locale-unaware imports** — `Link`, `useRouter`, `usePathname` from Next's
   own modules. Fixed by an import swap; locale is inferred from context.
2. **`redirect` call sites** — cannot be a plain import swap, see below.
3. **NextAuth `callbackUrl` strings** — bypass the Next router entirely.
   Unfixed by 1 and 2, and directly in the reported flow.
4. **Compensating workarounds** — code that hand-rolls locale handling because
   it uses the raw primitives.

## Constraints discovered

- **next-intl is 3.26.5.** `redirect` takes an object and `locale` is
  **required** in both the server and client entries:
  `redirect({ href, locale })`. `href` accepts `string` or `{ pathname, query }`.
  Verified against
  `node_modules/next-intl/dist/types/src/navigation/{react-server,react-client}/createNavigation.d.ts`.
- **`i18n/navigation.ts` already exports `getPathname`**, which resolves a
  locale-prefixed path string. This is the correct tool for class 3, where the
  destination is consumed by NextAuth rather than by the Next router.
- **`useSearchParams`, `useParams` and `notFound` are not locale-aware** and are
  not exported by `i18n/navigation`. They stay on `next/navigation`.
- **next-intl's `Link` requires locale context.** Any component that can render
  outside a `NextIntlClientProvider` must not be converted.

## Scope

### 1. Import swaps (21 files)

Swap to `@/i18n/navigation`. No other change; locale is inferred.

**Booking flow (6)**

| File | Notes |
|---|---|
| `steps/details/useBookingDetailsForm.ts` | **The core fix.** The hook owns the `useRouter` and returns `router` (line 747); `BookingDetails.tsx` destructures it (line 40). One swap therefore covers the confirmation `router.push(url)` and the four package-select/clear `router.replace` calls in `BookingDetails.tsx`. |
| `steps/details/modals/PackageDetailsModal.tsx` | `Link` → `/play-and-food` |
| `booking/Layout.tsx` | 18 `<Link>`, `router.push('/auth/login')`, 4 × `router.prefetch('/vip*')` |
| `booking/ConfirmationContent.tsx` | `Link` → `/vip/bookings`, `router.push('/bookings')` |
| `bookings/hooks/useBookingFlow.ts` | `useRouter` only — `useSearchParams` stays |
| `bookings/hooks/useAvailability.ts` | `router.push('/auth/login')` ×2 |

**VIP (14)** — `vip/{page,bookings,dashboard,link-account,packages,profile,membership}`
and `components/vip/{BookingsList,DashboardCard,DashboardView,EmptyState,LinkAccountPrompt,PackagesList,SummaryCard,BookingModifyModal,ManualLinkAccountForm}`.

**Marketing / shared (3)** — `golf-club-rental`, `play-and-food`,
`components/shared/Header.tsx`.

The three `app/[locale]/payment/*` files were already on `@/i18n/navigation`
and need no change; `payment/result` keeps `useSearchParams` from
`next/navigation`, which is correct.

`Header.tsx` is safe to convert: it is imported only by `bookings/Layout.tsx`
and `vip/layout.tsx`, both inside `[locale]`.

### 2. `redirect` sites needing an explicit locale (4)

- `bookings/confirmation/page.tsx` ×3 — async server component. Add
  `const locale = await getLocale()` from `next-intl/server`, then
  `redirect({ href: '/bookings', locale })`.
- `vip/layout.tsx:130` — this call lives in a **client** `useEffect`. Rather
  than thread a locale into `redirect`, convert it to
  `useRouter().replace({ pathname: '/auth/login', query: { callbackUrl } })`.
  The hook infers the locale, and `router.replace` is the correct primitive
  inside an effect.

### 3. NextAuth `callbackUrl` (5 sites)

NextAuth hard-redirects to the raw string, so these are unaffected by 1 and 2.
Resolve each with `getPathname({ href, locale })`.

| Site | Current value |
|---|---|
| `useBookingFlow.ts:131-138` | `/bookings?selectDate=…&package=…&club=…` — in the reported flow |
| `auth/login/page.tsx:20` | default `/bookings` |
| `vip/layout.tsx:130` | `callbackUrl=/vip` |
| `vip/layout.tsx:163` | signOut → `/` |
| `lib/vipService.ts:56` | signOut → `/auth/login` |

Client sites read `useLocale()`. `lib/vipService.ts` is not a component, so it
receives `locale` as a parameter from its caller rather than importing a hook.

### 4. Adjacent fixes

- **`/auth/signin` does not exist as a route.** `useBookingDetailsForm.ts:222,539`
  push unauthenticated users there, yielding a 404; every other path uses
  `/auth/login`. Corrected on the same lines being edited.
- **`ChatWidget.tsx`** hand-rolls `/^\/(th|ko|ja|zh)?(\/bookings)?\/?$/` to
  compensate for the raw `usePathname`. The i18n `usePathname` strips the
  prefix, so the alternation is dropped. Its `startsWith('/liff')` branch is
  dead — `ChatWidget` mounts only from `[locale]/layout.tsx` — so it is removed
  rather than left as a misleading check.

## Deliberately unchanged

| Target | Reason |
|---|---|
| `components/shared/{ErrorPage,NotFoundPage}.tsx` | Reached from root `app/error.tsx` / `app/not-found.tsx`. **No `NextIntlClientProvider` in scope** — next-intl's `Link` would throw. |
| `components/providers/VipStatusProvider.tsx` | Mounted in root `app/providers.tsx`, which wraps LIFF routes too. |
| `app/auth/error/**` | Deliberately unprefixed per `CLAUDE.md`. |
| `app/liff/**` | Separate hand-rolled i18n under `lib/liff/`. |
| `app/preferences/[token]` | Outside `[locale]`; `notFound` only. |
| All `useSearchParams` / `useParams` / `notFound` | Not locale-aware. |

## Regression guard

An ESLint `no-restricted-imports` override scoped to `app/[locale]/**`,
`components/vip/**`, `components/chat/**` and `components/shared/Header.tsx`,
banning `next/link` and the four locale-aware names from `next/navigation`
(`useRouter`, `usePathname`, `redirect`, `permanentRedirect`) while leaving
`useSearchParams` / `useParams` / `notFound` permitted.

The scoping is what keeps the "deliberately unchanged" list legal: root, LIFF
and `/auth/error` stay unrestricted.

## Verification

Gates: `npm run typecheck` → `npm run lint` → `npm run test` → `npm run build`.
Typecheck is the real check on the `redirect` object signature.

Per `CLAUDE.md`, none of those validate client hydration, so a real dev-server
pass is required. This worktree needs the `node_modules` junction and an
`.env.local` copy first (known worktree build trap).

With `npm run dev`:

1. Load `/th/bookings` — renders Thai.
2. Select a Play & Food package — URL stays `/th/bookings?package=…`.
3. Clear the package — URL stays `/th/bookings`.
4. Open the package modal, follow the link — lands on `/th/play-and-food`.
5. Drive a booking to completion — redirect lands on
   `/th/bookings/confirmation?id=…`, rendered in Thai.
6. Signed out, trigger the sign-in bounce from the date step — after auth,
   return lands on `/th/bookings?selectDate=…`.

## Out of scope

- LIFF i18n unification (phase 2 in `CLAUDE.md`).
- Staff-facing `toLocaleDateString('en-GB', …)` formatting in
  `app/api/notifications/line/route.ts` and friends.
