import { NextResponse } from 'next/server';
import { getToken } from 'next-auth/jwt';
import type { NextRequest } from 'next/server';
import { getLocaleFromSearchParams, detectLocaleFromHeaders } from './lib/i18n/config';

// Rate limiting map
const ipRequestMap = new Map<string, { count: number; timestamp: number }>();
const RATE_LIMIT_WINDOW = 60 * 1000; // 1 minute
const MAX_REQUESTS_PER_WINDOW = 120; // 120 requests per minute (doubled from before)

// Bot detection patterns
const BOT_USER_AGENTS = [
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

// Allowed bots (these bots should be allowed to access the site)
const ALLOWED_BOTS = [
  /googlebot/i,
  /google-adsbot/i,
  /adsbot-google/i,
  /mediapartners-google/i,
  /google web preview/i,
  /google favicon/i,
  /adsbot/i,           // Additional Google Ads bots
  /adspreview/i,       // Google Ads Preview and Diagnosis tool
  /google-adwords/i,   // Google AdWords
  /google-shopping/i,  // Google Shopping
  /google-xrawler/i,   // Google ad verification
  /adservice.google/i  // Google Ad Service
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

  // Check if it's an allowed bot first - this has priority
  if (ALLOWED_BOTS.some(pattern => pattern.test(userAgent))) {
    return false; // Allow these bots to access the site
  }

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
  const userAgent = request.headers.get('user-agent') || '';

  // Allow access to public routes immediately
  if (
    pathname.startsWith('/api/auth') ||
    pathname.startsWith('/api/admin') || // Allow admin API routes
    pathname.startsWith('/auth') ||
    pathname.startsWith('/images/') ||
    pathname.startsWith('/_next/') ||
    pathname.includes('/favicon.')
  ) {
    return NextResponse.next();
  }

  // Handle locale detection and add to request headers
  const searchParams = new URLSearchParams(request.nextUrl.search);
  let locale = getLocaleFromSearchParams(searchParams);
  
  // If no lang param, detect from browser headers for first visit
  if (!searchParams.get('lang')) {
    const acceptLanguage = request.headers.get('accept-language') || '';
    if (acceptLanguage.includes('th')) {
      locale = 'th';
      
      // Only redirect to add lang param for main pages, not API routes
      if (!pathname.startsWith('/api/')) {
        const url = new URL(request.url);
        url.searchParams.set('lang', 'th');
        return NextResponse.redirect(url);
      }
    }
  }

  // Add locale to request headers for server components
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-locale', locale);

  const response = NextResponse.next({
    request: {
      headers: requestHeaders,
    },
  });

  // Check for bots and rate limiting
  if (isBot(request)) {
    return new NextResponse('Access Denied', { status: 403 });
  }

  if (shouldRateLimit(request)) {
    return new NextResponse('Too Many Requests', { status: 429 });
  }

  // Special handling for Google Ads bots
  const isGoogleAdsBot = ALLOWED_BOTS.some(pattern => pattern.test(userAgent));
  
  // Redirect root to login UNLESS it's a Google Ads bot
  if (pathname === '/' && !isGoogleAdsBot) {
    const url = new URL('/bookings', request.url);
    // Preserve lang param if it exists
    if (searchParams.get('lang')) {
      url.searchParams.set('lang', searchParams.get('lang')!);
    }
    return NextResponse.redirect(url);
  }
  
  // Allow Google Ads bots to access any page without authentication
  if (isGoogleAdsBot) {
    return response;
  }

  try {
    // Check for NextAuth session token
    const token = await getToken({
      req: request,
      secret: process.env.NEXTAUTH_SECRET,
    });

    return response;
  } catch (error) {
    console.error('Middleware error:', error);
    const loginUrl = new URL('/auth/login', request.url);
    // Preserve lang param
    if (searchParams.get('lang')) {
      loginUrl.searchParams.set('lang', searchParams.get('lang')!);
    }
    return NextResponse.redirect(loginUrl);
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