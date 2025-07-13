import { createClient } from '@supabase/supabase-js';
import type { Database } from '@/types/supabase';

let supabaseAdminClient: ReturnType<typeof createClient<Database>> | null = null;

export function createAdminClient() {
  if (supabaseAdminClient) {
    return supabaseAdminClient;
  }

  supabaseAdminClient = createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
        detectSessionInUrl: false
      }
    }
  );

  return supabaseAdminClient;
}