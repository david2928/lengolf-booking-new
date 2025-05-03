# Login Flow Refactor Plan

This document outlines the steps to change the application flow:
1.  Make `/bookings` the landing page.
2.  Trigger login only when an unauthenticated user attempts to select a date on the booking page.
3.  Extend the user session duration.

## Plan Steps

1.  **Investigate Current Routing and Authentication:**
    *   Identify how the current default route/landing page is configured (e.g., in `next.config.js`, middleware, or root page component).
    *   Locate the authentication middleware or logic (likely in `middleware.ts` or similar using NextAuth). Understand how it currently protects routes and redirects unauthenticated users.
    *   Examine the `/bookings` page component (`app/(features)/bookings/page.tsx` or similar) to see how it currently handles session checks and date selection logic.
    *   Find the NextAuth configuration file (e.g., `src/app/api/auth/[...nextauth]/route.ts`) to locate session settings.

2.  **Modify Default Route:**
    *   Update the application's configuration or root page logic to make `/bookings` the default route when a user visits the base URL (`/`).

3.  **Adjust Authentication Middleware:**
    *   Modify the middleware to *allow* unauthenticated access to the `/bookings` page.
    *   Ensure other routes that *require* immediate authentication are still protected. The middleware might need to differentiate based on the route path.

4.  **Implement Conditional Login on Booking Page:**
    *   In the `/bookings` page component:
        *   Use the `useSession` hook from `next-auth/react` to get the user's session status.
        *   Locate the event handler for date selection (e.g., `onClick` on date elements).
        *   Inside the handler, check if `session.status === 'unauthenticated'` or `session.data === null`.
        *   If the user is *not* authenticated:
            *   Prevent the default date selection action.
            *   Trigger the login process using `signIn('credentials', { callbackUrl: '/bookings' })` (or your specific provider) from `next-auth/react`. This redirects to login and returns the user post-authentication.
        *   If the user *is* authenticated, allow the date selection logic to proceed as normal.

5.  **Extend Session Duration:**
    *   In the NextAuth configuration file:
        *   Locate or add the `session` object within the `NextAuthOptions`.
        *   Set the `maxAge` property to the desired duration in seconds (e.g., `30 * 24 * 60 * 60` for 30 days).
        *   Consider setting `updateAge` (e.g., `24 * 60 * 60`) to extend the session upon user activity.

6.  **Testing:**
    *   Verify accessing `/` redirects to `/bookings`.
    *   Verify `/bookings` loads correctly for unauthenticated users.
    *   Verify clicking a date on `/bookings` when unauthenticated redirects to the login page.
    *   Verify successful login redirects back to `/bookings`.
    *   Verify `/bookings` loads correctly for authenticated users.
    *   Verify clicking a date on `/bookings` when authenticated works as expected.
    *   Verify other protected routes still require login immediately.
    *   Verify the session persists for the newly configured duration. 