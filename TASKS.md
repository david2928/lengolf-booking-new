# LENGOLF VIP Feature - Development Tasks

This document outlines the development tasks for implementing the LENGOLF VIP feature. Tasks are divided between Backend (BE) and Frontend (FE) developers.

## Task Tracking Format

Each task will follow this format:

```
**Task ID:** VIP-[BE/FE]-XXX
**Title:** Brief description of the task
**Assignee:** BE Developer / FE Developer
**Status:** To Do | In Progress | In Review | Done
**Priority:** High | Medium | Low
**Description:** Detailed explanation of the task, referencing relevant documents (e.g., TECHNICAL_DESIGN_LENGOLF_VIP.md, DESIGN_LENGOLF_VIP_LINE_INTEGRATION.md, UI_INSTRUCTIONS_VIP_LANDING_PAGE.md) and existing code where applicable.
**Dependencies:** Task IDs this task depends on (e.g., VIP-BE-001)
**Acceptance Criteria:**
  - AC1
  - AC2
```

## Backend Tasks (BE Developer)

**Note:** All new API endpoints should be created under the `app/api/vip/` directory to maintain consistency with the existing project structure.

---

**Task ID:** VIP-BE-001
**Title:** Database Schema Modifications - `profiles` Table
**Assignee:** BE Developer
**Status:** To Do
**Priority:** High
**Description:** Add `marketing_preference` column to the `profiles` table as specified in `TECHNICAL_DESIGN_LENGOLF_VIP.md` (Section 3.1). Includes writing and applying the SQL migration script.
**Dependencies:** None
**Acceptance Criteria:**
  - `profiles` table has a `marketing_preference` column (BOOLEAN, NOT NULL, DEFAULT TRUE).
  - Migration script correctly updates existing rows and sets default for new rows.

---

**Task ID:** VIP-BE-002
**Title:** Implement RLS Policies
**Assignee:** BE Developer
**Status:** To Do
**Priority:** High
**Description:** Implement and apply Row Level Security (RLS) policies for `profiles`, `bookings`, `crm_customer_mapping`, `customers`, and `crm_packages` tables as detailed in `TECHNICAL_DESIGN_LENGOLF_VIP.md` (Section 3.4). Verify `auth.uid()` usage. Review impact on `anon` role.
**Dependencies:** VIP-BE-001
**Acceptance Criteria:**
  - RLS policies are active on the specified tables.
  - Users can only access/modify their own data as per policy definitions.
  - Access for `service_role` is maintained.
  - `anon` role access is reviewed and configured appropriately.

---

**Task ID:** VIP-BE-003
**Title:** Develop API Endpoint - `GET /api/vip/status`
**Assignee:** BE Developer
**Status:** To Do
**Priority:** High
**Description:** Create the endpoint at `app/api/vip/status/route.ts` to check user's CRM linking status as specified in `TECHNICAL_DESIGN_LENGOLF_VIP.md` (Section 4.1). Requires NextAuth authentication.
**Dependencies:** VIP-BE-001, VIP-BE-002
**Acceptance Criteria:**
  - Endpoint returns `linked_matched`, `linked_unmatched`, or `not_linked` status correctly.
  - Returns `crmCustomerId` and `stableHashId` when matched.
  - Endpoint is protected and requires authentication.

---

**Task ID:** VIP-BE-004
**Title:** Develop API Endpoint - `POST /api/vip/link-account`
**Assignee:** BE Developer
**Status:** To Do
**Priority:** High
**Description:** Create the endpoint at `app/api/vip/link-account/route.ts` for manual account linking via phone number, as per `TECHNICAL_DESIGN_LENGOLF_VIP.md` (Section 4.2). Implement matching logic.
**Dependencies:** VIP-BE-001, VIP-BE-002
**Acceptance Criteria:**
  - Endpoint accepts `phoneNumber` in the request body.
  - Successfully links account and updates `crm_customer_mapping` if a high-confidence match is found.
  - Returns appropriate success or error (not found) response.
  - Endpoint is protected and requires authentication.

---

