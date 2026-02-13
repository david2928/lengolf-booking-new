import { NextResponse } from 'next/server';
import { getToken } from 'next-auth/jwt';
import type { NextRequest } from 'next/server';

// Bot detection removed - Cloudflare handles DDoS protection and bot management

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

export async function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;

  // LINE browser users: redirect to LIFF pages (skip if already on /liff/)
  if (isLineBrowser(request) && !pathname.startsWith('/liff')) {
    // Check exact match first, then prefix match for nested routes
    const liffRoute =
      LIFF_ROUTE_MAP[pathname] ??
      (pathname.startsWith('/bookings') ? '/liff/booking' : null) ??
      (pathname.startsWith('/vip') ? '/liff/membership' : null);

    if (liffRoute) {
      return NextResponse.redirect(new URL(liffRoute, request.url));
    }
  }

  // Redirect root to bookings (non-LINE browsers)
  if (pathname === '/') {
    return NextResponse.redirect(new URL('/bookings', request.url));
  }

  // LIFF pages don't need NextAuth session validation
  if (pathname.startsWith('/liff')) {
    return NextResponse.next();
  }

  try {
    // Check for NextAuth session token
    const token = await getToken({
      req: request,
      secret: process.env.NEXTAUTH_SECRET,
      secureCookie: process.env.NODE_ENV === 'production',
    });

    return NextResponse.next();
  } catch (error) {
    console.error('Middleware error:', error);
    return NextResponse.redirect(new URL('/auth/login', request.url));
  }
}

export const config = {
  matcher: [
    /*
     * Only match routes that actually need middleware processing.
     * Using explicit positive matching instead of complex negative lookahead.
     * This eliminates edge function invocations for static assets entirely.
     */
    '/',
    '/bookings/:path*',
    '/vip/:path*',
    '/liff/:path*',
  ],
}; 