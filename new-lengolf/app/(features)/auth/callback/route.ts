import { createClient } from '@/utils/supabase/server'
import { NextResponse } from 'next/server'
import { debug } from '@/lib/debug'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const requestUrl = new URL(request.url)
  const code = requestUrl.searchParams.get('code')
  
  debug.log('🔄 Processing OAuth callback with code:', code)

  if (code) {
    const supabase = await createClient()
    
    // Exchange code for session
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    
    if (error) {
      debug.error('❌ Error exchanging code for session:', error.message)
      return NextResponse.redirect(`${requestUrl.origin}/auth/login?error=session_error`)
    }

    debug.log('✅ Successfully authenticated with OAuth provider')
    return NextResponse.redirect(`${requestUrl.origin}/bookings`)
  }

  debug.error('❌ No code provided in callback')
  return NextResponse.redirect(`${requestUrl.origin}/auth/login?error=no_code`)
} 