**Task ID:** VIP-BE-005
**Title:** Develop API Endpoint - `GET /api/vip/profile`
**Assignee:** BE Developer
**Status:** To Do
**Priority:** High
**Description:** Create the endpoint at `app/api/vip/profile/route.ts` to fetch authenticated user's profile data, as per `TECHNICAL_DESIGN_LENGOLF_VIP.md` (Section 4.3). Combines data from `profiles` and linked `customers` table.
**Dependencies:** VIP-BE-001, VIP-BE-002, VIP-BE-003
**Acceptance Criteria:**
  - Endpoint returns user's name, email, phone number (from `customers` if matched), `pictureUrl`, and `marketingPreference`.
  - Endpoint is protected and requires authentication.

---

**Task ID:** VIP-BE-006
**Title:** Develop API Endpoint - `PUT /api/vip/profile`
**Assignee:** BE Developer
**Status:** To Do
**Priority:** Medium
**Description:** Create the endpoint at `app/api/vip/profile/route.ts` (using PUT method) to update user's editable profile data (`name`, `email`, `marketingPreference`), as per `TECHNICAL_DESIGN_LENGOLF_VIP.md` (Section 4.4).
**Dependencies:** VIP-BE-001, VIP-BE-002, VIP-BE-005
**Acceptance Criteria:**
  - Endpoint accepts optional `name`, `email`, `marketingPreference` in the request body.
  - Updates the `profiles` table for the authenticated user.
  - Returns success response with a list of updated fields.
  - Endpoint is protected and requires authentication.

---

**Task ID:** VIP-BE-007
**Title:** Develop API Endpoint - `GET /api/vip/bookings`
**Assignee:** BE Developer
**Status:** To Do
**Priority:** High
**Description:** Create the endpoint at `app/api/vip/bookings/route.ts` to fetch user's past and future bookings, as per `TECHNICAL_DESIGN_LENGOLF_VIP.md` (Section 4.5). Implement pagination and filtering.
**Dependencies:** VIP-BE-002
**Acceptance Criteria:**
  - Endpoint returns bookings for the authenticated user.
  - Supports `page`, `limit`, and `filter` (future, past, all) query parameters.
  - Returns pagination metadata.
  - Endpoint is protected and requires authentication.

---

**Task ID:** VIP-BE-008
**Title:** Develop API Endpoint - `PUT /api/vip/bookings/{bookingId}/modify`
**Assignee:** BE Developer
**Status:** To Do
**Priority:** Medium
**Description:** Create the endpoint at `app/api/vip/bookings/[bookingId]/modify/route.ts` to modify a future, confirmed booking, as per `TECHNICAL_DESIGN_LENGOLF_VIP.md` (Section 4.6). Includes availability check and async tasks for calendar/notifications.
**Dependencies:** VIP-BE-002, VIP-BE-007, VIP-BE-014
**Acceptance Criteria:**
  - Endpoint accepts `date`, `startTime`, `duration` in the request body.
  - Verifies booking ownership, status, and future date.
  - Calls availability check; returns 409 if slot unavailable.
  - Updates booking details if available.
  - Triggers async Google Calendar update and Staff Notification.
  - Endpoint is protected and requires authentication.

---

**Task ID:** VIP-BE-009
**Title:** Develop API Endpoint - `POST /api/vip/bookings/{bookingId}/cancel`
**Assignee:** BE Developer
**Status:** To Do
**Priority:** Medium
**Description:** Create the endpoint at `app/api/vip/bookings/[bookingId]/cancel/route.ts` to cancel a future, confirmed booking, as per `TECHNICAL_DESIGN_LENGOLF_VIP.md` (Section 4.7). Includes async tasks for calendar/notifications.
**Dependencies:** VIP-BE-002, VIP-BE-007
**Acceptance Criteria:**
  - Verifies booking ownership, status, and future date.
  - Updates booking status to 'cancelled'.
  - Triggers async Google Calendar update and Staff Notification.
  - Endpoint is protected and requires authentication.

---

**Task ID:** VIP-BE-010
**Title:** Develop API Endpoint - `GET /api/vip/packages`
**Assignee:** BE Developer
**Status:** To Do
**Priority:** Medium
**Description:** Create the endpoint at `app/api/vip/packages/route.ts` to fetch user's active and past packages, as per `TECHNICAL_DESIGN_LENGOLF_VIP.md` (Section 4.8). Requires linked CRM customer.
**Dependencies:** VIP-BE-002, VIP-BE-003
**Acceptance Criteria:**
  - Returns active and past packages if user is linked and matched.
  - Returns empty lists if user is not matched.
  - Endpoint is protected and requires authentication.

