# Main Booking Site i18n Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add 5-locale (`en/th/ko/ja/zh`) localization to the non-LIFF booking surface of `booking.len.golf` using `next-intl`, with locale-prefixed URLs (`as-needed`), translated server-rendered emails, and `customers.preferred_language` persistence for logged-in users.

**Architecture:** Introduce `next-intl@^3` with an `app/[locale]/` segment wrapping `(features)/bookings`, `(features)/vip`, `(features)/auth`, `play-and-food`, `golf-club-rental`. English remains unprefixed; other locales get a URL prefix. Existing middleware (LINE-UA redirect, `/ → /bookings` rewrite, NextAuth session check) is preserved; `createMiddleware(routing)` is composed after the LIFF redirect step. A shared `lib/i18n/persist-language.ts` writes `customers.preferred_language` and is consumed by both the new `/api/user/language` endpoint and the existing `/api/liff/language` (stepping stone to phase 2). `emailService.ts` gains a required `language: Locale` param and uses `createTranslator` to render templates. LIFF pages are untouched.

**Tech Stack:** Next.js 15 (App Router), React 18, TypeScript, `next-intl@^3`, Supabase (`@supabase/ssr`), NextAuth.js v4, Tailwind, nodemailer.

**Spec:** `docs/superpowers/specs/2026-04-18-main-booking-i18n-design.md`

---

## File Structure

