import { createClient } from '@/utils/supabase/server'
import { redirect } from 'next/navigation'
import { debug } from '@/lib/debug'

export async function POST() {
  const supabase = await createClient()
  debug.log('🔄 Starting Google OAuth flow')
  
  // Get the URL for Google OAuth sign-in
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: new URL('/auth/callback', process.env.NEXT_PUBLIC_APP_URL!).toString(),
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
  return redirect(data.url)
} 