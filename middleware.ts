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

export async function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;

  // LIFF routes: skip locale handling and auth entirely
  if (pathname.startsWith('/liff')) {
    return NextResponse.next();
  }

  // /auth/error is outside the [locale] segment (registered as OAuth callback
  // URL) — the exact URL is what providers call back to. Don't let next-intl
  // localize it. All other /auth/* paths (login, etc.) live under
  // app/[locale]/(features)/auth/ and SHOULD be locale-handled.
  if (pathname === '/auth/error' || pathname.startsWith('/auth/error/')) {
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

  // Let next-intl handle locale resolution + cookie redirects first.
  const intlResponse = intlMiddleware(request);

  // If next-intl issued a redirect (status 3xx, e.g. cookie-driven `/` → `/th`),
  // pass it through unchanged. The browser will make a follow-up request to
  // `/th`, where this middleware fires again, sees a bare locale, and rewrites
  // to `/th/bookings` below.
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
  // rewrite it to the bookings page for that locale.
  const bareEffective = stripLocale(effectivePath);
  if (bareEffective === '/') {
    const localePrefixMatch = effectivePath.match(/^\/(en|th|ko|ja|zh)(?=\/|$)/);
    const prefix = localePrefixMatch ? localePrefixMatch[0] : '';
    const url = request.nextUrl.clone();
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