---

**Task ID:** VIP-BE-011
**Title:** Core Logic - Adapt `getOrCreateCrmMapping` for Placeholder Creation
**Assignee:** BE Developer
**Status:** To Do
**Priority:** High
**Description:** Modify `utils/customer-matching.ts` (function `getOrCreateCrmMapping` or similar logic called from NextAuth callbacks in `app/api/auth/options.ts`) to create placeholder `crm_customer_mapping` records (`is_matched = false`) if no CRM match is found during user sign-in/session validation. See `TECHNICAL_DESIGN_LENGOLF_VIP.md` (Section 6) and `DESIGN_LENGOLF_VIP_LINE_INTEGRATION.md` (Section 2.1, Step 5).
**Dependencies:** VIP-BE-001
**Acceptance Criteria:**
  - When a new user signs in and no CRM match is found, a placeholder record is created in `crm_customer_mapping`.
  - `is_matched` is set to `false`, `crm_customer_id` and `stable_hash_id` are `NULL`.
  - If a match is found, `is_matched` is `true` and IDs are populated.

---

**Task ID:** VIP-BE-012
**Title:** Core Logic - Staff Notifications for Booking Changes
**Assignee:** BE Developer
**Status:** To Do
**Priority:** Medium
**Description:** Implement or adapt functions in `lib/lineNotifyService.ts` to send staff notifications for VIP booking modifications and cancellations, as per `TECHNICAL_DESIGN_LENGOLF_VIP.md` (Section 6).
**Dependencies:** VIP-BE-008, VIP-BE-009
**Acceptance Criteria:**
  - Staff receive LINE notifications when a VIP modifies a booking.
  - Staff receive LINE notifications when a VIP cancels a booking.
  - Notifications are triggered asynchronously.

---

**Task ID:** VIP-BE-013
**Title:** Core Logic - Google Calendar Updates for Booking Changes
**Assignee:** BE Developer
**Status:** To Do
**Priority:** Medium
**Description:** Implement or adapt async handlers for Google Calendar updates (event move/resize/delete) when VIPs modify or cancel bookings, as per `TECHNICAL_DESIGN_LENGOLF_VIP.md` (Section 6). This might involve reusing or adapting logic related to `app/api/bookings/calendar/create/route.ts`.
**Dependencies:** VIP-BE-008, VIP-BE-009
**Acceptance Criteria:**
  - Google Calendar events are updated/deleted when a VIP modifies/cancels a booking.
  - Updates are handled asynchronously.
  - Robust error handling for calendar API interactions.

---

**Task ID:** VIP-BE-014
**Title:** Review and Adapt Existing Availability Check API
**Assignee:** BE Developer
**Status:** To Do
**Priority:** Medium
**Description:** Review `app/api/availability/check/route.ts` for use by the booking modification logic (`VIP-BE-008`). Ensure it correctly handles the `duration` parameter and other requirements for VIP modifications.
**Dependencies:** VIP-BE-008
**Acceptance Criteria:**
  - Availability check API (`app/api/availability/check/route.ts`) is suitable and correctly integrated for VIP booking modifications.

---

## Frontend Tasks (FE Developer)

**Note on Integration:** The VIP feature frontend will be integrated into the main `lengolf-booking-refactor` Next.js application. Code from the `lengolf-vip-dashboard-view` project (likely a UI prototype) should be migrated and adapted to fit this structure:
*   **Pages:** Under `app/(features)/vip/` (e.g., `app/(features)/vip/dashboard/page.tsx`, `app/(features)/vip/profile/page.tsx`). The main landing page for VIP could be `app/(features)/vip/page.tsx`.
*   **Layout:** A main layout for the VIP section at `app/(features)/vip/layout.tsx`.
*   **Reusable Components:** In `components/vip/` (at the project root, alongside existing `components/ui/`, `components/shared/`).
*   **Page-Specific Components:** Can be co-located within the respective page directories under `app/(features)/vip/` or placed in `components/vip/` if preferred.

---

