import { NextResponse } from 'next/server';
import { getToken } from 'next-auth/jwt';
import type { NextRequest } from 'next/server';

// Bot detection removed - Cloudflare handles DDoS protection and bot management

export async function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;

  // Redirect root to bookings
  if (pathname === '/') {
    return NextResponse.redirect(new URL('/bookings', request.url));
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