import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'
import { NextResponse } from 'next/server'
import type { Database } from '@/app/types/supabase'
import { debug } from '@/lib/debug'
import { cookies } from 'next/headers'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  try {
    const requestUrl = new URL(request.url)
    const code = requestUrl.searchParams.get('code')
    const error = requestUrl.searchParams.get('error')
    const error_description = requestUrl.searchParams.get('error_description')

    debug.log('Auth Callback: Processing request', { 
      hasCode: !!code,
      url: requestUrl.toString(),
      searchParams: Object.fromEntries(requestUrl.searchParams.entries())
    })

    if (error || error_description) {
      debug.error('Auth Callback: OAuth error', { error, error_description })
      return NextResponse.redirect(
        new URL(`/auth/login?error=${error || 'oauth_error'}&error_description=${error_description || 'Authentication failed'}`, request.url)
      )
    }

    if (!code) {
      debug.error('Auth Callback: No code provided', {
        headers: Object.fromEntries(request.headers),
        url: request.url
      })
      return NextResponse.redirect(
        new URL('/auth/login?error=no_code_provided&error_description=No authorization code received', request.url)
      )
    }

    // Create a Supabase client using route handler client with awaited cookies
    const cookieStore = cookies()
    const supabase = createRouteHandlerClient<Database>({ 
      cookies: () => cookieStore 
    })

    // Exchange the code for a session
    debug.log('Auth Callback: Exchanging code for session')
    const { data: { session }, error: sessionError } = await supabase.auth.exchangeCodeForSession(code)
    
    if (sessionError) {
      debug.error('Auth Callback: Error exchanging code', sessionError)
      return NextResponse.redirect(
        new URL(`/auth/login?error=auth_error&error_description=${encodeURIComponent(sessionError.message)}`, request.url)
      )
    }

    if (!session) {
      debug.error('Auth Callback: No session returned after code exchange')
      return NextResponse.redirect(
        new URL('/auth/login?error=no_session&error_description=No session returned after authentication', request.url)
      )
    }

    debug.log('Auth Callback: Successfully exchanged code', { 
      hasSession: !!session,
      provider: session.user?.app_metadata?.provider,
      email: session.user?.email,
      sessionExpiry: new Date(session.expires_at! * 1000).toISOString()
    })

    // Create response with redirect
    const response = NextResponse.redirect(new URL('/bookings', request.url))

    // Ensure cookies are properly set in the response
    await supabase.auth.setSession(session)

    return response
  } catch (error) {
    debug.error('Auth Callback: Unexpected error', error)
    return NextResponse.redirect(
      new URL('/auth/login?error=auth_error&error_description=An unexpected error occurred', request.url)
    )
  }
} 