**Task ID:** VIP-FE-000
**Title:** Scaffold VIP Feature Structure and Migrate UI Code
**Assignee:** FE Developer
**Status:** To Do
**Priority:** High
**Description:** Create the necessary directory structure for the VIP feature within the `lengolf-booking-refactor` project (i.e., `app/(features)/vip/`, `components/vip/`). Migrate relevant React components and page structures from `lengolf-vip-dashboard-view` into this new structure. Adapt imports and basic configurations as needed for Next.js compatibility.
**Dependencies:** None
**Acceptance Criteria:**
  - VIP feature directories (`app/(features)/vip/`, `components/vip/`) are created.
  - Core UI components and page layouts from `lengolf-vip-dashboard-view` are moved to the new structure.
  - Basic rendering of migrated components within the Next.js environment is functional (data integration will follow).

---

**Task ID:** VIP-FE-001
**Title:** Setup API Service Layer for VIP Endpoints
**Assignee:** FE Developer
**Status:** To Do
**Priority:** High
**Description:** Create or update services (e.g., in a new `lib/vipService.ts` or adapt `lengolf-vip-dashboard-view/src/services/vipService.ts` and place it appropriately) to interact with all new BE VIP API endpoints (`/api/vip/*`).
**Dependencies:** All VIP-BE API tasks (VIP-BE-003 to VIP-BE-010), VIP-FE-000
**Acceptance Criteria:**
  - Functions exist to call each VIP backend API.
  - Handles request/response typing according to API specifications.
  - Includes error handling.

---

**Task ID:** VIP-FE-002
**Title:** Implement VIP Layout (`app/(features)/vip/layout.tsx`) Authentication and Status Handling
**Assignee:** FE Developer
**Status:** To Do
**Priority:** High
**Description:** Create and implement `app/(features)/vip/layout.tsx`. This layout should handle NextAuth authentication checks for all VIP pages. Fetch VIP status (`GET /api/vip/status`) and make it available (e.g., via context or props) to child pages to control content visibility based on `is_matched` status as per `TECHNICAL_DESIGN_LENGOLF_VIP.md` (Section 5) and `UI_INSTRUCTIONS_VIP_LANDING_PAGE.md`.
**Dependencies:** VIP-BE-003, VIP-FE-000, VIP-FE-001
**Acceptance Criteria:**
  - Users are redirected if not authenticated when accessing VIP routes.
  - VIP status is fetched and stored appropriately.
  - The layout provides a consistent structure for VIP pages (e.g., navigation specific to VIP area).
  - Content within VIP sections dynamically changes based on `is_matched` status.

---

**Task ID:** VIP-FE-003
**Title:** Integrate VIP Landing Page / Dashboard View (`app/(features)/vip/page.tsx` or `/dashboard/page.tsx`)
**Assignee:** FE Developer
**Status:** To Do
**Priority:** High
**Description:** Adapt the `DashboardView` component (migrated from `lengolf-vip-dashboard-view/src/components/vip/DashboardView.tsx` to `components/vip/DashboardView.tsx`) and use it in the main VIP landing page (e.g., `app/(features)/vip/page.tsx`). Connect with live data from `GET /api/vip/status`, `GET /api/vip/profile` (for username), `GET /api/vip/bookings` (for next booking), and `GET /api/vip/packages` (for active packages count). Ensure it reflects Scenarios A & B from `UI_INSTRUCTIONS_VIP_LANDING_PAGE.md` (Section 3.2).
**Dependencies:** VIP-BE-003, VIP-BE-005, VIP-BE-007, VIP-BE-010, VIP-FE-000, VIP-FE-001, VIP-FE-002
**Acceptance Criteria:**
  - Dashboard displays "Welcome back, [User's Display Name]!".
  - If `is_matched = true`:
    - Shows "Next Upcoming Booking" snippet or "No upcoming bookings" message.
    - Shows "Active Packages" snippet or "No active packages" message.
    - Shows navigation CTAs to Profile, Bookings, Packages (using `DashboardCard.tsx` component from `components/vip/`).
  - If `is_matched = false`:
    - Shows "Link Your Account" prompt (using `LinkAccountPrompt.tsx` from `components/vip/`) prominently.
    - CTA links to the manual account linking page (`app/(features)/vip/link-account/page.tsx`).
    - Shows limited navigation (e.g., Profile).

---

