import 'server-only';
import { createClient } from '@supabase/supabase-js';
import type { Database } from '@/types/supabase';

let supabaseServerClient: ReturnType<typeof createClient<Database>> | null = null;

/**
 * Server-only Supabase client using the service_role key.
 * Bypasses RLS — only use from trusted server code (API routes, server components,
 * server actions). NEVER import from client components — the `server-only` import
 * above will fail the build if you do.
 *
 * Name is `createServerClient` for historical reasons (was originally misusing the
 * anon key here, which left every server route running as `anon` and depending on
 * over-permissive grants). Swapping the env var in place was the minimal fix that
 * closes the security hole without touching 14+ call sites.
 */
export function createServerClient() {
  if (supabaseServerClient) {
    return supabaseServerClient;
  }

  supabaseServerClient = createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      }
    }
  );

  return supabaseServerClient;
}