**Create:**
- `i18n/routing.ts` — locale config (mirrors website's shape).
- `i18n/request.ts` — `getRequestConfig` loader.
- `i18n/navigation.ts` — typed `Link`, `redirect`, `useRouter`, `usePathname` re-exports.
- `messages/en.json` — English source of truth.
- `messages/th.json`, `messages/ko.json`, `messages/ja.json`, `messages/zh.json` — translated catalogs (created empty, filled in Task 12).
- `lib/i18n/persist-language.ts` — shared helper for writing `customers.preferred_language`.
- `app/api/user/language/route.ts` — endpoint for authenticated-user language persistence.
- `components/shared/LanguageSwitcher.tsx` — dropdown language switcher.
- `tests/lib/i18n/persist-language.test.ts` — Jest unit tests for the helper.

**Modify:**
- `middleware.ts` — compose `createMiddleware(routing)` after LIFF redirect, update matcher.
- `app/layout.tsx` — delegate lang attribute and providers to `[locale]/layout.tsx` (or keep minimal HTML + pass through). New child `app/[locale]/layout.tsx` owns locale-aware `<html lang>` and `NextIntlClientProvider`.
- `app/page.tsx`, `app/(features)/*`, `app/play-and-food/*`, `app/golf-club-rental/*` — **moved** under `app/[locale]/`.
- `app/api/liff/language/route.ts` — replace inline DB update with call to shared helper (keep LIFF-specific cache invalidation).
- `app/api/bookings/create/route.ts` — honor request locale when caller omits `language`.
- `lib/emailService.ts` — add `language: Locale` param; route subject/body through `createTranslator`.
- `package.json` — add `next-intl` dependency.

**Move under `app/[locale]/`:**
- `app/page.tsx` → `app/[locale]/page.tsx`
- `app/(features)/auth/**` → `app/[locale]/(features)/auth/**`
- `app/(features)/bookings/**` → `app/[locale]/(features)/bookings/**`
- `app/(features)/vip/**` → `app/[locale]/(features)/vip/**`
- `app/play-and-food/**` → `app/[locale]/play-and-food/**`
- `app/golf-club-rental/**` → `app/[locale]/golf-club-rental/**`

**Unchanged (stays outside `[locale]`):**
- `app/api/**`
- `app/liff/**`
- `app/auth/error/**` (OAuth error page needs stable URL; remains English-only)
- `app/course-rental/**` (check in Task 2 — if customer-facing, move under `[locale]` too)
- `app/error.tsx`, `app/loading.tsx`, `app/not-found.tsx`, `app/globals.css`, `app/providers.tsx`

---

## Task 1: Install next-intl and scaffold config files

**Files:**
- Modify: `package.json`
- Create: `i18n/routing.ts`
- Create: `i18n/request.ts`
- Create: `i18n/navigation.ts`
- Modify: `next.config.js` (or `next.config.ts`)

- [ ] **Step 1: Install next-intl**

Run:
```bash
npm install next-intl@^3
```
Expected: adds `"next-intl": "^3.x"` to `package.json` dependencies, no peer dep warnings.

- [ ] **Step 2: Create `i18n/routing.ts`**

Create `i18n/routing.ts`:
```ts
import { defineRouting } from 'next-intl/routing';

export const routing = defineRouting({
  locales: ['en', 'th', 'ko', 'ja', 'zh'],
  defaultLocale: 'en',
  localePrefix: 'as-needed',
  localeCookie: {
    name: 'NEXT_LOCALE',
    maxAge: 60 * 60 * 24 * 365, // 1 year
  },
});

export type Locale = (typeof routing.locales)[number];

export const localeNativeName: Record<Locale, string> = {
  en: 'English',
  th: 'ไทย',
  ko: '한국어',
  ja: '日本語',
  zh: '中文',
};

export function isValidLocale(value: string): value is Locale {
  return (routing.locales as readonly string[]).includes(value);
}
```

- [ ] **Step 3: Create `i18n/navigation.ts`**

Create `i18n/navigation.ts`:
```ts
import { createNavigation } from 'next-intl/navigation';
import { routing } from './routing';

export const { Link, redirect, usePathname, useRouter, getPathname } =
  createNavigation(routing);
```

- [ ] **Step 4: Create `i18n/request.ts`**

Create `i18n/request.ts`:
```ts
import { getRequestConfig } from 'next-intl/server';
import { hasLocale } from 'next-intl';
import { routing } from './routing';

export default getRequestConfig(async ({ requestLocale }) => {
  const requested = await requestLocale;
  const locale = hasLocale(routing.locales, requested)
    ? requested
    : routing.defaultLocale;

  return {
    locale,
    messages: (await import(`../messages/${locale}.json`)).default,
  };
});
```

- [ ] **Step 5: Wire the next-intl plugin into `next.config.js`**

Open `next.config.js`. Add the plugin wrapper at the top and wrap the exported config. Example shape (apply surgically around the existing exported config):
```js
const createNextIntlPlugin = require('next-intl/plugin');
const withNextIntl = createNextIntlPlugin('./i18n/request.ts');

/** @type {import('next').NextConfig} */
const nextConfig = {
  // ...existing config unchanged...
};

module.exports = withNextIntl(nextConfig);
```

- [ ] **Step 6: Create empty message files**

Create `messages/en.json`, `messages/th.json`, `messages/ko.json`, `messages/ja.json`, `messages/zh.json`. Each file:
```json
{}
```

- [ ] **Step 7: Build to verify scaffold compiles**

Run:
```bash
npm run build
```
Expected: build succeeds. No route changes yet — existing English flow continues working as-is.

- [ ] **Step 8: Commit**

```bash
git add i18n/ messages/ package.json package-lock.json next.config.js
git commit -m "feat(i18n): install next-intl and scaffold config"
```

---

## Task 2: Move customer-facing routes under `app/[locale]/`

**Files:**
- Move: `app/page.tsx` → `app/[locale]/page.tsx`
- Move: `app/(features)/auth/**` → `app/[locale]/(features)/auth/**`
- Move: `app/(features)/bookings/**` → `app/[locale]/(features)/bookings/**`
- Move: `app/(features)/vip/**` → `app/[locale]/(features)/vip/**`
- Move: `app/play-and-food/**` → `app/[locale]/play-and-food/**`
- Move: `app/golf-club-rental/**` → `app/[locale]/golf-club-rental/**`
- Create: `app/[locale]/layout.tsx`
- Modify: `app/layout.tsx` (strip `<html>` tag — now owned by `[locale]/layout.tsx`)

**Note on `course-rental`:** inspect `app/course-rental/` before moving. If it's a customer-facing page, move it under `[locale]/` too. If it's server-only or a deprecated redirect, leave it.

- [ ] **Step 1: Inspect `app/course-rental/` and decide**

Run:
```bash
ls app/course-rental/
cat app/course-rental/page.tsx 2>/dev/null | head -30
```
If the directory contains a customer-facing `page.tsx`, include it in this task. Otherwise skip it.

- [ ] **Step 2: Create `app/[locale]/layout.tsx`**

Create `app/[locale]/layout.tsx`:
```tsx
import { NextIntlClientProvider, hasLocale } from 'next-intl';
import { setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { routing } from '@/i18n/routing';
import { Poppins } from 'next/font/google';
import '../globals.css';
import { Providers } from '../providers';
import Script from 'next/script';
import ChatWidgetLoader from '@/components/chat/ChatWidgetLoader';
import { Analytics } from '@vercel/analytics/next';
import type { ReactNode } from 'react';

const poppins = Poppins({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-poppins',
  display: 'swap',
});

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export default async function LocaleLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) {
    notFound();
  }
  setRequestLocale(locale);

  return (
    <html lang={locale} className={`${poppins.variable} font-sans`}>
      <head>
        <link rel="preconnect" href="https://www.googletagmanager.com" />
        <link rel="preconnect" href="https://connect.facebook.net" />
        {/* GTM + structured-data scripts moved verbatim from app/layout.tsx — copy the existing Script and structured-data blocks here */}
      </head>
      <body>
        <noscript>
          <iframe
            src="https://www.googletagmanager.com/ns.html?id=GTM-MKCHVJKW"
            height="0"
            width="0"
            style={{ display: 'none', visibility: 'hidden' }}
          />
        </noscript>
        <NextIntlClientProvider>
          <Providers>
            {children}
            <ChatWidgetLoader />
            <Analytics />
          </Providers>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
```
Then copy the full `<Script id="google-tag-manager">` block and the `<Script id="structured-data">` block verbatim from the current `app/layout.tsx` into the `<head>` section. Preserve the exact inline script content — it's SEO and analytics critical.

- [ ] **Step 3: Simplify `app/layout.tsx`**

The root layout becomes a passthrough (next-intl still needs it for `<html>` rendering in non-locale routes like `/liff/*` and `/api/*`. Since those render their own shells, the root layout should render children without an outer `<html>` wrapper).

Replace `app/layout.tsx` with:
```tsx
import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
};

export const metadata: Metadata = {
  metadataBase: new URL('https://booking.len.golf'),
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return children;
}
```
The existing rich metadata (title, description, OpenGraph, Twitter, icons) moves into `app/[locale]/layout.tsx` or a dedicated `app/[locale]/page.tsx` metadata export.

- [ ] **Step 4: Move metadata into the locale layout**

In `app/[locale]/layout.tsx`, add the metadata export. Copy the existing `export const metadata` block from the old `app/layout.tsx` verbatim. It can stay non-localized in this task (full metadata localization is follow-up polish; not required for phase 1 correctness).

- [ ] **Step 5: Git-move directories**

Run (Bash-compatible; use `git mv` so history is preserved):
```bash
mkdir -p "app/[locale]/(features)"
git mv "app/(features)/auth"     "app/[locale]/(features)/auth"
git mv "app/(features)/bookings" "app/[locale]/(features)/bookings"
git mv "app/(features)/vip"      "app/[locale]/(features)/vip"
git mv "app/play-and-food"       "app/[locale]/play-and-food"
git mv "app/golf-club-rental"    "app/[locale]/golf-club-rental"
git mv "app/page.tsx"            "app/[locale]/page.tsx"
```
If `app/course-rental/` is customer-facing per Step 1, add:
```bash
git mv "app/course-rental" "app/[locale]/course-rental"
```

- [ ] **Step 6: Update imports inside moved files**

Many moved files use relative imports like `../../../components/...`. After moving down one segment (`[locale]/`), these relative paths still resolve correctly because the sub-tree moved as a whole. Spot-check imports by running:
```bash
npm run typecheck
```
Fix any broken paths shown. Expected: most should still work. Any breakage is likely absolute imports referencing paths that changed — none should, since we use `@/` aliases.

- [ ] **Step 7: Update middleware matcher for locale-prefixed paths (temporary)**

In `middleware.ts`, extend the matcher to include the new locale-prefixed paths. (Full middleware integration happens in Task 3; this step is only to keep routing working after the move.)

```ts
export const config = {
  matcher: [
    '/',
    '/(en|th|ko|ja|zh)/:path*',
    '/bookings/:path*',
    '/vip/:path*',
    '/liff/:path*',
  ],
};
```

- [ ] **Step 8: Dev-server smoke test**

Run:
```bash
npm run dev
```
Visit `http://localhost:3000/` and `http://localhost:3000/bookings/`. Expected: the bookings page renders as before. Any 404 means a moved file was missed or `app/page.tsx` wasn't correctly moved — fix before proceeding. Stop the dev server.

- [ ] **Step 9: Typecheck and build**

Run:
```bash
npm run typecheck && npm run build
```
Expected: both pass.

- [ ] **Step 10: Commit**

```bash
git add app/ middleware.ts
git commit -m "feat(i18n): move customer routes under app/[locale]/ and scaffold locale layout"
```

---

## Task 3: Integrate next-intl middleware

**Files:**
- Modify: `middleware.ts`

- [ ] **Step 1: Read current middleware**

The current middleware does:
1. LINE-UA redirect to `/liff/*`
2. Rewrite `/` → `/bookings`
3. NextAuth token check

next-intl's middleware must run on locale-prefixed routes but must not interfere with LIFF routes or API routes.

- [ ] **Step 2: Replace `middleware.ts`**

Replace `middleware.ts` with:
```ts
import { NextResponse } from 'next/server';
import { getToken } from 'next-auth/jwt';
import createIntlMiddleware from 'next-intl/middleware';
import type { NextRequest } from 'next/server';
import { routing } from './i18n/routing';

const intlMiddleware = createIntlMiddleware(routing);

function isLineBrowser(request: NextRequest): boolean {
  const ua = request.headers.get('user-agent')?.toLowerCase() ?? '';
  return ua.includes('line/') || ua.includes('line ');
}

const LIFF_ROUTE_MAP: Record<string, string> = {
  '/': '/liff/booking',
  '/bookings': '/liff/booking',
  '/vip': '/liff/membership',
  '/vip/dashboard': '/liff/membership',
};

// Strip a leading locale segment so LINE-UA detection works on both
// `/bookings` and `/th/bookings`.
function stripLocale(pathname: string): string {
  for (const locale of routing.locales) {
    if (pathname === `/${locale}`) return '/';
    if (pathname.startsWith(`/${locale}/`)) return pathname.slice(locale.length + 1);
  }
  return pathname;
}

export async function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;

  // LIFF routes: skip locale handling and auth entirely
  if (pathname.startsWith('/liff')) {
    return NextResponse.next();
  }

  // LINE browser users: redirect to LIFF equivalents (locale-agnostic)
  if (isLineBrowser(request)) {
    const bare = stripLocale(pathname);
    const liffRoute =
      LIFF_ROUTE_MAP[bare] ??
      (bare.startsWith('/bookings') ? '/liff/booking' : null) ??
      (bare.startsWith('/vip') ? '/liff/membership' : null);

    if (liffRoute) {
      return NextResponse.redirect(new URL(liffRoute, request.url));
    }
  }

  // Delegate locale resolution, cookie handling, and redirects to next-intl.
  // This also rewrites `/` (default locale) to `/en` internally.
  const intlResponse = intlMiddleware(request);

  // After locale is resolved, rewrite `/{locale}` → `/{locale}/bookings`
  // (preserves the existing root-as-bookings behavior for every locale).
  const postIntlPath = intlResponse.headers.get('x-middleware-rewrite') ?? pathname;
  const bare = stripLocale(new URL(postIntlPath, request.url).pathname);
  if (bare === '/') {
    const url = request.nextUrl.clone();
    // Reconstruct the locale-prefixed path: '/bookings' for default locale, '/{locale}/bookings' otherwise
    const localePrefixMatch = pathname.match(/^\/(en|th|ko|ja|zh)(?=\/|$)/);
    const prefix = localePrefixMatch ? localePrefixMatch[0] : '';
    url.pathname = `${prefix}/bookings`;
    return NextResponse.rewrite(url);
  }

  // NextAuth session check (best-effort; downstream pages enforce their own auth)
  try {
    await getToken({
      req: request,
      secret: process.env.NEXTAUTH_SECRET,
      secureCookie: process.env.NODE_ENV === 'production',
    });
  } catch (error) {
    console.error('Middleware error:', error);
  }

  return intlResponse;
}

export const config = {
  matcher: [
    '/',
    '/(en|th|ko|ja|zh)/:path*',
    '/bookings/:path*',
    '/vip/:path*',
    '/play-and-food/:path*',
    '/golf-club-rental/:path*',
    '/auth/:path*',
    '/liff/:path*',
  ],
};
```

- [ ] **Step 3: Dev-server smoke test — default locale**

Run:
```bash
npm run dev
```

Test in a browser or with curl (`-I` to see redirects/rewrites):
```bash
curl -I http://localhost:3000/
curl -I http://localhost:3000/bookings
curl -I http://localhost:3000/th
curl -I http://localhost:3000/th/bookings
curl -I http://localhost:3000/ja/vip/dashboard
```
Expected:
- `/` — 200 (rewritten to `/bookings`)
- `/bookings` — 200
- `/th` — 200 (rewritten to `/th/bookings`)
- `/th/bookings` — 200
- `/ja/vip/dashboard` — 200 (or 307 to login if unauthenticated — that's expected)

Stop the dev server.

- [ ] **Step 4: Typecheck and build**

Run:
```bash
npm run typecheck && npm run build
```
Expected: both pass.

- [ ] **Step 5: Commit**

```bash
git add middleware.ts
git commit -m "feat(i18n): compose next-intl middleware with existing LIFF redirect and rewrite"
```

---

## Task 4: Add `messages/en.json` skeleton

**Files:**
- Modify: `messages/en.json`

The skeleton defines the namespaces. Actual strings get filled in per-page in Tasks 8–11.

- [ ] **Step 1: Populate `messages/en.json`**

Replace `messages/en.json` with:
```json
{
  "common": {
    "continue": "Continue",
    "back": "Back",
    "cancel": "Cancel",
    "confirm": "Confirm",
    "loading": "Loading...",
    "save": "Save",
    "close": "Close",
    "yes": "Yes",
    "no": "No"
  },
  "nav": {
    "bookNow": "Book Now",
    "myBookings": "My Bookings",
    "dashboard": "Dashboard",
    "profile": "Profile",
    "packages": "Packages",
    "membership": "Membership",
    "signIn": "Sign In",
    "signOut": "Sign Out"
  },
  "auth": {},
  "bookings": {},
  "vip": {},
  "playAndFood": {},
  "clubRental": {},
  "errors": {
    "generic": "Something went wrong. Please try again.",
    "unauthorized": "You must be signed in to do this.",
    "slotUnavailable": "That time slot is no longer available.",
    "network": "Network error. Please check your connection."
  },
  "emails": {
    "bookingConfirmation": {},
    "reviewRequest": {},
    "linkAccount": {}
  }
}
```

- [ ] **Step 2: Mirror skeleton into other locales**

For each of `messages/{th,ko,ja,zh}.json`, copy the same skeleton. Leave empty-object sections empty; other keys can temporarily use the English value (will be translated in Task 12).

```bash
cp messages/en.json messages/th.json
cp messages/en.json messages/ko.json
cp messages/en.json messages/ja.json
cp messages/en.json messages/zh.json
```

- [ ] **Step 3: Verify build**

Run:
```bash
npm run build
```
Expected: pass.

- [ ] **Step 4: Commit**

```bash
git add messages/
git commit -m "feat(i18n): add English message catalog skeleton and mirror to other locales"
```

---

## Task 5: Shared language-persistence helper

**Files:**
- Create: `lib/i18n/persist-language.ts`
- Create: `tests/lib/i18n/persist-language.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/lib/i18n/persist-language.test.ts`:
```ts
import { persistCustomerLanguage } from '@/lib/i18n/persist-language';
import { createServerClient } from '@/utils/supabase/server';

jest.mock('@/utils/supabase/server');

const mockedCreateServerClient = createServerClient as jest.MockedFunction<
  typeof createServerClient
>;

describe('persistCustomerLanguage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('rejects invalid locale', async () => {
    const result = await persistCustomerLanguage({
      customerId: 'cust-1',
      locale: 'xx',
    });
    expect(result).toEqual({ ok: false, reason: 'invalid_locale' });
  });

  it('writes the locale to customers.preferred_language', async () => {
    const eq = jest.fn().mockResolvedValue({ error: null });
    const update = jest.fn().mockReturnValue({ eq });
    const from = jest.fn().mockReturnValue({ update });
    mockedCreateServerClient.mockReturnValue({ from } as any);

    const result = await persistCustomerLanguage({
      customerId: 'cust-1',
      locale: 'th',
    });

    expect(from).toHaveBeenCalledWith('customers');
    expect(update).toHaveBeenCalledWith({ preferred_language: 'th' });
    expect(eq).toHaveBeenCalledWith('id', 'cust-1');
    expect(result).toEqual({ ok: true });
  });

  it('returns db_error when supabase errors', async () => {
    const eq = jest.fn().mockResolvedValue({ error: { message: 'oops' } });
    const update = jest.fn().mockReturnValue({ eq });
    const from = jest.fn().mockReturnValue({ update });
    mockedCreateServerClient.mockReturnValue({ from } as any);

    const result = await persistCustomerLanguage({
      customerId: 'cust-1',
      locale: 'en',
    });

    expect(result).toEqual({ ok: false, reason: 'db_error' });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:
```bash
npm test -- tests/lib/i18n/persist-language.test.ts
```
Expected: FAIL with "Cannot find module '@/lib/i18n/persist-language'".

- [ ] **Step 3: Implement the helper**

Create `lib/i18n/persist-language.ts`:
```ts
import 'server-only';
import { createServerClient } from '@/utils/supabase/server';
import { isValidLocale, type Locale } from '@/i18n/routing';

type PersistArgs = {
  customerId: string;
  locale: string;
};

type PersistResult =
  | { ok: true }
  | { ok: false; reason: 'invalid_locale' | 'db_error' };

export async function persistCustomerLanguage({
  customerId,
  locale,
}: PersistArgs): Promise<PersistResult> {
  if (!isValidLocale(locale)) {
    return { ok: false, reason: 'invalid_locale' };
  }

  const supabase = createServerClient();
  const { error } = await supabase
    .from('customers')
    .update({ preferred_language: locale satisfies Locale })
    .eq('id', customerId);

  if (error) {
    console.error('[persistCustomerLanguage] DB error:', error);
    return { ok: false, reason: 'db_error' };
  }

  return { ok: true };
}
```

- [ ] **Step 4: Run tests to verify pass**

Run:
```bash
npm test -- tests/lib/i18n/persist-language.test.ts
```
Expected: 3 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/i18n/persist-language.ts tests/lib/i18n/persist-language.test.ts
git commit -m "feat(i18n): add shared persistCustomerLanguage helper"
```

---

## Task 6: `/api/user/language` endpoint

**Files:**
- Create: `app/api/user/language/route.ts`

- [ ] **Step 1: Implement the route**

Create `app/api/user/language/route.ts`:
```ts
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/options';
import { createServerClient } from '@/utils/supabase/server';
import { persistCustomerLanguage } from '@/lib/i18n/persist-language';
import { isValidLocale } from '@/i18n/routing';

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: { locale?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const locale = typeof body.locale === 'string' ? body.locale : '';
  if (!isValidLocale(locale)) {
    return NextResponse.json({ error: 'Invalid locale' }, { status: 400 });
  }

  const supabase = createServerClient();
  const { data: profile, error } = await supabase
    .from('profiles')
    .select('customer_id')
    .eq('id', session.user.id)
    .maybeSingle();

  if (error || !profile?.customer_id) {
    // No CRM mapping yet — cookie-only persistence (done on the client) is still fine.
    return NextResponse.json({ ok: true, persisted: false });
  }

  const result = await persistCustomerLanguage({
    customerId: profile.customer_id,
    locale,
  });
  if (!result.ok) {
    return NextResponse.json({ error: result.reason }, { status: 500 });
  }
  return NextResponse.json({ ok: true, persisted: true });
}
```
**Note:** the exact session-to-profile mapping may differ — verify by inspecting `app/api/auth/options.ts` (look for how `session.user.id` relates to `profiles.id`). Adjust the query column if the real schema uses `provider_id` or similar instead.

- [ ] **Step 2: Verify session-to-profile mapping**

Run:
```bash
grep -n "session.user" app/api/auth/options.ts app/api/vip/status/route.ts 2>/dev/null | head
```
Read the results and confirm whether `session.user.id === profiles.id` or some other column. Adjust the query in Step 1 if needed. Commit the corrected version.

- [ ] **Step 3: Manual smoke test**

Start the dev server, sign in with a test account, then from DevTools console:
```js
fetch('/api/user/language', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ locale: 'th' }) }).then(r => r.json()).then(console.log);
```
Expected: `{ ok: true, persisted: true }` if the user has a CRM mapping, `{ ok: true, persisted: false }` otherwise. Verify in Supabase that `customers.preferred_language` updated.

Stop the dev server.

- [ ] **Step 4: Commit**

```bash
git add app/api/user/language/
git commit -m "feat(i18n): add /api/user/language endpoint for authenticated language persistence"
```

---

## Task 7: `LanguageSwitcher` component

**Files:**
- Create: `components/shared/LanguageSwitcher.tsx`

- [ ] **Step 1: Implement the component**

Create `components/shared/LanguageSwitcher.tsx`:
```tsx
'use client';

import { useLocale } from 'next-intl';
import { useTransition } from 'react';
import { useSession } from 'next-auth/react';
import { usePathname, useRouter } from '@/i18n/navigation';
import { routing, localeNativeName, type Locale } from '@/i18n/routing';

export function LanguageSwitcher() {
  const locale = useLocale() as Locale;
  const pathname = usePathname();
  const router = useRouter();
  const { data: session } = useSession();
  const [pending, startTransition] = useTransition();

  const handleChange = (next: Locale) => {
    startTransition(() => {
      // Cookie is set automatically by next-intl via router.replace.
      router.replace(pathname, { locale: next });
      // Best-effort server-side persistence for logged-in users.
      if (session) {
        fetch('/api/user/language', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ locale: next }),
        }).catch(() => {
          /* non-fatal */
        });
      }
    });
  };

  return (
    <select
      aria-label="Language"
      value={locale}
      onChange={(e) => handleChange(e.target.value as Locale)}
      disabled={pending}
      className="bg-transparent text-sm px-2 py-1 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-green-600"
    >
      {routing.locales.map((loc) => (
        <option key={loc} value={loc}>
          {localeNativeName[loc]}
        </option>
      ))}
    </select>
  );
}
```

- [ ] **Step 2: Mount the switcher in the main booking header**

Identify the main header used by `(features)/bookings/*` — likely `app/[locale]/(features)/bookings/components/booking/Layout.tsx` or a component it renders. Add:
```tsx
import { LanguageSwitcher } from '@/components/shared/LanguageSwitcher';
// ...in the header JSX:
<LanguageSwitcher />
```
Place it near any existing sign-in/sign-out controls. The exact spot depends on the current header markup — inspect before adding.

- [ ] **Step 3: Dev smoke test**

Run:
```bash
npm run dev
```
Visit `http://localhost:3000/bookings`, change the dropdown to `ไทย`. Expected: URL becomes `/th/bookings`, `NEXT_LOCALE=th` cookie set (check DevTools → Application → Cookies). Change back to `English`. Expected: URL returns to `/bookings`. Stop the dev server.

- [ ] **Step 4: Typecheck and commit**

```bash
npm run typecheck
git add components/shared/LanguageSwitcher.tsx app/[locale]/
git commit -m "feat(i18n): add LanguageSwitcher and mount in booking header"
```

---

## Task 8: Translate `/bookings` flow

**Files (modify, adding `t()` calls):**
- `app/[locale]/(features)/bookings/page.tsx`
- `app/[locale]/(features)/bookings/components/booking/Layout.tsx`
- `app/[locale]/(features)/bookings/components/booking/steps/DateSelection.tsx`
- `app/[locale]/(features)/bookings/components/booking/steps/TimeSlots.tsx`
- `app/[locale]/(features)/bookings/components/booking/steps/BookingDetails.tsx`
- Any other files under `app/[locale]/(features)/bookings/` or `components/booking/` with hardcoded strings.

**Files (modify, adding keys):**
- `messages/en.json` — add to the `bookings` namespace.

This task is mechanical but large. Work through files in the order listed.

- [ ] **Step 1: Inventory hardcoded strings**

Run from repo root:
```bash
grep -rn --include='*.tsx' -E '>[A-Z][a-zA-Z ]+<|placeholder="[A-Z]|aria-label="[A-Z]|title="[A-Z]' "app/[locale]/(features)/bookings" components/booking 2>/dev/null | head -80
```
Scan the output to get a mental map of strings. Don't translate yet.

- [ ] **Step 2: For each file, replace hardcoded strings with `t()` calls**

**Pattern for server components:**
```tsx
import { getTranslations } from 'next-intl/server';

export default async function Page() {
  const t = await getTranslations('bookings');
  return <h1>{t('title')}</h1>;
}
```

**Pattern for client components:**
```tsx
'use client';
import { useTranslations } from 'next-intl';

export function DateSelection() {
  const t = useTranslations('bookings.dateStep');
  return <button>{t('continue')}</button>;
}
```

For each string replaced, add the key to `messages/en.json` under a sensibly-named sub-namespace (e.g., `bookings.dateStep.continue`).

**Example translation diff for `DateSelection.tsx`** (illustrative — adapt to actual strings):
```tsx
// Before
<h2 className="text-xl">Select a date</h2>
<button>Continue</button>

// After
const t = useTranslations('bookings.dateStep');
<h2 className="text-xl">{t('heading')}</h2>
<button>{t('continue')}</button>
```
And in `messages/en.json`:
```json
{
  "bookings": {
    "dateStep": {
      "heading": "Select a date",
      "continue": "Continue"
    }
  }
}
```

- [ ] **Step 3: Handle date formatting**

Any `format(date, 'PPP')` from `date-fns` should be replaced with `next-intl` formatters:
```tsx
import { useFormatter } from 'next-intl';
const format = useFormatter();
// ...
<span>{format.dateTime(selectedDate, { dateStyle: 'long' })}</span>
```

- [ ] **Step 4: Record request locale into `booking.language`**

In `app/api/bookings/create/route.ts`, ensure the request locale (from the `NEXT_LOCALE` cookie or passed explicitly by the client) is written to `bookings.language`. Read the current state:
```bash
grep -n "language" app/api/bookings/create/route.ts
```
If the body already carries `language` (LIFF pattern), extend the main booking flow's fetch call to pass `locale` from `useLocale()`. The DB write is already in place (see spec section 4).

- [ ] **Step 5: Typecheck and dev smoke test**

```bash
npm run typecheck && npm run dev
```
Walk the full booking flow in English at `http://localhost:3000/bookings`. Verify no missing-key errors in the browser console. Stop the server.

- [ ] **Step 6: Mirror keys into other locale files**

For every new key added to `messages/en.json` this task, add the same path to `messages/{th,ko,ja,zh}.json` with placeholder value = English (will be translated in Task 12). Simple approach: copy `en.json` over each and keep only the keys that already existed before this task untouched.

**Tip:** a small Node script to merge keys:
```bash
node -e "
const en = require('./messages/en.json');
for (const loc of ['th','ko','ja','zh']) {
  const target = require('./messages/' + loc + '.json');
  function merge(src, dst) {
    for (const k of Object.keys(src)) {
      if (typeof src[k] === 'object' && src[k] !== null) {
        dst[k] = dst[k] ?? {};
        merge(src[k], dst[k]);
      } else if (!(k in dst)) {
        dst[k] = src[k]; // seed with English until translated
      }
    }
  }
  merge(en, target);
  require('fs').writeFileSync('./messages/' + loc + '.json', JSON.stringify(target, null, 2) + '\n');
}
"
```

- [ ] **Step 7: Commit**

```bash
git add "app/[locale]/(features)/bookings" components/booking messages/ app/api/bookings/create/route.ts
git commit -m "feat(i18n): translate /bookings flow and seed keys across locales"
```

---

## Task 9: Translate `/vip/*` pages

**Files (modify):**
- All `app/[locale]/(features)/vip/**/*.tsx` with customer-visible strings.
- `components/vip/*` that render hardcoded strings (e.g. `DashboardView.tsx`, `BookingCard.tsx`, `PackageCard.tsx`, etc.).
- `messages/en.json` — `vip` namespace.

Follow the same pattern as Task 8. VIP has more sub-routes (dashboard, bookings, packages, profile, link-account, membership), so plan a sub-namespace per sub-route:

```json
{
  "vip": {
    "dashboard": { ... },
    "bookings": { ... },
    "packages": { ... },
    "profile": { ... },
    "linkAccount": { ... },
    "membership": { ... }
  }
}
```

- [ ] **Step 1: Inventory**

```bash
grep -rn --include='*.tsx' -E '>[A-Z][a-zA-Z ]+<' "app/[locale]/(features)/vip" components/vip 2>/dev/null | wc -l
```
Noting the scale helps the agent decide pacing.

- [ ] **Step 2: Translate sub-route-by-sub-route**

For each sub-route (`dashboard` → `bookings` → `packages` → `profile` → `link-account` → `membership`):
1. Replace strings with `t()` calls using `useTranslations('vip.<sub>')`.
2. Add keys to `messages/en.json`.
3. Run `npm run dev`, navigate to that sub-route, visually verify.

- [ ] **Step 3: Handle `toLocaleDateString` calls**

Any `date.toLocaleDateString('en-US', ...)` must use next-intl formatters or pull locale from `useLocale()`. Example:
```tsx
import { useFormatter } from 'next-intl';
const format = useFormatter();
<span>{format.dateTime(new Date(booking.date), { dateStyle: 'long' })}</span>
```

- [ ] **Step 4: Mirror keys**

Run the same merge script as Task 8 Step 6 to seed the new keys into other locale files.

- [ ] **Step 5: Typecheck and smoke test**

```bash
npm run typecheck && npm run dev
```
Smoke-walk every VIP sub-route as a logged-in user. Stop the server.

- [ ] **Step 6: Commit**

```bash
git add "app/[locale]/(features)/vip" components/vip messages/
git commit -m "feat(i18n): translate /vip/* pages"
```

---

## Task 10: Translate auth, play-and-food, golf-club-rental

**Files (modify):**
- `app/[locale]/(features)/auth/**/*.tsx`
- `app/[locale]/play-and-food/**/*.tsx`
- `app/[locale]/golf-club-rental/**/*.tsx`
- `messages/en.json` — `auth`, `playAndFood`, `clubRental` namespaces.

- [ ] **Step 1: Translate `/auth/login/`**

Namespace: `auth.login`. Strings include: "Sign in with Google", "Sign in with Facebook", "Continue with LINE", "Continue as Guest", any legal text, any error messages. Use `useTranslations('auth.login')`.

**Important:** keep NextAuth provider button labels translatable but keep the provider IDs (`google`, `facebook`, `line`) hard-coded.

- [ ] **Step 2: Translate `/play-and-food/`**

Namespace: `playAndFood`. Walk the page once in dev to catch all strings.

- [ ] **Step 3: Translate `/golf-club-rental/`**

Namespace: `clubRental`. Same approach.

- [ ] **Step 4: Mount `LanguageSwitcher` on the auth/login screen**

Auth pages typically don't share the main booking header. Add `<LanguageSwitcher />` to the login page (top-right corner). Anon users must be able to pick a language before signing in.

- [ ] **Step 5: Mirror keys, typecheck, smoke-test, commit**

```bash
# mirror via the merge script from Task 8
npm run typecheck && npm run dev  # verify each page, stop dev server
git add "app/[locale]/(features)/auth" "app/[locale]/play-and-food" "app/[locale]/golf-club-rental" messages/
git commit -m "feat(i18n): translate auth, play-and-food, golf-club-rental pages"
```

---

## Task 11: Email templates

**Files:**
- Modify: `lib/emailService.ts`
- Modify: `messages/en.json` — `emails.*` namespace
- Modify: every caller of `sendConfirmationEmail` / `sendReviewRequest` / account emails (grep to find them)

- [ ] **Step 1: Inventory email senders and current strings**

```bash
grep -rn "sendConfirmationEmail\|sendReviewRequest\|sendAccountLinkEmail" lib/ app/ 2>/dev/null
```
Note each call site — these will all need to pass `language`.

- [ ] **Step 2: Author keys in `messages/en.json`**

Add under `emails.bookingConfirmation`:
```json
{
  "emails": {
    "bookingConfirmation": {
      "subject": "LENGOLF Booking Confirmation — {date} at {time}",
      "greeting": "Hi {name},",
      "intro": "Your booking is confirmed. Here are the details:",
      "dateLabel": "Date",
      "timeLabel": "Time",
      "durationLabel": "Duration",
      "durationValue": "{hours, plural, =1 {# hour} other {# hours}}",
      "bayLabel": "Bay",
      "peopleLabel": "Guests",
      "manageBookingsCta": "Manage your bookings",
      "footer": "See you soon at LENGOLF.",
      "clubRentalNote": "Golf club rental: {setName}"
    },
    "reviewRequest": {
      "subject": "How was your LENGOLF session?",
      "greeting": "Hi {name},",
      "body": "Thanks for visiting LENGOLF. Would you take a moment to leave us a review?",
      "reviewCta": "Leave a review"
    },
    "linkAccount": {
      "subject": "LENGOLF — link your account",
      "greeting": "Hi,",
      "body": "Click below to link your account.",
      "linkCta": "Link account"
    }
  }
}
```

- [ ] **Step 3: Refactor `lib/emailService.ts`**

Add `language: Locale` to each email function. Example for `sendConfirmationEmail`:
```ts
import { createTranslator } from 'next-intl';
import enMessages from '@/messages/en.json';
import thMessages from '@/messages/th.json';
import koMessages from '@/messages/ko.json';
import jaMessages from '@/messages/ja.json';
import zhMessages from '@/messages/zh.json';
import type { Locale } from '@/i18n/routing';

const messagesByLocale: Record<Locale, unknown> = {
  en: enMessages,
  th: thMessages,
  ko: koMessages,
  ja: jaMessages,
  zh: zhMessages,
};

interface EmailConfirmation {
  // ...existing fields...
  language?: Locale;
}

export async function sendConfirmationEmail(booking: EmailConfirmation) {
  const locale: Locale = booking.language ?? 'en';
  const t = createTranslator({
    locale,
    messages: messagesByLocale[locale],
    namespace: 'emails.bookingConfirmation',
  });

  const subject = t('subject', { date: booking.date, time: booking.startTime });
  const html = `
    <p>${t('greeting', { name: escapeHtml(booking.userName) })}</p>
    <p>${t('intro')}</p>
    <ul>
      <li><strong>${t('dateLabel')}:</strong> ${booking.date}</li>
      <li><strong>${t('timeLabel')}:</strong> ${booking.startTime}–${booking.endTime}</li>
      <li><strong>${t('durationLabel')}:</strong> ${t('durationValue', { hours: booking.duration })}</li>
      ${booking.bayNumber ? `<li><strong>${t('bayLabel')}:</strong> ${escapeHtml(booking.bayNumber)}</li>` : ''}
      <li><strong>${t('peopleLabel')}:</strong> ${booking.numberOfPeople}</li>
    </ul>
    <p><a href="${vipBookingsUrl}">${t('manageBookingsCta')}</a></p>
    <p>${t('footer')}</p>
  `;

  await transporter.sendMail({
    from: process.env.EMAIL_USER,
    to: booking.email,
    subject,
    html,
  });
}
```
Apply the same pattern to `sendReviewRequest` and any account emails.

- [ ] **Step 4: Update callers**

Every call site grep'd in Step 1 must pass `language`. Resolution rules:
- Booking confirmation + review request → read `bookings.language` from DB.
- Account/link emails → read `customers.preferred_language`, fallback `'en'`.

Example for the booking-create flow:
```ts
await sendConfirmationEmail({
  // ...existing args...
  language: (language && isValidLocale(language)) ? language : 'en',
});
```

- [ ] **Step 5: Typecheck**

```bash
npm run typecheck
```
Expected: all caller sites are satisfied. Any "missing required arg" error means a caller was overlooked.

- [ ] **Step 6: Smoke test**

In a dev environment, book a bay and verify the confirmation email arrives with English content. Then switch language to Thai, book again, verify subject line + body use Thai keys (still English strings until Task 12 — but the template resolves through Thai catalog).

- [ ] **Step 7: Mirror keys and commit**

```bash
# merge script from Task 8
git add lib/emailService.ts messages/ app/api/bookings/create/route.ts # + any other callers
git commit -m "feat(i18n): translate email templates via createTranslator"
```

---

## Task 12: Seed non-English translations

**Files:**
- `messages/th.json`, `messages/ko.json`, `messages/ja.json`, `messages/zh.json`

- [ ] **Step 1: Copy overlapping keys from `lengolf-website`**

For keys that exist in both catalogs (common buttons, nav labels), copy values from `C:\vs_code\lengolf-website\messages\{locale}.json`. Overlap is mostly in `common`, `nav`, `errors`.

Do this manually per locale — the key shapes differ between projects. Open both files side-by-side and pull over strings where the semantics match.

- [ ] **Step 2: Fill remaining keys**

For booking/vip/auth/playAndFood/clubRental/emails keys that don't overlap, translate using a combination of:
- **DeepL API** (good for Thai, Japanese, Korean)
- **Native-speaker review** for marketing copy (brand voice matters)
- Keep ICU placeholders (`{name}`, `{date}`) intact in every translation.

- [ ] **Step 3: Typecheck with strict message typing**

Add `global.d.ts` (or append to existing) to lock message shape to `en.json`:
```ts
import type messages from './messages/en.json';

declare module 'next-intl' {
  interface AppConfig {
    Messages: typeof messages;
  }
}
```

Run:
```bash
npm run typecheck
```
Expected: any locale file missing a key from `en.json` produces a TS error. Fix by adding the missing key to that locale.

- [ ] **Step 4: Per-locale smoke test**

For each of `th`, `ko`, `ja`, `zh`:
1. Start dev server.
2. Visit `/` — verify root redirect works.
3. Visit `/{locale}/bookings` — click through date/time/bay/details.
4. Sign in → visit `/{locale}/vip/dashboard`.
5. Switch language back and forth; confirm cookie persists after reload.

Note any untranslated strings or layout issues (e.g. Thai text overflowing a button). Fix and re-run.

- [ ] **Step 5: Commit**

```bash
git add messages/ global.d.ts
git commit -m "feat(i18n): seed Thai/Korean/Japanese/Chinese message catalogs"
```

---

## Task 13: LIFF persist-language handoff (phase-2 stepping stone)

**Files:**
- Modify: `app/api/liff/language/route.ts`
- Modify: `lib/liff/translations.ts` — delete `isValidLanguage` if fully replaced, or keep as compat shim

The existing `/api/liff/language` POST route does its own DB update. Refactor it to call `persistCustomerLanguage` from Task 5. This keeps LIFF behavior identical while consolidating the DB write path ahead of phase 2.

- [ ] **Step 1: Refactor the route**

Replace the body of `app/api/liff/language/route.ts` with:
```ts
import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/utils/supabase/admin';
import { appCache } from '@/lib/cache';
import { persistCustomerLanguage } from '@/lib/i18n/persist-language';
import { isValidLocale } from '@/i18n/routing';

export async function POST(request: NextRequest) {
  try {
    const { lineUserId, language } = await request.json();

    if (!lineUserId || typeof lineUserId !== 'string') {
      return NextResponse.json({ error: 'lineUserId is required' }, { status: 400 });
    }

    if (!language || !isValidLocale(language)) {
      return NextResponse.json(
        { error: 'Invalid language. Must be one of: en, th, ja, zh, ko' },
        { status: 400 }
      );
    }

    // Look up profile via admin client (LIFF has no NextAuth session).
    const admin = createAdminClient();
    const { data: profile, error: profileError } = await admin
      .from('profiles')
      .select('id, customer_id')
      .eq('provider', 'line')
      .eq('provider_id', lineUserId)
      .maybeSingle();

    if (profileError) {
      console.error('[LIFF Language] Profile query error:', profileError);
      return NextResponse.json({ error: 'Database error' }, { status: 500 });
    }

    if (!profile?.customer_id) {
      return NextResponse.json({ success: false, reason: 'no_customer' });
    }

    const result = await persistCustomerLanguage({
      customerId: profile.customer_id,
      locale: language,
    });
    if (!result.ok) {
      return NextResponse.json({ error: result.reason }, { status: 500 });
    }

    appCache.del(`booking_user_${lineUserId}`);
    appCache.del(`membership_data_${lineUserId}`);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[LIFF Language] Unexpected error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
```

**Note:** `persistCustomerLanguage` uses `createServerClient()` (service-role). The LIFF route used `createAdminClient()` before. Confirm these are equivalent in this codebase; if `createAdminClient()` is a distinct helper with different behavior, extend `persistCustomerLanguage` to accept a client factory, or create a `persistCustomerLanguageAdmin` variant. Check:
```bash
grep -n "createAdminClient\|createServerClient" utils/supabase/*.ts
```

- [ ] **Step 2: Typecheck**

```bash
npm run typecheck
```

- [ ] **Step 3: Manual smoke test**

Hit a LIFF page in dev, trigger the language save, verify `customers.preferred_language` updates and LIFF UI still picks up the change on reload.

- [ ] **Step 4: Commit**

```bash
git add app/api/liff/language/route.ts
git commit -m "refactor(i18n): have LIFF language endpoint reuse persistCustomerLanguage"
```

---

## Task 14: End-to-end verification gate

**Files:**
- None (verification only)

- [ ] **Step 1: Full typecheck + build**

```bash
npm run typecheck && npm run lint && npm run build
```
Expected: all three pass.

- [ ] **Step 2: Per-locale manual E2E checklist**

For each locale `L ∈ {en, th, ko, ja, zh}`:

- [ ] Visit `/` (if `L !== en`, manually set `NEXT_LOCALE=L` cookie first or click the switcher from `/`). Verify redirect to `/bookings` (or `/{L}/bookings`).
- [ ] Complete a booking end-to-end (pick date, time, bay, fill details, confirm).
- [ ] Receive confirmation email; verify subject + body are in locale `L`.
- [ ] Sign in, visit `/{L}/vip/dashboard`; verify all text.
- [ ] Open `/{L}/vip/bookings`, `/{L}/vip/packages`, `/{L}/vip/profile` — no English fallback leaks.
- [ ] Switch language via `LanguageSwitcher`; reload page; verify persistence.
- [ ] For a logged-in user, change language, sign out, sign back in, verify `customers.preferred_language` (check in Supabase) equals the chosen locale.

- [ ] **Step 3: Regression checks**

- [ ] English URLs (`/bookings`, `/vip/dashboard`) work unprefixed — no redirect to `/en/...`.
- [ ] LIFF pages (`/liff/booking`, `/liff/membership`, `/liff/contact`) work unchanged.
- [ ] `/api/*` routes unaffected (test one: `curl http://localhost:3000/api/availability?date=2026-04-20`).
- [ ] OAuth callback URLs unchanged (`/api/auth/callback/google` etc.).
- [ ] Existing deep links in email templates (e.g. `booking.len.golf/vip/bookings/<id>`) still resolve for English users.

- [ ] **Step 4: Add brief notes to CLAUDE.md under a new "Main-site i18n" section**

Append to `CLAUDE.md`:
```markdown
## Main-site i18n

- 5 locales: `en` (default, unprefixed), `th`, `ko`, `ja`, `zh`.
- Config in `i18n/routing.ts`; message files in `messages/{locale}.json`.
- Locale-aware navigation via `@/i18n/navigation` (`Link`, `useRouter`, `usePathname`).
- `useTranslations('namespace')` in client components; `getTranslations('namespace')` in server components.
- `LanguageSwitcher` at `components/shared/LanguageSwitcher.tsx` writes cookie + mirrors to `customers.preferred_language` via `POST /api/user/language`.
- Emails: `emailService.ts` takes `language: Locale`; booking-derived emails read `bookings.language`, account emails read `customers.preferred_language`.
- LIFF pages are **not** migrated (phase 2). They still use `lib/liff/translations.ts` and share the DB persistence path via `persistCustomerLanguage`.
```

- [ ] **Step 5: Commit and open PR**

```bash
git add CLAUDE.md
git commit -m "docs: document main-site i18n setup"
```
Open the PR summarizing all 14 tasks. Reference the spec and this plan.

---

## Self-Review Notes

**Spec coverage:**
- §1 Routing ✓ (Task 1, 2, 3)
- §2 Middleware ✓ (Task 3)
- §3 Locale resolution ✓ (Task 3 handles URL + cookie; Task 6 handles authenticated DB read via login-time redirect triggered by `persistCustomerLanguage` write — see note below)
- §4 Message catalog ✓ (Tasks 4, 8–11)
- §5 LanguageSwitcher ✓ (Task 7)
- §6 Shared helper ✓ (Task 5)
- §7 Emails ✓ (Task 11)
- §8 Formatting ✓ (Task 8 Step 3, Task 9 Step 3)
- §9 Migration order ✓ (Tasks 1–14 mirror the ordering)
- §10 Testing ✓ (Task 5 Jest, Task 14 E2E)
- §11 Rollout ✓ (one commit per task; each independently deployable up to Task 12)

**Gap / clarification:** Spec §3 calls for "one-shot read of `customers.preferred_language` on session start; write into cookie and redirect." This plan handles the **write** direction (switcher → DB) but doesn't explicitly implement the **read** direction (DB → cookie on first post-login request). If you want that, add a Task 7.5 that, in the NextAuth `signIn` callback or a server-side hook in the locale layout, reads the user's preferred_language and sets the `NEXT_LOCALE` cookie when missing. Recommended: add this to the session callback in `app/api/auth/options.ts` so every authenticated request can trust the cookie. Flagging for the implementing agent to decide whether to implement as a sub-task or defer.

**Placeholder scan:** no TBDs. All code blocks contain real code. Translation content in Task 12 is the only "human work" step — by design.

**Type consistency:** `Locale` from `@/i18n/routing` used everywhere. `persistCustomerLanguage` signature stable across Tasks 5, 6, 13.
