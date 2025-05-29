# VIP Feature LIFF Integration Design

## 1. Overview

This document outlines the design and considerations for integrating the Lengolf VIP self-service portal into the LINE Front-end Framework (LIFF). The goal is to allow users to access their VIP dashboard and features seamlessly within the LINE application.

LIFF enables web applications to be displayed within LINE's in-app browser, providing access to user information and LINE-specific functionalities through the LIFF SDK.

## 2. Key Integration Points

### 2.1. LIFF SDK Integration

*   **Installation:**
    *   The LIFF SDK will be installed via npm/yarn: `npm install @line/liff` or `yarn add @line/liff`.
    *   This is preferred over CDN for better dependency management within the Next.js project.
*   **Initialization (`liff.init()`):**
    *   **Location:** LIFF initialization should occur early in the VIP feature's lifecycle. `app/(features)/vip/layout.tsx` is a strong candidate for placing the `liff.init()` call within a `useEffect` hook.
    *   **LIFF ID:** A unique LIFF ID obtained from the LINE Developers Console for this specific VIP portal LIFF app is required.
    *   **Process:**
        ```typescript
        // In app/(features)/vip/layout.tsx or a similar top-level VIP component
        import liff from '@line/liff';
        import { useEffect, useState } from 'react';

        // ...
        const [liffInitialized, setLiffInitialized] = useState(false);
        const [liffError, setLiffError] = useState<Error | null>(null);
        const LIFF_ID = "YOUR_ACTUAL_LIFF_ID"; // Store securely or via env variable

        useEffect(() => {
          const initializeLiff = async () => {
            try {
              await liff.init({ liffId: LIFF_ID });
              setLiffInitialized(true);
              // Optional: Check login status
              // if (liff.isLoggedIn()) {
              //   // Potentially fetch profile or proceed with app logic
              // } else {
              //   // Optional: Redirect to LIFF login if required immediately
              //   // liff.login();
              // }
            } catch (error) {
              console.error('LIFF Initialization failed:', error);
              setLiffError(error as Error);
            }
          };
          initializeLiff();
        }, []);

        if (liffError) {
          // Render an error message to the user
          return <div>Error initializing LIFF: {liffError.message}. Please try again later.</div>;
        }
        if (!liffInitialized) {
          // Render a loading state (e.g., spinner)
          return <div>Loading VIP Portal...</div>;
        }
        // ... rest of the layout/page rendering
        ```
    *   Loading and error states during initialization must be handled gracefully.

### 2.2. Authentication Strategy

This is a critical integration point that requires careful planning to bridge LIFF authentication with the existing `next-auth` system.

*   **Objective:** Authenticate the user via LINE within the LIFF environment and establish a corresponding session in the Lengolf application.
*   **Proposed Flow:**
    1.  **LIFF Initialization:** As above.
    2.  **Check LIFF Login:** After successful `liff.init()`, check `liff.isLoggedIn()`.
    3.  **LIFF Login (if needed):** If not logged in via LIFF, call `liff.login()`. This will redirect the user through LINE's authentication flow.
    4.  **Get LIFF Access Token:** Once the user is logged in via LIFF, retrieve the LIFF access token: `const accessToken = liff.getAccessToken();`.
    5.  **Backend Verification:**
        *   Send this `accessToken` to a dedicated Lengolf backend API endpoint (e.g., `/api/auth/line-liff-signin`).
        *   The backend will verify this token with LINE's servers (using LINE's API).
        *   Upon successful verification, the backend will also receive user profile information from LINE.
    6.  **User Account Linking/Creation & Session Management:**
        *   The backend will use the verified LINE user ID (and potentially email) to find an existing Lengolf user account or create a new one (if auto-creation is desired).
        *   A `next-auth` session will then be established for this user. The `next-auth` `signIn` method (potentially with a custom credential provider or by directly creating a session if the backend handles user lookup) will be used.
    7.  **Context Update:** The `VipContext` should reflect the authenticated state and user information derived from this process.
*   **Considerations:**
    *   How to handle cases where a LINE user is new to Lengolf vs. an existing Lengolf user logging in via LINE for the first time.
    *   The user experience for account linking if a LINE email matches an existing Lengolf account without LINE linked.
    *   Securely handling the LIFF access token.

### 2.3. UI/UX Adjustments for LIFF Environment

The application should adapt its appearance and behavior when running inside the LIFF browser.

