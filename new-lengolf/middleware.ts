import { createMiddlewareClient } from '@supabase/auth-helpers-nextjs'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { debug } from '@/lib/debug'

export async function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname
  try {
    const res = NextResponse.next()
    
    debug.log('Middleware: Processing request', { pathname })

    // Allow access to public routes immediately
    if (
      pathname.startsWith('/api/availability') ||  // Allow availability endpoint
      pathname.startsWith('/api') || 
      pathname.startsWith('/auth') || 
      pathname === '/' || 
      pathname.startsWith('/images/') || 
      pathname.startsWith('/_next/') || 
      pathname.includes('/favicon.')
    ) {
      debug.log('Middleware: Allowing access to public route', { pathname })
      return res
    }

    // Create supabase client
    const supabase = createMiddlewareClient({ req: request, res })

    debug.log('Middleware: Checking session...')
    const { data: { session }, error } = await supabase.auth.getSession()

    if (error) {
      debug.error('Middleware: Session error', error)
    }

    // For /bookings routes, check if it's a guest session
    if (pathname.startsWith('/bookings')) {
      const isGuest = request.cookies.get('guest_session')
      
      debug.log('Middleware: Checking booking access', {
        isGuest: !!isGuest,
        hasSession: !!session,
        pathname
      })

      // Allow access if it's a guest session or has valid session
      if (isGuest || session) {
        debug.log('Middleware: Allowing booking access', {
          reason: isGuest ? 'guest' : 'authenticated'
        })
        return res
      }
    }

    // For non-booking routes, require a valid session
    if (!session) {
      debug.warn('Middleware: No session found, redirecting to login')
      const redirectUrl = new URL('/auth/login', request.url)
      redirectUrl.searchParams.set('redirectTo', pathname)
      return NextResponse.redirect(redirectUrl)
    }

    debug.log('Middleware: Valid session found', { 
      userId: session.user.id,
      email: session.user.email,
      provider: session.user.app_metadata?.provider
    })

    return res
  } catch (error) {
    debug.error('Middleware: Error checking session', error)
    // For errors, still allow access to booking routes
    if (pathname.startsWith('/bookings')) {
      return NextResponse.next()
    }
    const redirectUrl = new URL('/auth/login', request.url)
    redirectUrl.searchParams.set('redirectTo', pathname)
    return NextResponse.redirect(redirectUrl)
  }
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
} 