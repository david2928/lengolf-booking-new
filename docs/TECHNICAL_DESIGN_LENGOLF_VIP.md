# Technical Design Document: LENGOLF VIP Feature

## 1. Introduction

This document provides the technical specification for implementing the LENGOLF VIP feature, enabling customer self-service via LINE (using LIFF) and the main website. It builds upon the general design outlined in `DESIGN_LENGOLF_VIP_LINE_INTEGRATION.md`.

The goal is to detail the required database changes, API endpoints, frontend components, and core logic implementation.

## 2. System Architecture Integration

*   **Frontend:** New React components will be created under `src/components/vip/` and integrated into new pages under `app/vip/`. These pages will serve both the website access and the LIFF views for LINE.
*   **Backend:** New API routes will be added under `app/api/vip/`. These routes will handle VIP-specific logic, interacting with Supabase and potentially reusing/adapting existing utility functions (e.g., for availability checks, notifications).
*   **Authentication:** Relies on the existing NextAuth.js setup (`profiles` table, LINE provider). Authorization will be enforced via middleware checking session validity and customer linking status (`crm_customer_mapping`).
*   **Database:** Primarily interacts with `profiles`, `bookings`, `crm_packages`, `customers`, and `crm_customer_mapping` tables in Supabase.

## 3. Database Schema Modifications

1.  **`profiles` Table:**
    *   Add a new column: `marketing_preference`
        *   Type: `BOOLEAN`
        *   Default: `TRUE`
        *   Nullable: `FALSE` (Set default `TRUE` during migration)
    *   *Migration SQL:*
        ```sql
        -- Add the column, allowing NULLs temporarily for existing rows
        ALTER TABLE public.profiles
        ADD COLUMN IF NOT EXISTS marketing_preference BOOLEAN;

        -- Set the default value for future inserts
        ALTER TABLE public.profiles
        ALTER COLUMN marketing_preference SET DEFAULT TRUE;

        -- Update existing rows to the default value
        UPDATE public.profiles
        SET marketing_preference = TRUE
        WHERE marketing_preference IS NULL;

        -- Make the column NOT NULL after ensuring all rows have a value
        ALTER TABLE public.profiles
        ALTER COLUMN marketing_preference SET NOT NULL;
        ```

2.  **`crm_customer_mapping` Table:**
    *   Ensure the table structure supports placeholder records where `is_matched = false` and `crm_customer_id` / `stable_hash_id` can be `NULL`. The existing logic creating placeholder records confirms this capability.