*   **Responsiveness:** All VIP pages and components must be fully responsive to work well in various LIFF view sizes (Full, Tall, Compact). This is largely covered by `VIP-FE-011`.
*   **Detecting LIFF Environment:** Use `liff.isInClient()` to determine if the app is running within the LINE app.
*   **Conditional Rendering:**
    *   **Navigation:** The main website header and footer might be redundant if LIFF provides its own navigation elements or if the LIFF app is meant to feel more integrated. These could be conditionally hidden in `app/(features)/vip/layout.tsx`.
        ```typescript
        // Example in app/(features)/vip/layout.tsx
        const [isRunningInLiff, setIsRunningInLiff] = useState(false);
        useEffect(() => {
          if (liffInitialized) {
            setIsRunningInLiff(liff.isInClient());
          }
        }, [liffInitialized]);

        // ...
        // {!isRunningInLiff && <MainWebsiteHeader />}
        // ... page content ...
        // {!isRunningInLiff && <MainWebsiteFooter />}
        ```
    *   **Specific LIFF Controls:** Elements like a "Close LIFF" button might only be relevant when `liff.isInClient()` is true.
*   **Styling:** Minor styling adjustments might be needed for a more "native" feel within LINE.

### 2.4. Utilizing LIFF APIs

Leverage LIFF SDK features to enhance the user experience.

*   **`liff.getProfile()`:**
    *   Once authenticated, fetch the user's LINE profile (display name, picture URL, status message).
    *   This information can be used to personalize the VIP dashboard or pre-fill forms.
*   **`liff.closeWindow()`:**
    *   Provide a clear way for users to close the LIFF window and return to their chat with the LINE Official Account (e.g., a "Done" or "Close" button on certain pages or after completing an action).
*   **`liff.sendMessages()`:** (Optional)
    *   Allow users to share information or confirmations from the VIP portal back to a LINE chat (e.g., sharing booking details). This requires careful consideration of message content and user consent.
*   **Deep Linking:**
    *   Configure LIFF URLs in the LINE Developers Console to allow deep linking into specific sections of the VIP portal directly from LINE messages (e.g., `line://app/YOUR_LIFF_ID/vip/bookings`). This requires Next.js routing to handle these paths correctly.

## 3. Component/Page Specific Considerations

*   **`app/(features)/vip/layout.tsx`:**
    *   Primary location for `liff.init()`.
    *   Handles conditional rendering of global UI elements (header/footer) based on `liff.isInClient()`.
    *   Manages global loading/error states for LIFF initialization.
*   **Authentication Pages (e.g., if a separate login page is hit before LIFF context is established):**
    *   Should ideally redirect to LIFF login flow if accessed within LINE and not yet authenticated via LIFF.
*   **VIP Dashboard (`app/(features)/vip/page.tsx`):**
    *   Can be personalized using `liff.getProfile()`.
    *   Ensure all dashboard components are responsive.
*   **Booking Modification/Cancellation:**
    *   After actions like "Cancel Booking", consider if `liff.closeWindow()` should be called or if the user should be redirected to another page within the LIFF app.
*   **Profile Page (`app/(features)/vip/profile/page.tsx`):**
    *   Can pre-fill or display LINE profile information alongside CRM data.

## 4. Development & Testing

*   **LINE Developers Console:**
    *   Register the VIP portal as a LIFF app.
    *   Configure endpoint URL(s) (e.g., `https://your-lengolf-domain.com/vip`).
    *   Set LIFF browser size (Full is likely appropriate for a dashboard).
    *   Manage channel access permissions.
*   **Testing Environment:**
    *   Primary testing must be done on a mobile device with the LINE app installed.
    *   Use the LIFF URL (`line://app/YOUR_LIFF_ID`) or QR code from the console.
    *   Test various scenarios: first-time user, returning user, different LIFF entry points (if deep links are used).
*   **HTTPS Requirement:** All LIFF app content must be served over HTTPS. Vercel deployments handle this.
*   **Debugging:** Use browser developer tools (remote debugging for mobile webviews) and LIFF SDK logging.

## 5. Open Questions & Decisions

*   **Precise `next-auth` integration:**
    *   Will a new `CredentialsProvider` be added to `next-auth` for LIFF, or will a custom API endpoint handle the LIFF token verification and `next-auth` session creation more directly?
    *   How will `next-auth` `callbacks` (e.g., `jwt`, `session`) be adapted to include LIFF-derived information if needed?
*   **User experience for account linking conflicts:**
    *   What if a user's LINE email is already associated with a Lengolf account that isn't linked to that LINE profile?
    *   What if a user tries to link a LINE account already linked to another Lengolf profile?
*   **Scope of LIFF-specific UI changes:**
    *   Exactly which common UI elements (header, footer, main navigation) will be hidden/altered when in LIFF?
*   **Error Handling Specific to LIFF APIs:**
    *   Develop a consistent strategy for handling errors from `liff.getProfile()`, `liff.sendMessages()`, etc.

This document will serve as a guide for the development and will be updated as decisions are made and implementation progresses. 