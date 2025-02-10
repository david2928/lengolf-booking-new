import { createClient } from '@/utils/supabase/server'
import { NextResponse } from 'next/server'
import { debug } from '@/lib/debug'

export async function GET(request: Request) {
  const requestUrl = new URL(request.url)
  const code = requestUrl.searchParams.get('code')
  const appUrl = process.env.NEXT_PUBLIC_APP_URL
  
  debug.log('🔄 Processing Google OAuth callback with code:', code)

  if (code) {
    try {
      const supabase = await createClient()
      
      // Exchange code for session
      const { data: { user, session }, error } = await supabase.auth.exchangeCodeForSession(code)
      
      debug.log('Session exchange result:', { user: !!user, session: !!session, error: error?.message })
      
      if (error || !session) {
        debug.error('❌ Error exchanging code for session:', error?.message || 'No session returned')
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

      // Create response with redirect
      const response = NextResponse.redirect(`${appUrl}/bookings`)

      // Set auth cookie
      const authCookie = request.headers.get('cookie')
      if (authCookie) {
        response.headers.set('set-cookie', authCookie)
      }

      debug.log('✅ Successfully authenticated with Google, redirecting to bookings')
      return response
    } catch (error) {
      debug.error('❌ Unexpected error during callback:', error)
      return NextResponse.redirect(`${appUrl}/auth/login?error=unexpected_error`)
    }
  }

  debug.error('❌ No code provided in Google callback')
  return NextResponse.redirect(`${appUrl}/auth/login?error=no_code`)
} 