**Task ID:** VIP-FE-004
**Title:** Implement/Integrate Manual Account Linking Page (`app/(features)/vip/link-account/page.tsx`)
**Assignee:** FE Developer
**Status:** To Do
**Priority:** High
**Description:** Create the `app/(features)/vip/link-account/page.tsx` page. Adapt `ManualLinkAccountForm` (or `LinkAccount.tsx` from `lengolf-vip-dashboard-view/src/pages/`, placing the form component in `components/vip/ManualLinkAccountForm.tsx` or co-locating). This page allows users with `is_matched = false` to attempt linking via phone number using `POST /api/vip/link-account`. Handle loading, success (redirect), and error states. See `UI_INSTRUCTIONS_VIP_LANDING_PAGE.md` (Scenario B) and `DESIGN_LENGOLF_VIP_LINE_INTEGRATION.md` (Section 2.1, Step 6).
**Dependencies:** VIP-BE-004, VIP-FE-000, VIP-FE-001, VIP-FE-002
**Acceptance Criteria:**
  - Page is accessible, especially when `is_matched = false`.
  - Form submits phone number to the backend.
  - Displays loading state during API call.
  - On success, redirects to VIP dashboard or main VIP page.
  - Displays error messages from backend if linking fails (e.g., "No matching customer account found.").

---

**Task ID:** VIP-FE-005
**Title:** Integrate Profile View and Edit Page (`app/(features)/vip/profile/page.tsx`)
**Assignee:** FE Developer
**Status:** To Do
**Priority:** Medium
**Description:** Create `app/(features)/vip/profile/page.tsx`. Adapt `ProfileView` (or `VipProfile.tsx` from `lengolf-vip-dashboard-view`, potentially placing the view/form component in `components/vip/ProfileView.tsx`) to connect with `GET /api/vip/profile` to display user data and `PUT /api/vip/profile` to update name, email, and marketing preference. Ensure phone number from linked CRM (if available) is displayed but not editable.
**Dependencies:** VIP-BE-005, VIP-BE-006, VIP-FE-000, VIP-FE-001
**Acceptance Criteria:**
  - Profile page displays data fetched from the backend.
  - User can edit their name, email, and marketing preference.
  - Changes are saved via the backend API.
  - Phone number is displayed correctly (from CRM if matched and available, non-editable).

---

**Task ID:** VIP-FE-006
**Title:** Integrate Bookings List Page (`app/(features)/vip/bookings/page.tsx`)
**Assignee:** FE Developer
**Status:** To Do
**Priority:** Medium
**Description:** Create `app/(features)/vip/bookings/page.tsx`. Adapt `BookingsList` (or `VipBookings.tsx`) to connect to `GET /api/vip/bookings`. Implement filters (future/past/all) and pagination. Display `EmptyState` if no bookings or if `is_matched = false`. Include Modify/Cancel buttons for relevant bookings.
**Dependencies:** VIP-BE-007, VIP-FE-000, VIP-FE-001, VIP-FE-002
**Acceptance Criteria:**
  - Booking list displays data from the backend.
  - Filtering and pagination work as expected.
  - Shows `EmptyState` (from `components/vip/EmptyState.tsx` or similar) or "Link account" prompt if `is_matched = false` or no bookings.
  - Modify/Cancel buttons are shown for future, confirmed bookings.

---

**Task ID:** VIP-FE-007
**Title:** Implement/Integrate Booking Modification Modal
**Assignee:** FE Developer
**Status:** To Do
**Priority:** Medium
**Description:** Develop/Integrate `BookingModifyModal` (likely as a component in `components/vip/BookingModifyModal.tsx`). Form for new date/time/duration. Calls `POST /api/availability/check` (via a frontend service) and submits to `PUT /api/vip/bookings/{id}/modify`. Handle loading/error states (e.g., "Slot unavailable").
**Dependencies:** VIP-BE-008, VIP-BE-014, VIP-FE-000, VIP-FE-001, VIP-FE-006
**Acceptance Criteria:**
  - Modal allows user to select new date, time, and duration.
  - Availability is checked before submission.
  - Booking modification is submitted to the backend.
  - Handles success (update UI) and error messages (e.g., slot unavailable, other errors).

---

