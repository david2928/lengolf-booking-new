import { createClient } from '@/utils/supabase/server'
import { redirect } from 'next/navigation'
import { debug } from '@/lib/debug'

export async function POST() {
  const supabase = await createClient()
  const appUrl = process.env.NEXT_PUBLIC_APP_URL
  debug.log('🔄 Starting Google OAuth flow')
  debug.log('📌 Using app URL:', appUrl)
  
  // Get the URL for Google OAuth sign-in
  const redirectUrl = new URL('/auth/callback/google', appUrl!).toString()
  debug.log('📌 Redirect URL:', redirectUrl)
  
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: redirectUrl,
      queryParams: {
        access_type: 'offline',
        prompt: 'consent',
      },
    },
  })

  if (error) {
    debug.error('❌ Google OAuth initialization failed:', error.message)
    return redirect('/auth/login?error=oauth_error')
  }

  debug.log('🔄 Redirecting to Google OAuth page')
  debug.log('📌 OAuth URL:', data.url)
  return redirect(data.url)
} 