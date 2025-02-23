import { NextResponse } from 'next/server';
import { getToken } from 'next-auth/jwt';
import type { NextRequest } from 'next/server';

// Rate limiting map
const ipRequestMap = new Map<string, { count: number; timestamp: number }>();
const RATE_LIMIT_WINDOW = 60 * 1000; // 1 minute
const MAX_REQUESTS_PER_WINDOW = 120; // 120 requests per minute (doubled from before)

// Bot detection patterns
const BOT_USER_AGENTS = [
  /bot/i,
  /crawler/i,
  /spider/i,
  /crawling/i,
  /headless/i,
  /scraper/i,
  /python/i,
  /curl/i,
  /wget/i,
  /phantom/i,
  /selenium/i
];

// Suspicious behavior patterns
const SUSPICIOUS_PATTERNS = {
  noUserAgent: true,
  emptyReferer: true,
  multipleParallelRequests: true
};

function isBot(request: NextRequest): boolean {
  const userAgent = request.headers.get('user-agent') || '';
  const referer = request.headers.get('referer');
  const acceptLanguage = request.headers.get('accept-language');
  const acceptEncoding = request.headers.get('accept-encoding');

  // Only check for obvious bot patterns in user agent
  if (BOT_USER_AGENTS.some(pattern => pattern.test(userAgent))) {
    return true;
  }

  // Only block if no user agent at all
  if (!userAgent) {
    return true;
  }

  // Block if ALL headers are missing (likely a bot)
  if (!userAgent && !referer && !acceptLanguage && !acceptEncoding) {
    return true;
  }

  return false;
}

function shouldRateLimit(request: NextRequest): boolean {
  // Don't rate limit static assets or auth routes
  if (
    request.nextUrl.pathname.startsWith('/_next/') ||
    request.nextUrl.pathname.startsWith('/api/auth') ||
    request.nextUrl.pathname.startsWith('/auth') ||
    request.nextUrl.pathname.startsWith('/images/')
  ) {
    return false;
  }

  const ip = request.headers.get('x-forwarded-for')?.split(',')[0] || '';
  const now = Date.now();

  // Clean up old entries
  Array.from(ipRequestMap.entries()).forEach(([storedIp, data]) => {
    if (now - data.timestamp > RATE_LIMIT_WINDOW) {
      ipRequestMap.delete(storedIp);
    }
  });

  // Get or create rate limit data for this IP
  const rateData = ipRequestMap.get(ip) || { count: 0, timestamp: now };

  // Reset count if outside window
  if (now - rateData.timestamp > RATE_LIMIT_WINDOW) {
    rateData.count = 1;
    rateData.timestamp = now;
  } else {
    rateData.count++;
  }

  ipRequestMap.set(ip, rateData);

  return rateData.count > MAX_REQUESTS_PER_WINDOW;
}

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

  // Check for bots and rate limiting
  if (isBot(request)) {
    return new NextResponse('Access Denied', { status: 403 });
  }

  if (shouldRateLimit(request)) {
    return new NextResponse('Too Many Requests', { status: 429 });
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