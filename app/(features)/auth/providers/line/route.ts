import { NextResponse } from 'next/server'
import { debug } from '@/lib/debug'
import { createClient } from '@/utils/supabase/server'

// Generate a random state string for security
function generateState() {
  const array = new Uint32Array(8)
  crypto.getRandomValues(array)
  return Array.from(array, dec => ('0' + dec.toString(16)).substr(-2)).join('')
}

export async function GET(request: Request) {
  const supabase = await createClient()
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://lengolf-booking-new-ej6pn7llcq-as.a.run.app'
  debug.log('🔄 Starting LINE OAuth flow')
  debug.log('📌 Environment check:', {
    NODE_ENV: process.env.NODE_ENV,
    APP_URL: process.env.NEXT_PUBLIC_APP_URL,
    LINE_REDIRECT_URI: process.env.NEXT_PUBLIC_LINE_REDIRECT_URI,
    FINAL_URL: appUrl
  })

  // Generate and store state
  const state = generateState()
  
  // LINE OAuth parameters
  const redirectUri = process.env.NEXT_PUBLIC_LINE_REDIRECT_URI || `${appUrl}/auth/callback/line`
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: process.env.NEXT_PUBLIC_LINE_CLIENT_ID!,
    redirect_uri: redirectUri,
    state: state,
    scope: 'profile openid email'
  })

  // Create the LINE authorization URL
  const url = `https://access.line.me/oauth2/v2.1/authorize?${params.toString()}`
  debug.log('📌 LINE OAuth URL:', url)
  debug.log('📌 Final redirect URI:', redirectUri)

  // Create response with state cookie
  const response = NextResponse.redirect(url)
  response.cookies.set('line_oauth_state', state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 60 * 5 // 5 minutes
  })

  return response
}

export async function POST() {
  debug.log('LINE OAuth not implemented yet')
  return NextResponse.redirect(
    new URL('/auth/login?error=not_implemented&error_description=LINE login is not available yet', process.env.NEXT_PUBLIC_APP_URL!)
  )
} 