import { NextResponse } from 'next/server';
import { getToken } from 'next-auth/jwt';
import createIntlMiddleware from 'next-intl/middleware';
import type { NextRequest } from 'next/server';
import { routing } from './i18n/routing';

const intlMiddleware = createIntlMiddleware(routing);

// Detect LINE in-app browser from User-Agent header
function isLineBrowser(request: NextRequest): boolean {
  const ua = request.headers.get('user-agent')?.toLowerCase() ?? '';
  return ua.includes('line/') || ua.includes('line ');
}

// Map regular routes to LIFF equivalents for LINE browser users
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

// Extract a leading locale prefix (e.g. `/th`) from a pathname, or '' if none.
function localePrefix(pathname: string): string {
  const match = pathname.match(/^\/(en|th|ko|ja|zh)(?=\/|$)/);
  return match ? match[0] : '';
}

export async function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;

  // LIFF routes: skip locale handling and auth entirely
  if (pathname.startsWith('/liff')) {
    return NextResponse.next();
  }

  // Customer preference center: public + tokenized, lives outside [locale].
  // Must bypass NextAuth + next-intl entirely so the unsubscribe link in any
  // future email keeps working without a session and without locale rewrites.
  if (
    pathname === '/preferences' ||
    pathname.startsWith('/preferences/') ||
    pathname.startsWith('/api/preferences/')
  ) {
    return NextResponse.next();
  }

  // /auth/error is outside the [locale] segment (registered as OAuth callback
  // URL) — the exact URL is what providers call back to. Don't let next-intl
  // localize it. All other /auth/* paths (login, etc.) live under
  // app/[locale]/(features)/auth/ and SHOULD be locale-handled.
  // NOTE: this skip MUST run before the LINE-UA redirect below — otherwise a
  // LINE user whose OAuth fails would get bounced to /liff/* and trapped in a
  // redirect loop instead of seeing the error page.
  if (pathname === '/auth/error' || pathname.startsWith('/auth/error/')) {
    return NextResponse.next();
  }

  // Opn-cutover compatibility: /payment/start was the ShopeePay hand-off
  // page (its <HandoffClient> minted a ShopeePay order). On the Opn flow the
  // customer pays inline at /payment/checkout, so /payment/start must never
  // be reachable — landing there could create a mismatched ShopeePay order.
  // Redirect at the edge (a real 307, preserving locale prefix + ?ref=...),
  // NOT via a page-level redirect() — that one renders a cached meta-refresh
  // (x-nextjs-cache HIT) which risks serving one rental's ref to another.
  // /payment/start is only ever a payment ENTRY page (never a ShopeePay
  // return_url, which is /payment/result), so redirecting it is always safe.
  if (stripLocale(pathname) === '/payment/start') {
    const url = request.nextUrl.clone();
    url.pathname = `${localePrefix(pathname)}/payment/checkout`;
    // url.search (the ?ref=... query) is preserved by the clone.
    return NextResponse.redirect(url, 307);
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

  // Let next-intl handle locale resolution + cookie redirects first.
  const intlResponse = intlMiddleware(request);

  // If next-intl issued a redirect (status 3xx, e.g. cookie-driven `/` → `/th`),
  // pass it through unchanged. The browser will make a follow-up request to
  // `/th`, where this middleware fires again, sees a bare non-default locale,
  // and issues a second 308 to `/th/bookings` (handled by the block below).
  if (intlResponse.status >= 300 && intlResponse.status < 400) {
    return intlResponse;
  }

  // next-intl rewrites locale-prefixed requests internally. Inspect the
  // rewritten target via the `x-middleware-rewrite` header (set by next-intl).
  // Fallback to the original pathname if the header is missing.
  const rewriteHeader = intlResponse.headers.get('x-middleware-rewrite');
  const effectivePath = rewriteHeader
    ? new URL(rewriteHeader).pathname
    : pathname;

  // If the effective path resolves to a bare locale root (`/`, `/th`, etc.),
  // route it to the bookings page for that locale. Two behaviors:
  //
  // - `/` (default locale): internal rewrite so the URL bar stays `/`. This
  //   is the long-standing root-rewrite behavior and works correctly because
  //   the default locale needs no prefix under `localePrefix: 'as-needed'`.
  //
  // - `/{locale}` (bare non-default locale, e.g. `/th`, `/ko`): 308 redirect
  //   to `/{locale}/bookings`. A rewrite here silently collapses the locale
  //   back to `en` downstream — bare-locale URLs rendered with
  //   `<html lang="en">` and English content. The redirect forces the browser
  //   to refetch the canonical `/{locale}/bookings` URL, which next-intl
  //   resolves correctly. Bonus: the URL bar becomes canonical and matches
  //   the hreflang alternates emitted for that locale.
  const bareEffective = stripLocale(effectivePath);
  if (bareEffective === '/') {
    const prefix = localePrefix(effectivePath);
    const url = request.nextUrl.clone();
    url.pathname = `${prefix}/bookings`;

    const originalIsBareNonDefaultLocale = routing.locales.some(
      (l) => l !== routing.defaultLocale && pathname === `/${l}`,
    );
    return originalIsBareNonDefaultLocale
      ? NextResponse.redirect(url, 308)
      : NextResponse.rewrite(url);
  }

  // NextAuth session check. A malformed/corrupted JWT cookie throws here —
  // when that happens, redirect to the login page (locale-aware) so the user
  // gets a clean re-auth flow instead of a silently logged-out experience.
  try {
    await getToken({
      req: request,
      secret: process.env.NEXTAUTH_SECRET,
      secureCookie: process.env.NODE_ENV === 'production',
    });
  } catch (error) {
    console.error('Middleware error:', error);
    const prefix = localePrefix(pathname);
    const url = request.nextUrl.clone();
    url.pathname = `${prefix}/auth/login`;
    return NextResponse.redirect(url);
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
    '/course-rental/:path*',
    '/payment/:path*',
    '/auth/:path*',
    '/liff/:path*',
    '/preferences/:path*',
    '/api/preferences/:path*',
  ],
};
