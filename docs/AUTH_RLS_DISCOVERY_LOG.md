# Authentication and RLS Discovery Log (LENGOLF VIP Project)

This document logs key discoveries made while investigating and implementing Supabase Row Level Security (RLS) in conjunction with NextAuth for the LENGOLF VIP features.

## Key Discoveries:

1.  **NextAuth JWT and Supabase `auth.uid()`:**
    *   The NextAuth `jwt` callback is critical for ensuring the JWT's `sub` claim (subject) is populated with the `public.profiles.id` of the user.
    *   The NextAuth `session` callback must then take this `token.sub` and make it available as `session.user.id` on the client.
    *   Supabase RLS policies use `auth.uid()` which is derived from the `sub` claim of the JWT presented with the request. Correctly setting `token.sub` to `profiles.id` ensures `auth.uid()` aligns with the user's profile for RLS policies.
    *   Initial `options.ts` review showed the `signIn` callback correctly looks up/creates a `profiles` record and sets `user.id` to `profiles.id`. The `jwt` and `session` callbacks were then updated to propagate this `profiles.id` as `token.sub` and `session.user.id` respectively.

2.  **Client-Side Supabase Initialization:**
    *   Initial Problem: Client-side components (e.g., `BookingDetails.tsx`) were using a global Supabase client initialized via `utils/supabase/client.ts`.
    *   This `utils/supabase/client.ts` was **always using the `NEXT_PUBLIC_SUPABASE_ANON_KEY`**.
    *   Consequence: All client-side Supabase requests were anonymous, causing RLS policies (which relied on `auth.uid()`) to fail for logged-in users trying to access their own data (e.g., fetching their profile). This was the primary reason RLS enablement initially broke parts of the authenticated user experience.

3.  **Solution for Client-Side Supabase with NextAuth:**
    *   The fix involves modifying client-side components (like `BookingDetails.tsx`) to:
        *   Import `createBrowserClient` from `@supabase/ssr`.
        *   Use the `useSession()` hook from `next-auth/react` to get the current session.
        *   Initialize `createBrowserClient` with `session.accessToken` (the Supabase JWT) when the session is available and authenticated. This ensures client-side requests to Supabase are made on behalf of the logged-in user.
    *   This requires that the NextAuth `session` object on the client includes the `accessToken`. The `jwt` callback in NextAuth options should add the raw JWT to the token object, and the `session` callback should pass it to the client-side session.

4.  **RLS Policy Application Strategy:**
    *   RLS policies for authenticated users are based on `auth.uid()` matching the relevant user/profile ID column in tables.
    *   `SERVICE_ROLE_KEY` (used by backend API routes like `/api/bookings/create` via `utils/supabase/server.ts`) bypasses RLS, ensuring these critical operations are not disrupted.
    *   For development stability while transitioning client-side components, temporary broad `SELECT` policies for the `anon` role were added. These allow existing client-side code (that implicitly uses the ANON key) to continue functioning. **These temporary anonymous policies must be reviewed and tightened/removed before the full VIP feature launch.**

5.  **Table Schema Details for RLS:**
    *   `public.bookings` uses `user_id` to reference `public.profiles.id`.
    *   `public.crm_customer_mapping` uses `profile_id` to reference `public.profiles.id`.
    *   RLS policies were adjusted accordingly.

6.  **Order of Operations for RLS Enablement (Critical Learning):**
    *   Production application code that writes to tables (e.g., creating bookings by `INSERT`ing into `public.bookings`) *must* be updated to correctly populate foreign key/user identifier columns (e.g., `bookings.user_id` should be set to the value of `auth.uid()` for the current session) *before* RLS policies relying on these columns (e.g., using `WITH CHECK (auth.uid() = user_id)`) are enforced on the database.
    *   Failure to prepare the application code first will result in RLS violations (e.g., "new row violates row-level security policy" errors) for `INSERT` or `UPDATE` operations when RLS is enabled.

## Actionable Reminders:

*   Ensure all client-side components needing authenticated Supabase access are updated to use `createBrowserClient` with `session.accessToken`.
*   Verify that the NextAuth `session` callback correctly provides `session.accessToken` to the client.
*   **Prioritize application code alignment (populating necessary IDs for RLS conditions) before enabling RLS enforcement on production database tables.**
*   Before final production deployment of VIP features, **remove or significantly restrict the temporary anonymous read policies** (`TEMP Anon users can read...`) to ensure proper data security according to the principle of least privilege. 