3.  **Indexes (Recommendations):**
    *   `profiles`: Ensure index on `id` (primary key).
    *   `crm_customer_mapping`: Ensure indexes on `profile_id` (for lookups) and potentially `(profile_id, is_matched)`.
    *   `bookings`: Ensure index on `user_id` (for fetching user's bookings).
    *   `crm_packages`: Ensure index on `stable_hash_id` (for fetching customer's packages).

4.  **Row Level Security (RLS) Policies:**
    *   **Requirement:** Enable RLS on relevant tables.
    *   **Verification Needed:** Confirm the exact function in Supabase policies to get the authenticated user's ID (likely `auth.uid()`, which corresponds to `profiles.id`).
    *   **`profiles` Table:**
        ```sql
        -- Drop existing policies if necessary before creating new ones
        DROP POLICY IF EXISTS "Allow individual user access" ON public.profiles;
        -- Allow users to select/update their own profile
        CREATE POLICY "Allow individual user access" ON public.profiles
        FOR ALL -- Grants SELECT, INSERT, UPDATE, DELETE
        USING (auth.uid() = id)
        WITH CHECK (auth.uid() = id); -- Ensures users can only insert/update their own profile
        ```
    *   **`bookings` Table:**
        ```sql
        DROP POLICY IF EXISTS "Allow individual user access to bookings" ON public.bookings;
        -- Allow users to select/update/delete their own bookings
        CREATE POLICY "Allow individual user access to bookings" ON public.bookings
        FOR ALL
        USING (auth.uid() = user_id)
        WITH CHECK (auth.uid() = user_id);
        ```
    *   **`crm_customer_mapping` Table:**
        ```sql
        DROP POLICY IF EXISTS "Allow individual read access to own mapping" ON public.crm_customer_mapping;
        -- Allow users to select their own mapping record
        CREATE POLICY "Allow individual read access to own mapping" ON public.crm_customer_mapping
        FOR SELECT
        USING (auth.uid() = profile_id);
        -- INSERT/UPDATE should be handled by secure backend functions/APIs only, not direct user writes.
        ```
    *   **`customers` Table:**
        *   Users should not have direct access. Access should be via backend APIs that join through `crm_customer_mapping`. Consider adding a restrictive policy if RLS is enabled globally on this table.
        ```sql
        -- Example: Deny direct access unless coming from a specific role (e.g., service_role)
        -- Or allow select only if linked via mapping:
        DROP POLICY IF EXISTS "Allow linked user read access" ON public.customers;
        CREATE POLICY "Allow linked user read access" ON public.customers
        FOR SELECT
        USING (
          EXISTS (
            SELECT 1
            FROM public.crm_customer_mapping mapping
            WHERE mapping.profile_id = auth.uid()
              AND mapping.is_matched = true
              AND mapping.crm_customer_id = public.customers.id -- Adjust column name if needed
          )
        );
        ```
    *   **`crm_packages` Table:**
        *   Similar to `customers`, access should be restricted.
        ```sql
        DROP POLICY IF EXISTS "Allow linked user read access to packages" ON public.crm_packages;
        CREATE POLICY "Allow linked user read access to packages" ON public.crm_packages
        FOR SELECT
        USING (
          EXISTS (
            SELECT 1
            FROM public.crm_customer_mapping mapping
            WHERE mapping.profile_id = auth.uid()
              AND mapping.is_matched = true
              AND mapping.stable_hash_id = public.crm_packages.stable_hash_id
          )
        );
        ```
    *   **Important:** Applying RLS will block access via the `anon` key unless specific permissive policies for the `anon` role are added. Review if any public access is needed via `anon`.

## 4. API Endpoint Specifications

All VIP API endpoints below require the user to be authenticated via NextAuth.js. Middleware should enforce this.

1.  **`GET /api/vip/status`**
    *   **Purpose:** Check if the authenticated user is linked to a matched CRM customer.
    *   **Authorization:** Authenticated user.
    *   **Logic:**
        1.  Get `profile_id` from session.
        2.  Query `crm_customer_mapping` WHERE `profile_id` = session `profile_id`.
        3.  If record exists AND `is_matched = true`, return `linked_matched`.
        4.  If record exists AND `is_matched = false`, return `linked_unmatched`.
        5.  If no record exists, return `not_linked`. (The system should aim to create placeholders proactively, so `not_linked` might be rare after initial login).
    *   **Response (Success - 200 OK):**
        ```json
        {
          "status": "linked_matched" | "linked_unmatched" | "not_linked",
          "crmCustomerId": "string | null", // Populated if linked_matched
          "stableHashId": "string | null"  // Populated if linked_matched
        }
        ```
    *   **Response (Error - 401/500):** Standard error format.

2.  **`POST /api/vip/link-account`**
    *   **Purpose:** Attempt to manually link the authenticated user to a CRM customer using a provided phone number.
    *   **Authorization:** Authenticated user (ideally whose status is `linked_unmatched` or `not_linked`).
    *   **Request Body:**
        ```json
        {
          "phoneNumber": "string"
        }
        ```
    *   **Logic:**
        1.  Get `profile_id` from session.
        2.  Validate `phoneNumber` format.
        3.  Fetch user's profile data (`name`, `email`) from `profiles` using `profile_id`.
        4.  Use matching logic (similar to `getOrCreateCrmMapping` / `matchProfileWithCrm`) to search `customers` table using the provided `phoneNumber` and fetched profile data.
        5.  If high-confidence match found:
            *   Upsert `crm_customer_mapping` record for `profile_id`, setting `is_matched = true`, `crm_customer_id`, `stable_hash_id`, `crm_customer_data`.
            *   Return success.
        6.  If no/low-confidence match found:
            *   Return failure/not found status. The `crm_customer_mapping` record remains `is_matched = false`.
    *   **Response (Success - 200 OK):**
        ```json
        {
          "success": true,
          "crmCustomerId": "string",
          "stableHashId": "string"
        }
        ```
    *   **Response (Not Found - 404 Not Found):**
        ```json
        {
          "success": false,
          "error": "No matching customer account found."
        }
        ```
    *   **Response (Error - 400/401/500):** Standard error format.

3.  **`GET /api/vip/profile`**
    *   **Purpose:** Fetch profile data for the authenticated user.
    *   **Authorization:** Authenticated user.
    *   **Logic:**
        1.  Get `profile_id` from session.
        2.  Query `profiles` table WHERE `id` = `profile_id` to get `name`, `email`, `pictureUrl`, `marketingPreference`.
        3.  Query `crm_customer_mapping` WHERE `profile_id` = `profile_id`.
        4.  If `mapping.is_matched = true`, query `customers` table WHERE `id` = `mapping.crm_customer_id` to get `contact_number`.
        5.  Assemble response, prioritizing `customers.contact_number` if available, otherwise fallback to `profiles.phone_number` (if it exists).
    *   **Response (Success - 200 OK):**
        ```json
        {
          "id": "string", // profile_id
          "name": "string | null",
          "email": "string | null",
          "phoneNumber": "string | null", // From linked customer preferred, else profile
          "pictureUrl": "string | null",
          "marketingPreference": true | false
        }
        ```
    *   **Response (Error - 401/404/500):** Standard error format.

4.  **`PUT /api/vip/profile`**
    *   **Purpose:** Update editable profile data (`name`, `email`, `marketingPreference`).
    *   **Authorization:** Authenticated user.
    *   **Request Body:**
        ```json
        {
          "name": "string", // Optional
          "email": "string", // Optional
          "marketingPreference": true | false // Optional
        }
        ```
    *   **Logic:**
        1.  Get `profile_id` from session.
        2.  Validate input fields (e.g., email format).
        3.  Construct update object with only provided fields.
        4.  Update `profiles` table SET `field` = `value` WHERE `id` = `profile_id`.
    *   **Response (Success - 200 OK):**
        ```json
        {
          "success": true,
          "updatedFields": ["name", "marketingPreference"] // Example: list of fields that were updated
        }
        ```
    *   **Response (Error - 400/401/500):** Standard error format.

5.  **`GET /api/vip/bookings`**
    *   **Purpose:** Fetch past and future bookings for the authenticated user.
    *   **Authorization:** Authenticated user.
    *   **Query Parameters:** `?page=1&limit=10&filter=future|past|all` (optional pagination/filtering). Default: `filter=all`, `limit=10`.
    *   **Logic:**
        1.  Get `profile_id` from session.
        2.  Construct base query: `SELECT ... FROM bookings WHERE user_id = profile_id`.
        3.  Apply filtering based on `filter` param and current date (`date >= today` for future, `date < today` for past).
        4.  Apply pagination using `page` and `limit`.
        5.  Apply ordering (e.g., `date DESC, start_time DESC` for past; `date ASC, start_time ASC` for future).
        6.  Execute query and count total matching records (for pagination metadata).
    *   **Response (Success - 200 OK):**
        ```json
        {
          "bookings": [
            {
              "id": "string",
              "date": "yyyy-MM-dd",
              "startTime": "HH:mm",
              "duration": "number", // hours
              "bay": "string", // e.g., "Bay 1"
              "status": "confirmed | cancelled | completed", // Need to map internal statuses if different
              "numberOfPeople": "number"
              // Consider adding: booking_type, notes?
            }
          ],
          "pagination": { "currentPage": 1, "totalPages": 5, "totalCount": 48 }
        }
        ```
    *   **Response (Error - 401/500):** Standard error format.

6.  **`PUT /api/vip/bookings/{bookingId}/modify`**
    *   **Purpose:** Modify the date, time, or duration of a *future*, *confirmed* booking.
    *   **Authorization:** Authenticated user who owns the booking.
    *   **Path Parameter:** `bookingId` (UUID of the booking).
    *   **Request Body:**
        ```json
        {
          "date": "yyyy-MM-dd", // Required
          "startTime": "HH:mm", // Required
          "duration": "number" // Required (hours)
        }
        ```
    *   **Logic:**
        1.  Get `profile_id` from session and `bookingId` from path. Validate inputs.
        2.  Fetch booking from `bookings` WHERE `id` = `bookingId` AND `user_id` = `profile_id`.
        3.  Verify booking exists, belongs to user, status is 'confirmed', and `date` is in the future. If not, return 403/404/409 error.
        4.  Call availability check logic (e.g., using `POST /api/availability/check`) with new `date`, `startTime`, `duration`.
        5.  If availability check fails, return 409 Conflict ("Slot unavailable").
        6.  If available, get the assigned `bay` from the availability check response.
        7.  Update `bookings` table SET `date`, `start_time`, `duration`, `bay` = new values WHERE `id` = `bookingId`.
        8.  **(Async Task)** Trigger Google Calendar update (e.g., event move/resize). Pass booking ID and relevant details.
        9.  **(Async Task)** Trigger Staff Notification (LINE) indicating modification by VIP user. Pass booking ID and details.
    *   **Response (Success - 200 OK):**
        ```json
        {
          "success": true,
          "updatedBooking": {
            // Return the updated booking object, similar to GET /bookings
            "id": "string",
            "date": "yyyy-MM-dd",
            "startTime": "HH:mm",
            "duration": "number",
            "bay": "string", // New bay
            "status": "confirmed",
            "numberOfPeople": "number"
            // ... other fields ...
          }
        }
        ```
    *   **Response (Error - 400/401/403/404/409/500):** Standard error format with descriptive message (e.g., "Booking not found or access denied", "Booking must be in the future", "Cannot modify cancelled booking", "Requested time slot is unavailable").

7.  **`POST /api/vip/bookings/{bookingId}/cancel`**
    *   **Purpose:** Cancel a *future*, *confirmed* booking.
    *   **Authorization:** Authenticated user who owns the booking.
    *   **Path Parameter:** `bookingId` (UUID of the booking).
    *   **Logic:**
        1.  Get `profile_id` from session and `bookingId` from path.
        2.  Fetch booking from `bookings` WHERE `id` = `bookingId` AND `user_id` = `profile_id`.
        3.  Verify booking exists, belongs to user, status is 'confirmed', and `date` is in the future. If not, return 403/404/409 error.
        4.  Update `bookings` table SET `status` = 'cancelled' WHERE `id` = `bookingId`. (Verify 'cancelled' is the correct status value).
        5.  **(Async Task)** Trigger Google Calendar update (e.g., delete event or update status). Pass booking ID.
        6.  **(Async Task)** Trigger Staff Notification (LINE) indicating cancellation by VIP user. Pass booking ID and details.
    *   **Response (Success - 200 OK):**
        ```json
        { "success": true }
        ```
    *   **Response (Error - 401/403/404/409/500):** Standard error format with descriptive message (e.g., "Booking not found or access denied", "Booking must be in the future", "Booking is already cancelled").

8.  **`GET /api/vip/packages`**
    *   **Purpose:** Fetch active and past packages for the linked CRM customer.
    *   **Authorization:** Authenticated user.
    *   **Logic:**
        1.  Get `profile_id` from session.
        2.  Query `crm_customer_mapping` WHERE `profile_id` = `profile_id`.
        3.  If no mapping found OR `is_matched = false`, return empty lists.
        4.  Extract `stable_hash_id` from the mapping.
        5.  Query `crm_packages` WHERE `stable_hash_id` = retrieved hash.
        6.  Categorize results into `activePackages` and `pastPackages` based on criteria like expiry date, remaining sessions, status field, etc. (Requires understanding `crm_packages` structure).
    *   **Response (Success - 200 OK):**
        ```json
        {
          "activePackages": [
            {
              "id": "string", // Package ID from crm_packages
              "packageName": "string",
              "purchaseDate": "yyyy-MM-dd",
              "expiryDate": "yyyy-MM-dd | null",
              "totalSessions": "number",
              "remainingSessions": "number",
              "status": "active | depleted | expired" // Example statuses
              // ... other relevant package fields ...
            }
          ],
          "pastPackages": [
             // Similar structure for past/expired/depleted packages
          ]
        }
        ```
    *   **Response (Error - 401/500):** Standard error format.

## 5. Frontend Component Breakdown (High-Level)

Located under `src/components/vip/`:

*   `VipLayout`: Wrapper for VIP pages (`/app/vip/layout.tsx`), handles auth checks via server component fetching session, potentially displays sub-navigation. Redirects if not authenticated. Fetches VIP status (`/api/vip/status`) client-side to control content visibility based on linking status.
*   `ProfileView`: Client component. Fetches profile data via `GET /api/vip/profile`. Displays info, allows editing name/email/marketing pref via `PUT /api/vip/profile`. Shows non-editable phone number.
*   `BookingsList`: Client component. Fetches bookings via `GET /api/vip/bookings` with filters (future/past) and pagination controls. Uses `BookingListItem`. Displays `EmptyState` if no bookings or user not linked/matched.
*   `BookingListItem`: Displays a single booking's details. Shows Modify/Cancel buttons for future, confirmed bookings. Triggers modals.
*   `BookingModifyModal`: Client component. Form for selecting new date/time/duration. Fetches availability (`/api/availability/check`). Submits to `PUT /api/vip/bookings/{id}/modify`. Handles loading/error states.
*   `BookingCancelModal`: Client component. Confirmation prompt. Submits to `POST /api/vip/bookings/{id}/cancel`. Handles loading/error states.
*   `PackagesView`: Client component. Fetches packages via `GET /api/vip/packages`. Displays active/past lists using `PackageListItem`. Displays `EmptyState` if no packages or user not linked/matched.
*   `PackageListItem`: Displays details of a single package.
*   `ManualLinkAccountForm`: Client component for `/vip/link-account` page. Form for entering phone number. Submits to `POST /api/vip/link-account`. Handles loading/success/error states, potentially redirects on success.
*   `EmptyState`: Reusable component for displaying messages like "No bookings found." with optional CTA. Used when data is empty or user is in `linked_unmatched` state for relevant sections.

Pages under `app/vip/`: `layout.tsx`, `page.tsx` (dashboard/entry - maybe redirects to profile?), `profile/page.tsx`, `bookings/page.tsx`, `packages/page.tsx`, `link-account/page.tsx`.

## 6. Core Logic Implementation Notes

*   **Placeholder Mapping Creation:** The primary trigger for checking/creating the mapping should be during user sign-in or initial session validation.
    *   **Recommended Approach:** Modify the NextAuth `signIn` or `session` callback in `app/api/auth/[...nextauth]/options.ts`.
    *   After successfully authenticating a user (`profiles.id` is known), call `getOrCreateCrmMapping(profile_id, profile_data)`.
    *   Adapt `getOrCreateCrmMapping` (in `utils/customer-matching.ts`):
        *   If it finds a match, it should still create/update the `crm_customer_mapping` record with `is_matched = true`.
        *   **If it does NOT find a match**, it should `INSERT` a record into `crm_customer_mapping` with `profile_id`, `is_matched = false`, and `crm_customer_id = NULL`, `stable_hash_id = NULL`.
        *   Return the mapping record (or its status) so the session callback potentially stores `is_matched` status in the session token for quick access.
*   **Staff Notifications (`src/lib/line-messaging.ts`):**
    *   Modify or create functions to send notifications for:
        *   VIP Booking Modification: "VIP [User Name] modified booking [Booking ID] to [New Date/Time/Bay]."
        *   VIP Booking Cancellation: "VIP [User Name] cancelled booking [Booking ID] ([Date/Time])."
    *   Ensure these functions are called asynchronously from the relevant API endpoints (`PUT /modify`, `POST /cancel`).
*   **Google Calendar Updates:**
    *   Need corresponding async handlers (potentially triggered via Supabase Edge Functions listening to DB changes, or explicit API calls from modify/cancel endpoints).
    *   Modification Handler: Needs original event details (likely stored in `bookings` table or fetched) and new details to update the Google Calendar event.
    *   Cancellation Handler: Needs event details to delete the Google Calendar event.
    *   Ensure robust error handling for calendar API interactions.
*   **Availability Check (`app/api/availability/check/route.ts`):** This existing endpoint seems suitable for use by the booking modification logic. Ensure it correctly handles the `duration` parameter.

## 7. Deployment Considerations

*   Ensure new environment variables (if any) are added to Vercel/deployment environment.
*   Database migrations for `profiles` table change need to be created and run.
*   RLS policies need to be scripted and applied to the Supabase database. Test thoroughly.
*   Review Supabase compute usage if adding Edge Functions for async tasks.

## 8. Open Technical Questions/Risks

*   **RLS `auth.uid()` verification:** Confirm the function for user ID in policies.
*   **`getOrCreateCrmMapping` Adaptation:** Implement the placeholder creation logic carefully within this function or the calling code (e.g., NextAuth callback).
*   **Async Task Implementation:** Decide on the mechanism for async calendar/notification triggers (e.g., direct async calls within API routes, Supabase Functions, external queue). Ensure reliability.
*   **Error Handling Granularity:** Ensure user-facing error messages are mapped appropriately from backend errors (e.g., distinguish "slot unavailable" from "general booking error"). 