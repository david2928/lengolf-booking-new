import { createClient } from '@/utils/supabase/server'
import { redirect } from 'next/navigation'
import { debug } from '@/lib/debug'

export async function POST() {
  const supabase = await createClient()
  debug.log('🔄 Starting Facebook OAuth flow')
  
  // Get the URL for Facebook OAuth sign-in
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'facebook',
    options: {
      redirectTo: new URL('/auth/callback/facebook', process.env.NEXT_PUBLIC_APP_URL!).toString(),
    },
  })

  if (error) {
    debug.error('❌ Facebook OAuth initialization failed:', error.message)
    return redirect('/auth/login?error=oauth_error')
  }

  debug.log('🔄 Redirecting to Facebook OAuth page')
  return redirect(data.url)
} 