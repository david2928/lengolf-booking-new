import { type NextRequest } from 'next/server'
import { updateSession } from '@/utils/supabase/middleware'
import { NextResponse } from 'next/server'

export async function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname

  try {
    // Redirect root to login
    if (pathname === '/') {
      return NextResponse.redirect(new URL('/auth/login', request.url))
    }

    // Allow access to public routes immediately
    if (
      pathname.startsWith('/api/availability') ||
      pathname.startsWith('/api') || 
      pathname.startsWith('/auth') || 
      pathname.startsWith('/images/') || 
      pathname.startsWith('/_next/') || 
      pathname.includes('/favicon.')
    ) {
      return await updateSession(request)
    }

    // For /bookings routes, check if it's a guest session
    if (pathname.startsWith('/bookings')) {
      const isGuest = request.cookies.get('guest_session')
      if (isGuest) {
        return await updateSession(request)
      }
    }

    // Update the session and get the response
    return await updateSession(request)
  } catch (error) {
    // For errors, still allow access to booking routes
    if (pathname.startsWith('/bookings')) {
      return await updateSession(request)
    }
    throw error
  }
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
} 