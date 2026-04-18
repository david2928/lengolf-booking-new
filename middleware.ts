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

  // /auth/* (e.g. /auth/error registered with OAuth providers) must NOT be
  // localized — the exact URL is what providers call back to. Skip both
  // next-intl and the rewrite logic.
  if (pathname.startsWith('/auth/')) {
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

  // Root URL must serve the bookings page for every locale.
  // Handle this BEFORE next-intl so we directly rewrite to the locale-prefixed
  // bookings path. (Inspecting next-intl's `x-middleware-rewrite` header is
  // brittle; checking the original pathname is cleaner.)
  const bare = stripLocale(pathname);
  if (bare === '/') {
    const localePrefixMatch = pathname.match(/^\/(en|th|ko|ja|zh)(?=\/|$)/);
    const prefix = localePrefixMatch ? localePrefixMatch[0] : '';
    const url = request.nextUrl.clone();
    url.pathname = `${prefix}/bookings`;
    return NextResponse.rewrite(url);
  }

  // Delegate locale resolution, cookie handling, and redirects to next-intl.
  const intlResponse = intlMiddleware(request);

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
