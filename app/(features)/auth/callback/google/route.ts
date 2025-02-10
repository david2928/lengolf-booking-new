import { createClient } from '@/utils/supabase/server'
import { NextResponse } from 'next/server'
import { debug } from '@/lib/debug'

export async function GET(request: Request) {
  const requestUrl = new URL(request.url)
  const code = requestUrl.searchParams.get('code')
  const appUrl = process.env.NEXT_PUBLIC_APP_URL
  
  debug.log('🔄 Processing Google OAuth callback with code:', code)

  if (code) {
    const supabase = await createClient()
    
    // Exchange code for session
    const { data: { user }, error } = await supabase.auth.exchangeCodeForSession(code)
    
    if (error) {
      debug.error('❌ Error exchanging code for session:', error.message)
      return NextResponse.redirect(`${appUrl}/auth/login?error=google_login_failed`)
    }

    // Update profile
    if (user) {
      const { error: profileError } = await supabase
        .from('profiles')
        .upsert({
          id: user.id,
          display_name: user.user_metadata.name || user.user_metadata.full_name,
          picture_url: user.user_metadata.avatar_url,
          provider: 'google',
          updated_at: new Date().toISOString()
        })

      if (profileError) {
        debug.error('Failed to update profile:', profileError)
      }
    }

    debug.log('✅ Successfully authenticated with Google')
    return NextResponse.redirect(`${appUrl}/bookings`)
  }

  debug.error('❌ No code provided in Google callback')
  return NextResponse.redirect(`${appUrl}/auth/login?error=no_code`)
} 