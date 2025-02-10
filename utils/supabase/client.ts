import { createBrowserClient } from '@supabase/ssr'
import type { Database } from '@/types/supabase'

let supabaseInstance: ReturnType<typeof createBrowserClient<Database>> | null = null

export function createClient() {
  if (supabaseInstance) {
    return supabaseInstance
  }

  const isDev = process.env.NODE_ENV !== 'production'
  const appUrl = process.env.NEXT_PUBLIC_APP_URL

  supabaseInstance = createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          const cookie = document.cookie
            .split('; ')
            .find((row) => row.startsWith(`${name}=`))
          return cookie ? decodeURIComponent(cookie.split('=')[1]) : ''
        },
        set(name: string, value: string, options: { path?: string; maxAge?: number }) {
          document.cookie = `${name}=${encodeURIComponent(value)}; path=${options.path || '/'}; max-age=${options.maxAge || 34560000}; ${isDev ? '' : 'secure; '}samesite=lax`
        },
        remove(name: string, options: { path?: string }) {
          document.cookie = `${name}=; path=${options.path || '/'}; expires=Thu, 01 Jan 1970 00:00:00 GMT; ${isDev ? '' : 'secure; '}samesite=lax`
        },
      },
      auth: {
        flowType: 'pkce',
        autoRefreshToken: true,
        detectSessionInUrl: true,
        persistSession: true,
      },
      global: {
        headers: {
          'x-site-url': appUrl || '',
        },
      },
    }
  )

  return supabaseInstance
} 