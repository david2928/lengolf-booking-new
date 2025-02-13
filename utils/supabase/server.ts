import { createClient } from '@supabase/supabase-js';
import type { Database } from '@/types/supabase';

let supabaseServerClient: ReturnType<typeof createClient<Database>> | null = null;

export function createServerClient() {
  if (supabaseServerClient) {
    return supabaseServerClient;
  }

  supabaseServerClient = createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      auth: {
        persistSession: false // We don't need auth persistence
      }
    }
  );

  return supabaseServerClient;
} 