import { NextResponse } from 'next/server';
import { getToken } from 'next-auth/jwt';
import type { NextRequest } from 'next/server';

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

  // Redirect root to login
  if (pathname === '/') {
    return NextResponse.redirect(new URL('/auth/login', request.url));
  }

  try {
    // Check for NextAuth session token
    const token = await getToken({
      req: request,
      secret: process.env.NEXTAUTH_SECRET,
    });

    // If no token and trying to access protected route, redirect to login
    if (!token && pathname.startsWith('/bookings')) {
      const callbackUrl = encodeURIComponent(request.nextUrl.pathname);
      return NextResponse.redirect(new URL(`/auth/login?callbackUrl=${callbackUrl}`, request.url));
    }

    return NextResponse.next();
  } catch (error) {
    console.error('Middleware error:', error);
    return NextResponse.redirect(new URL('/auth/login', request.url));
  }
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public files (images, etc.)
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}; 