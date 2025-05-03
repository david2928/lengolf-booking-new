# Login Refactor Implementation Plan

This document breaks down the login refactor task into actionable steps, similar to Jira stories and sub-tasks, based on `LOGIN_REFACTOR_ANALYSIS.md (v2)`.

---

## Task 1: Modify Default Routing & Middleware

**Goal:** Change the application entry point from `/auth/login` to `/bookings` and remove middleware-level authentication for the bookings page itself.

**Story:** As a User, I want to land directly on the `/bookings` page when I visit the site root, so I can browse options before logging in.

### Sub-task 1.1: Update Middleware Root Redirect

*   **Description:** Modify the middleware to redirect users visiting the root path (`/`) to `/bookings` instead of `/auth/login`.
*   **File:** `middleware.ts`
*   **Change:** Locate the condition `if (pathname === '/' && !isGoogleAdsBot)` (around line 141) and change the redirect target:
    ```typescript
    // Before
    // return NextResponse.redirect(new URL('/auth/login', request.url)); 
    // After
    return NextResponse.redirect(new URL('/bookings', request.url)); 
    ```
*   **Verification:** Accessing the site's root URL (`/`) should redirect to `/bookings`. Google Ads Bot user agents should still be allowed access to `/`.

### Sub-task 1.2: Remove Middleware Booking Protection

*   **Description:** Remove the specific block in the middleware that checks for an authentication token when the path starts with `/bookings`. The authentication check will be moved to the page interaction level.
*   **File:** `middleware.ts`
*   **Change:** Delete or comment out the following block (around lines 158-161):
    ```typescript
    // Delete this block:
    if (!token && pathname.startsWith('/bookings')) {
      const callbackUrl = encodeURIComponent(request.nextUrl.pathname);
      return NextResponse.redirect(new URL(`/auth/login?callbackUrl=${callbackUrl}`, request.url));
    }
    ```
*   **Verification:** Accessing `/bookings` directly while logged out should now load the page instead of redirecting to login (requires Task 2 to be completed to see the page render correctly without its own redirect).

### Sub-task 1.3: Remove Root Page Redirect

