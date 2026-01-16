import { NextResponse } from 'next/server';
import { getToken } from 'next-auth/jwt';
import type { NextRequest } from 'next/server';

// Bot detection removed - Cloudflare handles DDoS protection and bot management

export async function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;

  // Allow access to public routes immediately
  if (
    pathname.startsWith('/api/auth') ||
    pathname.startsWith('/auth') ||
    pathname.startsWith('/images/') ||
    pathname.startsWith('/_next/') ||
    pathname.includes('/favicon.')
  ) {
    return NextResponse.next();
  }

  // Redirect root to bookings
  if (pathname === '/') {
    return NextResponse.redirect(new URL('/bookings', request.url));
  }

  try {
    // Check for NextAuth session token
    const token = await getToken({
      req: request,
      secret: process.env.NEXTAUTH_SECRET,
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
     * Match only bookings routes and exclude more static files
     * Removed: API routes, auth routes, static assets, manifest files
     */
    '/((?!api|_next|auth|images|favicon|robots.txt|site.webmanifest|apple-touch-icon|web-app-manifest|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|txt|xml|json)$).*)',
  ],
}; 