import { createClient } from '@/utils/supabase/server'
import { redirect } from 'next/navigation'
import { debug } from '@/lib/debug'

export async function POST() {
  const supabase = await createClient()
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://lengolf-booking-new-ej6pn7llcq-as.a.run.app'
  debug.log('🔄 Starting Facebook OAuth flow')
  debug.log('📌 Environment check:', {
    NODE_ENV: process.env.NODE_ENV,
    APP_URL: process.env.NEXT_PUBLIC_APP_URL,
    FINAL_URL: appUrl
  })
  
  // Get the URL for Facebook OAuth sign-in
  const redirectUrl = new URL('/auth/callback/facebook', appUrl).toString()
  debug.log('📌 Redirect URL:', redirectUrl)
  
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'facebook',
    options: {
      redirectTo: redirectUrl,
      queryParams: {
        display: 'popup',
        response_type: 'code',
        auth_type: 'rerequest',
      },
    },
  })

  if (error) {
    debug.error('❌ Facebook OAuth initialization failed:', error.message)
    return redirect('/auth/login?error=oauth_error')
  }

  debug.log('🔄 Redirecting to Facebook OAuth page')
  debug.log('📌 OAuth URL:', data.url)
  return redirect(data.url)
} 