**Task ID:** VIP-FE-008
**Title:** Implement/Integrate Booking Cancellation Modal
**Assignee:** FE Developer
**Status:** To Do
**Priority:** Medium
**Description:** Develop/Integrate `BookingCancelModal` (likely as a component in `components/vip/BookingCancelModal.tsx`). Confirmation prompt. Submits to `POST /api/vip/bookings/{id}/cancel`. Handle loading/error states.
**Dependencies:** VIP-BE-009, VIP-FE-000, VIP-FE-001, VIP-FE-006
**Acceptance Criteria:**
  - Modal shows confirmation prompt for cancellation.
  - Cancellation request is submitted to the backend.
  - Handles success (update UI) and error messages.

---

**Task ID:** VIP-FE-009
**Title:** Integrate Packages View Page (`app/(features)/vip/packages/page.tsx`)
**Assignee:** FE Developer
**Status:** To Do
**Priority:** Medium
**Description:** Create `app/(features)/vip/packages/page.tsx`. Adapt `PackagesView` (or `VipPackages.tsx`) to connect to `GET /api/vip/packages`. Display active/past packages. Display `EmptyState` if no packages or if `is_matched = false`.
**Dependencies:** VIP-BE-010, VIP-FE-000, VIP-FE-001, VIP-FE-002
**Acceptance Criteria:**
  - Package list displays data from the backend.
  - Shows active and past packages correctly.
  - Shows `EmptyState` or "Link account" prompt if `is_matched = false` or no packages.

---

**Task ID:** VIP-FE-010
**Title:** Implement Reusable `EmptyState` Component and Usage
**Assignee:** FE Developer
**Status:** To Do
**Priority:** Low
**Description:** Ensure a reusable `EmptyState` component (e.g., `components/vip/EmptyState.tsx`, adapted from `lengolf-vip-dashboard-view` or created new) exists and is used appropriately in Bookings, Packages, and other views when data is empty or user needs to link their account (as per `TECHNICAL_DESIGN_LENGOLF_VIP.md` Section 5 and `UI_INSTRUCTIONS_VIP_LANDING_PAGE.md`).
**Dependencies:** VIP-FE-000, VIP-FE-003, VIP-FE-006, VIP-FE-009
**Acceptance Criteria:**
  - `EmptyState` component is well-defined and reusable in `components/vip/`.
  - Correctly displayed in relevant sections with appropriate messages and CTAs (e.g., "Link your account").

---

**Task ID:** VIP-FE-011
**Title:** Styling and Responsiveness Review
**Assignee:** FE Developer
**Status:** To Do
**Priority:** Medium
**Description:** Review all VIP pages and components against `UI_INSTRUCTIONS_VIP_LANDING_PAGE.md` for styling (Tailwind CSS, brand consistency, colors, typography) and responsiveness (especially for LIFF mobile view). Ensure consistency with the main `lengolf-booking-refactor` project's `tailwind.config.ts` and `app/globals.css`.
**Dependencies:** All other VIP-FE integration tasks (VIP-FE-002 to VIP-FE-010).
**Acceptance Criteria:**
  - UI adheres to `tailwind.config.ts` and `app/globals.css` of the main project.
  - All pages are responsive and work well on desktop, tablet, and mobile (LIFF).
  - Visual style matches design document requirements (modern, clean, Lengolf branding).

---

**Task ID:** VIP-FE-012
**Title:** Error Handling and Loading States
**Assignee:** FE Developer
**Status:** To Do
**Priority:** Medium
**Description:** Implement consistent loading indicators (spinners, skeleton screens) and user-friendly error messages for all data fetching and mutation operations across the VIP section, as per `UI_INSTRUCTIONS_VIP_LANDING_PAGE.md` (Section 4). Utilize existing UI components from `components/ui` or ShadCN if applicable and consistent.
**Dependencies:** All data-dependent VIP-FE tasks.
**Acceptance Criteria:**
  - Loading states are shown during API calls.
  - User-friendly error messages are displayed for API failures or validation issues.
  - Toasts or inline messages are used consistently for feedback.

---

**Task ID:** VIP-FE-013
**Title:** LIFF Integration Considerations
**Assignee:** FE Developer
**Status:** To Do
**Priority:** Medium
**Description:** Ensure that the VIP pages within `lengolf-booking-refactor` are compatible with being rendered inside a LINE LIFF view. This includes testing navigation, responsiveness, and any LIFF-specific API interactions if necessary.
**Dependencies:** VIP-FE-011
**Acceptance Criteria:**
  - VIP pages render correctly within a LIFF environment.
  - UI is optimized for mobile view within LIFF.

--- 