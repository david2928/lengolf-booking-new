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
EMAIL_HOST=               # SMTP server hostname or IP
EMAIL_PORT=               # SMTP port (default: 587)
EMAIL_SECURE=             # Use SSL/TLS (default: false)
EMAIL_USER=               # SMTP username
EMAIL_PASSWORD=           # SMTP password
EMAIL_TLS_REJECT_UNAUTHORIZED=false  # Set to false to allow self-signed certificates (default: true)
```

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

### Known follow-ups (not blocking merge)
- Full translation of `th/ko/ja/zh` needs native-speaker review (Task 12
  seeded overlapping keys from `lengolf-website`; the rest are English
  placeholders).
- Three near-duplicate `<html>+Providers` shells in `app/[locale]/layout.tsx`,
  `app/auth/layout.tsx`, `app/liff/layout.tsx` — extract a `RootShell`.
- `components/vip/ProfileView.tsx` and `ManualLinkAccountForm.tsx` use
  inline `<p>` for Zod-validated error messages — loses `aria-describedby`
  from shadcn's `FormMessage`.
- `components/vip/BookingsList.tsx:formatTime` hard-codes `hh:mm a` 12-hour
  format; won't localize for ja/ko.
- Email templates receive pre-formatted date strings — upstream would need
  to pass ISO values for locale-aware date formatting in emails.
- `sendCourseRentalConfirmationEmail` in `lib/emailService.ts` still
  English-only (separate flow that doesn't thread a locale).
- LIFF pages unchanged in phase 1 — phase 2 migrates them onto the same
  `messages/` catalog + `persistCustomerLanguage` helper (already shared).