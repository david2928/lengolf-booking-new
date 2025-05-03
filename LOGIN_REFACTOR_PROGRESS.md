# Login Refactor - Progress Tracker

This document tracks the progress of the login refactor implementation based on `LOGIN_REFACTOR_IMPLEMENTATION.md`.

Mark items as complete by changing `[ ]` to `[x]`.

---

## Task 1: Modify Default Routing & Middleware

*   [x] **Sub-task 1.1:** Update Middleware Root Redirect (`/` -> `/bookings`).
*   [x] **Sub-task 1.2:** Remove Middleware Booking Protection (for `!token && pathname.startsWith('/bookings')`).
*   [x] **Sub-task 1.3:** Remove Root Page (`app/page.tsx`) Redirect.

---

## Task 2: Update Booking Page for Unauthenticated Access

*   [x] **Sub-task 2.1:** Remove Auth Check `useEffect` from `app/(features)/bookings/page.tsx`.

---

## Task 3: Implement Conditional Login & Auto-Selection in Booking Flow

*   [x] **Sub-task 3.1:** Add Dependencies (`useSession`, `signIn`, `useRouter`, `useSearchParams`) to `useBookingFlow.ts`.
*   [x] **Sub-task 3.2:** Modify `handleDateSelect` for Auth Check & URL Param generation.
*   [x] **Sub-task 3.3:** Add `useEffect` for Post-Login Auto-Selection (handle `selectDate` param).
*   [x] **Sub-task 3.4 (Optional):** Implement Loading State for auto-selection.

---

## Task 4: Configure Session Lifetime

*   [x] **Sub-task 4.1:** Add Session Config (`maxAge: 30d`, `updateAge: 0`) to `app/api/auth/options.ts`.

---

## Task 5: Enhance User Experience (Optional)

*   [x] **Sub-task 5.1:** Add Proactive Login/Logout Button to Header (`Layout.tsx`).

---

## Task 6: Testing & Verification

*   [ ] **Sub-task 6.1:** Test Unauthenticated Flow (Visit `/`, land on `/bookings`).
*   [ ] **Sub-task 6.2:** Test Login Trigger & Auto-Selection.
*   [ ] **Sub-task 6.3:** Test Authenticated Flow (Login first, then select date).
*   [ ] **Sub-task 6.4:** Test Session Expiry (30 days inactivity).
*   [ ] **Sub-task 6.5:** Test Error Handling (Invalid `selectDate` param, failed login).
*   [ ] **Sub-task 6.6:** Test API Route Protection (Direct access while logged out).

--- 