import { createClient } from '@supabase/supabase-js';
import type { Database } from '@/types/supabase';

let crmSupabaseInstance: ReturnType<typeof createClient<Database>> | null = null;

/**
 * Creates a singleton client connection to the CRM Supabase instance
 */
export function createCrmClient() {
  if (crmSupabaseInstance) {
    return crmSupabaseInstance;
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_CRM_SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_CRM_SUPABASE_KEY;
  
  if (!supabaseUrl || !supabaseKey) {
    throw new Error('CRM Supabase environment variables are not set');
  }
  
  crmSupabaseInstance = createClient<Database>(supabaseUrl, supabaseKey, {
    auth: { persistSession: false }
  });

  return crmSupabaseInstance;
}