*   **Description:** Remove the explicit redirect from the root page component (`app/page.tsx`) as the middleware now handles the root path routing.
*   **File:** `app/page.tsx`
*   **Change:** Remove the `redirect('/auth/login');` line. The component can return `null` or basic placeholder content (though it shouldn't be reached if middleware is correct).
    ```typescript
    // Before
    // import { redirect } from 'next/navigation';
    // export default function RootPage() {
    //   redirect('/auth/login');
    // }

    // After (Example returning null)
    export default function RootPage() {
      // Middleware should handle the redirect, this page likely won't render.
      return null; 
    }
    ```
*   **Verification:** Ensure accessing `/` still correctly redirects to `/bookings` (handled by Sub-task 1.1). This change primarily removes potential conflict/redundancy.

---

## Task 2: Update Booking Page for Unauthenticated Access

**Goal:** Allow the main bookings page shell to render even for unauthenticated users.

**Story:** As an Unauthenticated User, I want to view the date selection interface on the `/bookings` page without being immediately forced to log in.

### Sub-task 2.1: Remove Auth Check `useEffect`

*   **Description:** Remove the `useEffect` hook within the main bookings page component that checks the session status on load and redirects unauthenticated users.
*   **File:** `app/(features)/bookings/page.tsx`
*   **Change:** Delete or comment out the `useEffect` block (around lines 25-29):
    ```typescript
    // Delete this block:
    // useEffect(() => {
    //   if (status === 'unauthenticated') {
    //     router.push('/auth/login');
    //   }
    // }, [status, router]);
    ```
*   **Prerequisites:** Sub-task 1.2 (Middleware Booking Protection Removed).
*   **Verification:** Accessing `/bookings` directly while logged out should now render the page (specifically, the `<DateSelection>` component) without redirecting.

---

## Task 3: Implement Conditional Login & Auto-Selection in Booking Flow

**Goal:** Trigger login only upon date selection attempt by an unauthenticated user, and restore the selected date automatically after login.

**Story:** As an Unauthenticated User, when I select a date on the `/bookings` page, I want to be prompted to log in, and after logging in, I want the system to remember and select the date I originally chose.

### Sub-task 3.1: Add Dependencies to `useBookingFlow`

*   **Description:** Import necessary hooks and functions from `next-auth/react` and `next/navigation` into the booking flow hook.
*   **File:** `app/(features)/bookings/hooks/useBookingFlow.ts`
*   **Change:** Add imports:
    ```typescript
    import { useState, useEffect } from 'react'; // useEffect might be needed here or in page.tsx
    import { useSession, signIn } from 'next-auth/react';
    import { useRouter, useSearchParams } from 'next/navigation'; 
    ```
    Initialize hooks within the main function:
    ```typescript
    export function useBookingFlow() {
      const { data: session, status } = useSession();
      const router = useRouter();
      const searchParams = useSearchParams();
      // ... rest of the existing useState declarations
    }
    ```
*   **Verification:** Code compiles, dependencies are available within the hook.

### Sub-task 3.2: Modify `handleDateSelect` for Auth Check & URL Param

*   **Description:** Update the `handleDateSelect` function to check authentication status. If unauthenticated, trigger `signIn` with the date included in the `callbackUrl`. If authenticated, proceed as normal.
*   **File:** `app/(features)/bookings/hooks/useBookingFlow.ts`
*   **Change:** Modify `handleDateSelect`:
    ```typescript
    const handleDateSelect = (date: Date) => {
      // Check authentication status FIRST
      if (status === 'unauthenticated') {
        // Construct callback URL with the selected date
        const callbackUrl = \`/bookings?selectDate=\${date.toISOString()}\`;
        // Trigger login, redirecting back here after success
        signIn(undefined, { callbackUrl }); // Use undefined for provider to show options page
        return; // Stop further execution in this case
      }
  
      // If authenticated, proceed with original logic:
      setSelectedDate(date);
      setCurrentStep(2);
    };
    ```
*   **Prerequisites:** Sub-task 3.1.
*   **Verification:** Clicking a date while logged out triggers redirect to the login page. The browser URL should show `/auth/login?callbackUrl=%2Fbookings%3FselectDate%3D...`. Clicking a date while logged in proceeds directly to step 2 (time selection).

### Sub-task 3.3: Add `useEffect` for Post-Login Auto-Selection

*   **Description:** Implement a `useEffect` hook to check for the `selectDate` URL parameter upon page load/authentication change. If found and valid, automatically select the date and advance the step.
*   **File:** `app/(features)/bookings/hooks/useBookingFlow.ts` (or could be in `page.tsx`)
*   **Change:** Add the `useEffect`:
    ```typescript
    useEffect(() => {
      // Only run if authenticated and searchParams are available
      if (status === 'authenticated' && searchParams) {
        const dateParam = searchParams.get('selectDate');
        
        if (dateParam) {
          try {
            const selectedDateFromParam = new Date(dateParam);
            
            // Optional: Add validation if needed (e.g., isNaN(selectedDateFromParam.getTime()))
            if (isNaN(selectedDateFromParam.getTime())) {
              throw new Error('Invalid date parameter');
            }

            // Automatically select the date and move to the next step
            // Ensure this doesn't re-trigger the auth check in handleDateSelect
            // Maybe create a separate internal function _selectDate(date)
            // For simplicity here, directly setting state:
            setSelectedDate(selectedDateFromParam);
            setCurrentStep(2); 

            // Clean the URL - remove the selectDate parameter
            router.replace('/bookings', { scroll: false }); 

          } catch (error) {
            console.error("Error processing selectDate param:", error);
            // Optionally clear the param if invalid
            router.replace('/bookings', { scroll: false }); 
          }
        }
      }
      // Dependencies: status ensures it re-runs when auth changes, searchParams when URL changes
    }, [status, searchParams, router]); // Add setSelectedDate, setCurrentStep if required by linting rules

    // Ensure the internal _selectDate function or direct state setting logic is sound
    ```
*   **Prerequisites:** Sub-task 3.1, Sub-task 3.2.
*   **Verification:** After logging in via the flow triggered in 3.2, the user should land on `/bookings`, and the UI should automatically advance to Step 2 (Time Selection) with the originally chosen date selected/displayed. The `selectDate` query parameter should be removed from the URL. Test with invalid date parameters if possible.

### Sub-task 3.4: Implement Loading State (Optional but Recommended)

*   **Description:** Add state to indicate when the auto-selection logic is running and potentially disable date selection UI during this brief period.
*   **File:** `app/(features)/bookings/hooks/useBookingFlow.ts` and potentially `app/(features)/bookings/components/booking/steps/DateSelection.tsx`
*   **Change (Hook):**
    ```typescript
    const [isAutoSelecting, setIsAutoSelecting] = useState(false);
    // ... inside useEffect from 3.3 ...
    if (dateParam) {
        setIsAutoSelecting(true); // Start loading
        try { 
            // ... parse and set date ...
        } catch (error) { //... handle error ...} 
        finally {
            setIsAutoSelecting(false); // Stop loading regardless of outcome
            router.replace('/bookings', { scroll: false }); 
        }
    }
    // ... return isAutoSelecting from hook
    ```
*   **Change (Component):** Use the `isAutoSelecting` flag passed down from the page to conditionally render a loading spinner or disable date buttons in `<DateSelection>`.
*   **Verification:** After login redirect, a brief loading indicator is visible, and date selection might be temporarily disabled before the UI advances to step 2.

---

## Task 4: Configure Session Lifetime

**Goal:** Ensure user sessions expire only after 30 days of inactivity.

**Story:** As a User, I want my login session to last for 30 days without needing to interact with the site daily, so I don't have to log in frequently unless I've been away for a long time.

### Sub-task 4.1: Add Session Config to `authOptions`

*   **Description:** Add the `session` configuration object to the NextAuth options to control `maxAge` and disable `updateAge`.
*   **File:** `app/api/auth/options.ts`
*   **Change:** Add the `session` key to the main `authOptions` object:
    ```typescript
    export const authOptions: NextAuthOptions = {
      providers: [ /* ... */ ],
      callbacks: { /* ... */ },
      // Add this section:
      session: {
        strategy: 'jwt', // Ensure JWT strategy is specified
        maxAge: 30 * 24 * 60 * 60, // 30 days in seconds
        updateAge: 0, // Disable activity-based session extension
      },
      // ... other options like pages, secret
    };
    ```
*   **Verification:** Requires testing over time or potentially manipulating system clocks/JWT expiry for faster verification. The primary check is that a user logged in remains logged in after > 24 hours of inactivity but is logged out after > 30 days of inactivity.

---

## Task 5: Enhance User Experience (Optional)

**Goal:** Provide clearer user feedback and easier access to login.

### Sub-task 5.1: Add Proactive Login Button to Header

*   **Description:** Add a "Login" or "My Account" button to the main site header component.
*   **File:** `app/(features)/bookings/components/booking/Layout.tsx`
*   **Change:**
    *   Import `useSession`, `signIn`, `signOut`.
    *   Conditionally render a "Login" button (calling `signIn()`) if `status === 'unauthenticated'`.
    *   Conditionally render user info (e.g., `session.user.name`) and a "Logout" button if `status === 'authenticated'`. Adapt existing header structure.
*   **Verification:** A login button appears when logged out. Clicking it initiates the login flow. When logged in, user info and a logout button appear.

---

## Task 6: Testing & Verification

**Goal:** Ensure the refactored login flow works correctly under various conditions.

### Sub-task 6.1: Test Unauthenticated Flow

*   **Steps:** Clear session/cookies. Visit `/`. Verify redirect to `/bookings`. Verify `<DateSelection>` is visible.
*   **Expected:** Lands on booking page, can see date options.

### Sub-task 6.2: Test Login Trigger & Auto-Selection

*   **Steps:** Start unauthenticated. Select a date. Verify redirect to login. Log in successfully.
*   **Expected:** Redirected back to `/bookings`. UI automatically advances to Step 2 (Time Selection) with the correct date chosen. URL parameter `selectDate` is removed.

### Sub-task 6.3: Test Authenticated Flow

*   **Steps:** Log in first (e.g., using optional button from 5.1 or via direct login URL). Visit `/bookings`. Select a date.
*   **Expected:** UI advances directly to Step 2 without intermediate login prompt.

### Sub-task 6.4: Test Session Expiry (30 days)

*   **Steps:** Log in. Wait > 30 days (or simulate). Attempt to access `/bookings` or perform an action requiring auth.
*   **Expected:** User is treated as unauthenticated, potentially redirected to login or prompted upon interaction based on the implemented flow.

### Sub-task 6.5: Test Error Handling

*   **Steps:** Manually craft a callback URL with an invalid `selectDate` parameter (e.g., `/bookings?selectDate=invalid-date`). Log in.
*   **Expected:** User lands on `/bookings`, an error is logged (console), the invalid parameter is ignored/cleared, and the user sees Step 1 (Date Selection) without auto-advance. Test failed login attempts.
*   **Expected:** Failed login redirects to the configured error page (`authOptions.pages.error`).

### Sub-task 6.6: Test API Route Protection

*   **Steps:** Log out. Use developer tools or `curl` to directly request an API endpoint assumed to be protected (e.g., `/api/bookings/available-slots?date=...`).
*   **Expected:** Receive a 401 Unauthorized or 403 Forbidden response, or be redirected to login by the middleware. Should not receive actual data.

--- 