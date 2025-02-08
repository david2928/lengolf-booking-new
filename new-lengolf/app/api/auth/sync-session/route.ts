import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { debug } from '@/lib/debug'
import type { Database } from '@/app/types/supabase'

function decodeCookieValue(value: string): string | null {
  if (value.startsWith('base64-')) {
    try {
      const base64Value = value.replace('base64-', '')
      return Buffer.from(base64Value, 'base64').toString()
    } catch (error) {
      debug.error('SyncSession: Error decoding base64 value:', error)
      return null
    }
  }
  return value
}

export async function GET() {
  try {
    debug.log('SyncSession: Starting session sync')
    
    // Get the cookie store and await it
    const cookieStore = await cookies()
    debug.log('SyncSession: Cookie store initialized')

    // Try to get the main session cookie first
    let sessionCookie = cookieStore.get('sb-bisimqmtxjsptehhqpeg-auth-token')
    let sessionStr: string | null = null

    if (!sessionCookie) {
      // Try to combine split cookies
      const part0 = cookieStore.get('sb-bisimqmtxjsptehhqpeg-auth-token.0')
      const part1 = cookieStore.get('sb-bisimqmtxjsptehhqpeg-auth-token.1')
      
      debug.log('SyncSession: Split cookie state', {
        hasPart0: !!part0,
        hasPart1: !!part1,
        part0Value: part0?.value?.slice(0, 20) + '...',
        part1Value: part1?.value?.slice(0, 20) + '...'
      })

      if (part0 && part1) {
        const combined = part0.value + part1.value
        sessionStr = decodeCookieValue(combined)
        if (sessionStr) {
          debug.log('SyncSession: Combined and decoded split cookies')
          // Set the main cookie for Supabase to use
          cookieStore.set('sb-bisimqmtxjsptehhqpeg-auth-token', sessionStr)
        }
      }
    } else {
      sessionStr = decodeCookieValue(sessionCookie.value)
      debug.log('SyncSession: Using main session cookie')
    }

    if (!sessionStr) {
      debug.warn('SyncSession: No valid session cookie found')
      return NextResponse.json({ session: null }, { status: 200 })
    }

    // Create Supabase client with the cookie store
    const supabase = createRouteHandlerClient<Database>({ cookies })
    
    // Get the session
    const { data: { session }, error } = await supabase.auth.getSession()
    
    if (error) {
      debug.error('SyncSession: Error getting session:', error)
      return NextResponse.json({ error: 'Failed to get session' }, { status: 500 })
    }
    
    if (!session) {
      debug.warn('SyncSession: No session found')
      return NextResponse.json({ session: null }, { status: 200 })
    }
    
    debug.log('SyncSession: Session found', { 
      userId: session.user.id,
      email: session.user.email,
      provider: session.user.app_metadata?.provider
    })
    
    // Return minimal session data needed for client
    return NextResponse.json({
      session: {
        access_token: session.access_token,
        refresh_token: session.refresh_token,
        expires_at: session.expires_at,
        expires_in: session.expires_in,
        user: {
          id: session.user.id,
          email: session.user.email,
          phone: session.user.phone,
          app_metadata: session.user.app_metadata,
          user_metadata: session.user.user_metadata
        }
      }
    })
  } catch (error) {
    debug.error('SyncSession: Unexpected error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
} 