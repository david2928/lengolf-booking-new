import { createClient } from '@/utils/supabase/server'
import { NextResponse } from 'next/server'
import { debug } from '@/lib/debug'

export async function POST() {
  const supabase = await createClient()
  debug.log('🔄 Starting Facebook OAuth flow')

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'facebook',
    options: {
      redirectTo: `${process.env.NEXT_PUBLIC_APP_URL}/auth/callback`,
    },
  })

  if (error) {
    debug.error('❌ Facebook OAuth initiation failed:', error.message)
    return NextResponse.redirect(
      new URL('/auth/login?error=oauth_error&error_description=Failed to start Facebook OAuth', process.env.NEXT_PUBLIC_APP_URL!)
    )
  }

  if (!data.url) {
    debug.error('❌ No OAuth URL returned')
    return NextResponse.redirect(
      new URL('/auth/login?error=oauth_error&error_description=No OAuth URL returned', process.env.NEXT_PUBLIC_APP_URL!)
    )
  }

  debug.log('✅ Facebook OAuth initiated, redirecting to:', data.url)
  return NextResponse.redirect(data.url)
} 