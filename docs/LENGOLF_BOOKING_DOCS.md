# LENGOLF Booking Website - Technical & Logical Documentation (Enhanced)

## 1. Introduction

This document provides a detailed technical and logical overview of the LENGOLF booking website application (`lengolf-booking-refactor` codebase). Its purpose is to help developers of the LENGOLF backoffice application understand how the customer-facing booking system works.

The application allows users to book indoor golf simulator bays at LENGOLF, located at Mercury Ville @ BTS Chidlom, Bangkok. It integrates with Google Calendar for availability, Supabase for data storage, NextAuth.js for authentication, and includes features like CRM customer matching and automated notifications.

## 2. Technical Stack

The application is built using the following technologies:

*   **Framework:** [Next.js](https://nextjs.org/) (v15) - A React framework for server-side rendering (SSR), static site generation (SSG), and API routes. Uses the App Router.
*   **Language:** [TypeScript](https://www.typescriptlang.org/)
*   **UI Library:** [React](https://reactjs.org/) (v18)
*   **Styling:** [Tailwind CSS](https://tailwindcss.com/) with PostCSS and Autoprefixer. Uses `tailwind-merge` for utility class merging.
*   **UI Components:**
    *   [Headless UI](https://headlessui.dev/) - Unstyled, accessible UI components.
    *   [Heroicons](https://heroicons.com/) - SVG icons.
    *   Custom components located primarily in `components/` and feature-specific directories like `app/(features)/bookings/components/`.
*   **State Management:** Primarily React Context (`SessionProvider` for auth) and component-level state (e.g., `useState`, custom hooks like `useBookingFlow`).
*   **Animation:** [Framer Motion](https://www.framer.com/motion/)
*   **Backend / Database:** [Supabase](https://supabase.io/)
    *   `@supabase/supabase-js`: Client library for interacting with Supabase backend (Database, Auth, etc.).
    *   `@supabase/ssr`: Helpers for server-side rendering with Supabase in Next.js.
*   **Authentication:** [NextAuth.js](https://next-auth.js.org/) (v4)
    *   `@auth/supabase-adapter`: Adapter to use Supabase as the database for NextAuth.js user sessions and accounts.
    *   Handles user login, session management.
*   **API Handling:** Next.js API Routes (`app/api/`) and Server Actions (`app/(features)/bookings/actions.ts`).
*   **Date/Time:**
    *   `date-fns` / `date-fns-tz`: For date formatting and time zone handling.
    *   `luxon`: Alternative date/time library (usage might overlap or be specific).
*   **Form Handling / UI:**
    *   `react-datepicker` / `react-day-picker`: For selecting dates.
    *   `react-phone-number-input`: For standardized phone number input.
*   **Utilities:**
    *   `nodemailer`: Sending emails (likely for notifications).
    *   `html2canvas`: Taking screenshots/rendering HTML to canvas (purpose needs investigation).
    *   `uuid`: Generating unique IDs.
    *   `natural`: Natural language processing (purpose needs investigation, perhaps for search or parsing).
    *   `csv-parser`: Parsing CSV data (purpose needs investigation).
    *   `googleapis`: Google API client library.
*   **Testing:** [Jest](https://jestjs.io/) with [React Testing Library](https://testing-library.com/docs/react-testing-library/intro/).
*   **Linting/Formatting:** ESLint, Prettier.
*   **Deployment:** Likely Vercel (presence of `vercel.json`, `.vercel/`, Next.js focus). Uses Docker (`Dockerfile`, `.dockerignore`).

## 3. Project Structure (Key Directories)

The project uses the Next.js App Router structure.

'''
/
├── app/                      # Main application directory (App Router)
│   ├── (features)/           # Organizational folder for core features
│   │   ├── auth/             # Authentication related pages (login, etc.)
│   │   │   ├── login/
│   │   │   └── ...
│   │   └── bookings/         # Booking feature pages and logic
│   │       ├── confirmation/ # Booking confirmation page
│   │       ├── components/   # UI components specific to bookings
│   │       ├── hooks/        # React hooks specific to bookings (e.g., useBookingFlow)
│   │       ├── types/        # TypeScript types for bookings
│   │       ├── actions.ts    # Server Actions for booking operations
│   │       └── page.tsx      # Main booking page component
│   ├── api/                  # API route handlers
│   │   ├── auth/             # NextAuth.js routes ([...nextauth])
│   │   ├── availability/     # API for checking tee time availability
│   │   ├── bookings/         # API for managing bookings
│   │   ├── crm/              # API for CRM integration (potential)
│   │   └── notifications/    # API for sending notifications
│   ├── layout.tsx            # Root layout component
│   ├── page.tsx              # Root page component (landing page)
│   ├── providers.tsx         # Client-side context providers (SessionProvider)
│   └── globals.css           # Global CSS styles
├── components/               # Shared UI components across the application
├── lib/                      # Shared library functions/utilities/Supabase client setup
├── utils/                    # General utility functions
├── public/                   # Static assets (images, fonts)
├── supabase/                 # Supabase local development/migration files
├── types/                    # Global TypeScript types
├── middleware.ts             # Next.js middleware (e.g., for auth protection)
├── next.config.js            # Next.js configuration
├── package.json              # Project dependencies and scripts
├── tsconfig.json             # TypeScript configuration
└── ...                     # Other configuration files (Tailwind, PostCSS, ESLint, etc.)
'''

## 4. API Endpoint Documentation (`app/api/`)

This section details the backend API routes used by the application. Most data-fetching or mutation logic resides here or in Server Actions.

### 4.1. Authentication (`/api/auth`)

*   **`/[...nextauth]/route.ts` (Catch-all: GET, POST, etc.)**
    *   **Description:** Handles all core NextAuth.js operations (sign in, sign out, callbacks, session management, provider interactions).
    *   **Logic:** Delegates to the configuration in `options.ts`. Uses Supabase adapter for persistence.
    *   **Auth Required:** Varies by specific NextAuth operation.
    *   **Configuration:** `app/api/auth/options.ts` defines providers, adapter, callbacks, etc.

### 4.2. Availability (`/api/availability`)

*   **`/route.ts` (POST)**
    *   **Description:** Fetches available booking slots for a given date.
    *   **Input:** JSON body `{ date: string, currentTimeInBangkok: string }`.
    *   **Logic:** Checks Google Calendars for all bays (`lib/googleApiConfig.ts`), considers operating hours, calculates available slots and max duration per slot. Uses caching (`lib/cache.ts`).
    *   **Auth Required:** Yes (NextAuth token).
    *   **Output:** JSON `{ slots: Array<{ startTime: string, endTime: string, maxHours: number, period: string }> }`.
*   **`/check/route.ts` (POST)**
    *   **Description:** Performs a final availability check for a specific slot just before booking. Used internally by `/api/bookings/create`.
    *   **Input:** JSON body `{ date: string, startTime: string, duration: number }`.
    *   **Logic:** Verifies if *at least one bay* is available for the entire requested time range by checking Google Calendars.
    *   **Auth Required:** Yes (NextAuth token).
    *   **Output:** JSON `{ available: boolean, bay?: string, allAvailableBays?: string[] }`.

### 4.3. Bookings (`/api/bookings`)

*   **`/create/route.ts` (POST)**
    *   **Description:** The primary endpoint for creating a new booking. Orchestrates multiple steps.
    *   **Input:** JSON body with full booking details (user info, date, time, duration, notes, etc.).
    *   **Logic:**
        1.  Authenticates user.
        2.  Validates input.
        3.  Performs final availability check via `/api/availability/check`. Assigns bay.
        4.  Matches customer to CRM data (`utils/customer-matching.ts`).
        5.  Checks for customer packages (Supabase `crm_packages`).
        6.  Inserts booking record into Supabase `bookings` table.
        7.  Creates Google Calendar event via `/api/bookings/calendar/create`.
        8.  Sends Email & LINE notifications via `/api/notifications/*` (parallel).
        9.  Schedules review request (`lib/reviewRequestScheduler.ts`).
        10. Logs process steps (optional).
    *   **Auth Required:** Yes (NextAuth token).
    *   **Output:** JSON `{ success: boolean, bookingId?: string, error?: string }`.
*   **`/calendar/create/route.ts` (POST)**
    *   **Description:** Creates an event on Google Calendar for a specific booking. Called internally by `/api/bookings/create`.
    *   **Input:** JSON body `{ bookingDetails: object, calendarId: string }`.
    *   **Logic:** Uses `googleapis` to insert the event into the specified Google Calendar ID.
    *   **Auth Required:** Yes (NextAuth token, although called server-to-server).
    *   **Output:** JSON `{ success: boolean, event?: object, error?: string }`.

### 4.4. CRM (`/api/crm`)

*   **`/match/route.ts` (GET, POST)**
    *   **GET:** Retrieves the CRM customer data mapped to the currently logged-in user. Requires `profileId` query param. User can only access their own data.
    *   **POST:** Triggers a new CRM matching attempt for the logged-in user. Requires `profileId` in JSON body. User can only match their own profile.
    *   **Auth Required:** Yes (NextAuth token).
*   **`/packages/route.ts` (Likely GET)**
    *   *(Assumed)* Retrieves active packages associated with the logged-in user or a specific CRM customer ID.
    *   **Auth Required:** Yes (NextAuth token).
*   **`/profile/route.ts` (Likely GET, PUT/POST)**
    *   *(Assumed)* Manages CRM profile data associated with a user. GET to retrieve, PUT/POST to update.
    *   **Auth Required:** Yes (NextAuth token).
*   **`/mapping/route.ts` (Likely GET, POST)**
    *   *(Assumed)* Manages the mapping between website user profiles (`profileId`) and CRM customer records (`crmCustomerId`). GET to view, POST to potentially create/update mappings (admin?).
    *   **Auth Required:** Yes (NextAuth token).

### 4.5. Notifications (`/api/notifications`)

*   **`/email/route.ts` (POST)**
    *   **Description:** Sends the booking confirmation email. Called internally by `/api/bookings/create`.
    *   **Input:** JSON body with formatted booking details for the email template.
    *   **Logic:** Uses `lib/emailService.ts` (Nodemailer) to send the email.
    *   **Auth Required:** No (implicitly authenticated by the caller, `/api/bookings/create`).
    *   **Output:** Success/error status.
*   **`/email/review-request/route.ts` (POST)**
    *   **Description:** Sends a review request email. Likely called by `lib/reviewRequestScheduler.ts`.
    *   **Input:** JSON body with customer/booking details needed for the review request email.
    *   **Logic:** Uses `lib/emailService.ts` to send the email.
    *   **Auth Required:** No (internal call).
    *   **Output:** Success/error status.
*   **`/line/route.ts` (POST)**
    *   **Description:** Sends the booking confirmation via LINE Notify. Called internally by `/api/bookings/create`.
    *   **Input:** JSON body with formatted booking details for the LINE message.
    *   **Logic:** Uses `lib/lineNotifyService.ts` to send the notification (likely to an internal staff group).
    *   **Auth Required:** No (internal call).
    *   **Output:** Success/error status.
*   **`/line/review-request/route.ts` (POST)**
    *   **Description:** Sends a review request via LINE Notify. Likely called by `lib/reviewRequestScheduler.ts`.
    *   **Input:** JSON body with customer/booking details.
    *   **Logic:** Uses `lib/lineNotifyService.ts`.
    *   **Auth Required:** No (internal call).
    *   **Output:** Success/error status.

## 5. Core Features & Logic (Client/Server Actions)

### 5.1. User Authentication

*   Handled by **NextAuth.js** (`app/api/auth/[...nextauth]/route.ts`).
*   Uses the **Supabase adapter** (`@auth/supabase-adapter`) storing user data in `users`, `accounts`, `sessions` tables in Supabase.
*   Login UI likely in `app/(features)/auth/login/page.tsx`.
*   Client-side session state managed via `SessionProvider` (`app/providers.tsx`) and `useSession` hook.
*   **Middleware** (`middleware.ts`) checks for a token but **does not enforce authentication** globally for data routes; enforcement happens within API routes (`/api/availability/route.ts`, `/api/bookings/create/route.ts`) or potentially via page-level checks.

### 5.2. Booking Flow (Client-Side: `app/(features)/bookings/`)

The user-facing booking process is a multi-step flow orchestrated by `app/(features)/bookings/page.tsx` and the `useBookingFlow` hook (`app/(features)/bookings/hooks/useBookingFlow.ts`).

*   **Step 1: Date Selection (`./components/booking/steps/DateSelection`)**
    *   User picks a date using `react-datepicker` or `react-day-picker`.
    *   Updates `selectedDate` state via hook, moves to Step 2.
*   **Step 2: Time Slot Selection (`./components/booking/steps/TimeSlots`)**
    *   Calls the `getAvailability` server action (`actions.ts`), which in turn fetches data from the **Availability API** (`/api/availability`).
    *   The API calculates available slots based on Google Calendar events (see 4.3).
    *   Displays available `startTime` slots and their maximum bookable duration (`maxHours`).
    *   User selects a `selectedTime`, state updated via hook, moves to Step 3.
*   **Step 3: Booking Details (`./components/booking/steps/BookingDetails`)**
    *   User enters details: number of players, duration (up to `maxHours`), name, email, phone, notes.
    *   Form submission triggers a call to the **Booking Creation API** (`/api/bookings/create`).
*   **Step 4: Confirmation (`app/(features)/bookings/confirmation/page.tsx`)**
    *   User is redirected here upon successful booking creation by the API.
    *   Displays booking summary.

### 5.3. Availability Check Logic (within `/api/availability/route.ts`)

This API endpoint is crucial for determining which time slots are offered to the user.

*   **Requires Authentication:** Checks for NextAuth token.
*   **Input:** `date`, `currentTimeInBangkok`.
*   **Google Calendar Integration:**
    *   Fetches events for the given `date` from multiple Google Calendars (one per bay, configured in `lib/googleApiConfig.ts` and `lib/bayConfig.ts`) using `googleapis`.
*   **Caching:** Caches Google Calendar events per day (`lib/cache.ts`) to minimize API calls.
*   **Slot Calculation:**
    *   Iterates hourly from opening (10:00) to closing (23:00).
    *   For each hour, determines which bays are free by checking against cached Google Calendar events.
    *   Calculates `maxHours` available continuously for each free bay starting at that hour.
*   **Output:** List of available `slots` with `startTime`, `endTime`, `maxHours`, and `period`.

### 5.4. Booking Creation Logic (within `/api/bookings/create/route.ts`)

This is the main backend endpoint for finalizing a booking.

*   **Requires Authentication:** Checks for NextAuth token.
*   **Input:** Booking details (date, time, duration, user info, notes).
*   **Supabase Client:** Uses server-side client from `@/utils/supabase/server`.
*   **Final Availability Check:** Calls `/api/availability/check` internally to prevent double-booking, confirming the slot is still free and selecting a specific `bay`.
*   **CRM Matching (`utils/customer-matching.ts`):** Matches customer email/phone to existing CRM data (likely in Supabase) or creates a new mapping, generating a `stableHashId`.
*   **Package Check:** Looks up active packages for the customer (`stableHashId`) in the `crm_packages` Supabase table.
*   **Database Insert:** Creates a record in the `bookings` table (Supabase) with all details (user_id, bay_id, crm_customer_id, package_info, etc.).
*   **Google Calendar Event:** Creates an event in the specific Google Calendar for the assigned bay (`lib/bookingCalendarConfig.ts`, `lib/googleApiConfig.ts`) to block the time.
*   **Notifications (Parallel):**
    *   Calls `/api/notifications/email` (uses `lib/emailService.ts` with Nodemailer).
    *   Calls `/api/notifications/line` (uses `lib/lineNotifyService.ts`).
*   **Review Scheduling:** Triggers `lib/reviewRequestScheduler.ts`.
*   **Logging:** Optionally logs detailed timing/steps to `booking_process_logs` table (Supabase).
*   **Output:** Success (with booking ID) or error JSON.

### 5.5. Middleware (`middleware.ts`)

*   Runs on most requests (excluding static assets).
*   **Rate Limiting:** IP-based limits.
*   **Bot Detection:** Blocks common bots, allows known good bots (Google).
*   **Routing:** Redirects `/` to `/bookings` (except for Google Ads bots).
*   **No Global Auth Enforcement:** Primarily focuses on security and basic routing.

## 6. Key Libraries & Services

*   **Supabase:** Primary database, user authentication backend (via NextAuth adapter). Accessed via `@supabase/ssr` helpers (`utils/supabase/`). Tables include `users`, `accounts`, `sessions`, `bookings`, `crm_packages`, `booking_process_logs`.
*   **NextAuth.js:** Handles authentication flow, session management.
*   **Google Calendar API:** Used as the source of truth for bay availability and for creating booking events. Configured in `lib/googleApiConfig.ts`. Calendar IDs mapped in `lib/bookingCalendarConfig.ts`.
*   **Nodemailer:** Sends confirmation emails (`lib/emailService.ts`).
*   **LINE Notify:** Sends LINE notifications (`lib/lineNotifyService.ts`).
*   **In-Memory Cache (`lib/cache.ts`):** Used to cache Google Calendar events and potentially auth checks.

## 7. Data Flow Summary (Booking Creation)

1.  **User Submits Form** (`BookingDetails` component) -> POST `/api/bookings/create` with details.
2.  **API Authenticates** (NextAuth token).
3.  **API Validates** input.
4.  **API Checks Availability** (internal call to `/api/availability/check`). Fails if slot now taken. Gets assigned `bay_id`.
5.  **API Matches CRM Customer** (`utils/customer-matching.ts`) -> Gets `crm_customer_id`, `stableHashId`.
6.  **API Checks Packages** (Supabase `crm_packages` table) -> Gets `package_info`.
7.  **API Inserts Booking** (Supabase `bookings` table).
8.  **API Creates Calendar Event** (Google Calendar API for assigned bay).
9.  **API Sends Notifications** (Parallel calls to `/api/notifications/email` & `/api/notifications/line`).
10. **API Schedules Review Request**.
11. **API Logs Steps** (Optional, Supabase `booking_process_logs` table).
12. **API Returns Success/Error** -> User redirected to Confirmation page or sees error.

## 8. Potential Integration Points for Backoffice

*   **Database Access (Supabase):**
    *   **`bookings` table:** Essential for viewing/managing bookings.
    *   **`users`, `accounts` tables:** For customer information linked to bookings.
    *   **`crm_packages` table:** Managing customer packages.
    *   **`booking_process_logs` table:** Monitoring booking success/failures.
*   **Google Calendars:** Backoffice likely uses these calendars directly (configured via `lib/bookingCalendarConfig.ts` and `lib/googleApiConfig.ts`) to manage manual blocks, view bookings visually, and define initial availability. The website reads from these calendars.
*   **Availability Logic:** Understanding how `/api/availability/route.ts` calculates slots based on calendar events is key if the backoffice needs to influence availability beyond simple calendar blocks (e.g., changing `OPENING_HOUR`, `CLOSING_HOUR`, `MAX_HOURS`).
*   **CRM Data:** The `customer-matching.ts` logic determines how website users link to CRM records. Backoffice CRM operations should be compatible with this matching.
*   **Notifications:** Monitoring email (`lib/emailService.ts`) and LINE (`lib/lineNotifyService.ts`) notification success/failures might be needed.

## 9. Further Investigation Points

*   Exact Supabase schema (especially `bookings`, CRM-related tables).
*   Detailed logic within `utils/customer-matching.ts`.
*   Implementation of `lib/reviewRequestScheduler.ts`.
*   Specific logic in `/api/availability/check/route.ts`.
*   Deployment process (`Dockerfile`, `deploy.sh`, Vercel settings).
*   Environment variable setup (`.env.example`, actual deployment variables).
*   Error handling patterns across API routes and components.
*   Usage of `html2canvas`, `natural`, `csv-parser` (if still present/relevant).

This document provides a starting point based on code structure and dependencies. Deeper dives into specific files (`actions.ts`, API route handlers, hooks, Supabase schema) are recommended for a complete understanding. 