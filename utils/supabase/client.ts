import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/supabase'
import type { SupabaseClient } from '@supabase/supabase-js'

let supabaseInstance: SupabaseClient<Database> | null = null

export function createClient(): SupabaseClient<Database> {
  if (supabaseInstance) {
    return supabaseInstance
  }

  supabaseInstance = createSupabaseClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      auth: {
        persistSession: false // We don't need auth persistence
      }
    }
  )

  return supabaseInstance
} 