# Lengolf Forms Backoffice: Technical Documentation

## 1. Introduction & Purpose

Lengolf Forms is a comprehensive web application designed as a backoffice system for Lengolf golf academies. Its primary purpose is to provide staff with the tools necessary to manage customer bookings, track lesson packages, monitor schedules, and handle related administrative tasks efficiently.

This document provides a detailed technical and logical overview of the application, covering its architecture, core functionalities, workflows, and codebase structure. It is intended for developers and technical staff needing to understand the inner workings of the system.

## 2. Architecture & Technology Stack

The application is built using a modern web development stack, leveraging server-side rendering (SSR) and static site generation (SSG) capabilities where appropriate, along with a robust backend-as-a-service platform.

**Key Technologies:**

*   **Frontend Framework**: Next.js (with App Router)
*   **Language**: TypeScript
*   **Styling**: Tailwind CSS (with Shadcn/UI component library base)
*   **UI Components**: Reusable components located in `src/components/` (general UI in `src/components/ui/`, feature-specific in subdirectories)
*   **State Management**: React state, React Context (`BookingProvider`), SWR (for data fetching hooks like `use-package-monitor`, `use-customers`), React Hook Form (for form handling)
*   **Backend**: Next.js API Routes (`app/api/`)
*   **Database**: PostgreSQL (via Supabase)
*   **Backend-as-a-Service**: Supabase (handles database, auth helpers, potentially edge functions)
*   **Authentication**: NextAuth.js (configured for Google OAuth)
*   **External Integrations**:
    *   Google Calendar API (for schedule synchronization)
    *   LINE Messaging API (for real-time notifications)
    *   Google Sheets API (potential data exchange)
    *   Google Cloud Run (for triggering external services like CRM updates)
*   **Deployment**: Vercel

**Architectural Overview:**

The application follows the structure defined by the Next.js App Router:

*   **`app/` Directory**: Contains page routes, layouts, API endpoints, and associated UI components. Each feature (e.g., Create Booking, Package Monitor) typically has its own directory within `app/`.
*   **`src/` Directory**: Houses reusable source code:
    *   `lib/`: Core logic, utility functions, external service integrations (Supabase clients, Google APIs, LINE Messaging), authentication configuration.
    *   `components/`: Reusable React components (UI primitives, forms, feature-specific components).
    *   `hooks/`: Custom React hooks for managing stateful logic and data fetching.
    *   `types/`: TypeScript type definitions.
    *   `config/`: Application-level configuration (e.g., menu items).
*   **API Routes (`app/api/`)**: Handle backend logic, database interactions, and communication with external services.
*   **Middleware (`middleware.ts`)**: Intercepts requests for tasks like authentication enforcement before they reach pages or API routes.
*   **Static Assets (`public/`)**: Stores publicly served files like images and favicons.

## 3. Core Features & Modules

### 3.1. User Authentication

*   **Mechanism**: Secure sign-in via Google OAuth, managed by NextAuth.js.
*   **Configuration**: `src/lib/auth-config.ts` defines providers and strategies. `app/api/auth/[...nextauth]/route.ts` handles the NextAuth.js API endpoints.
*   **UI**: Sign-in page at `app/auth/signin/page.tsx`. Logout functionality is provided by `src/components/logout-button.tsx`.
*   **Protection**: `middleware.ts` likely enforces authentication for most routes, redirecting unauthenticated users to the sign-in page. Session state is managed via `SessionProvider` (`src/components/session-provider.tsx`) wrapping the root layout (`app/layout.tsx`).

### 3.2. Booking Management

*   **Purpose**: Allows staff to create, view, manage, and cancel customer bookings for golf bays and potentially coaching.
*   **Booking Creation**:
    *   **UI**: `app/create-booking/page.tsx` renders the `BookingForm` component (`src/components/booking-form/index.tsx`).
    *   **State/Logic**: Likely managed by `BookingProvider` (`src/components/booking-form/context/booking-context.tsx`) and potentially a `useBookingForm` hook (`src/hooks/`).
    *   **API**: Submits data to `/api/bookings/create` (`app/api/bookings/create/route.ts`), which validates and inserts data into the Supabase `bookings` table using the `refac-supabase` client.
*   **Bookings Calendar View**:
    *   **UI**: `app/bookings-calendar/page.tsx` provides a daily time-slot grid view. It fetches and displays bookings per bay. Supports navigation between days.
    *   **API**: Fetches event data likely via a POST request to `/api/bookings/calendar/events` (logic inferred, route file might be present).
    *   **Logic**: Complex client-side component handling data fetching, rendering, and interactions.
*   **Manage Bookings Page**:
    *   **UI**: `app/manage-bookings/page.tsx` provides a table/list view of bookings for a selected date. Allows filtering by status, searching, and viewing past bookings.
    *   **Features**: Includes buttons to open modals for Editing (`EditBookingModal`), Cancelling (`CancelBookingModal`), and viewing History (`BookingHistoryModal`). Edit/Cancel actions are disabled for past or cancelled bookings.
    *   **API**: Fetches bookings via `/api/bookings/list-by-date`. Cancel/Edit/History actions likely trigger respective API calls (not explicitly listed but implied by modal interactions).
    *   **Logic**: Uses `useState`, `useEffect`, `useMemo` for state management, data fetching, and filtering. Includes helper functions (`calculateEndTime`, `getBayBadgeClasses`, `isBookingInPast`).
*   **Google Calendar Sync**:
    *   **Mechanism**: Booking creation/updates likely trigger synchronization with Google Calendar.
    *   **Logic**: Handled by functions in `src/lib/google-calendar.ts`, potentially called from the booking API routes. Requires Google service account credentials and specific Calendar IDs defined in environment variables.
    *   **Calendar IDs**: `BAY_1_CALENDAR_ID`, `BAY_2_CALENDAR_ID`, `BAY_3_CALENDAR_ID`, `COACHING_BOSS_CALENDAR_ID`, `COACHING_RATCHAVIN_CALENDAR_ID`.

### 3.3. Package Management

*   **Purpose**: Manage customer lesson/practice packages, including creation, usage tracking, and monitoring expiration.
*   **Package Creation**:
    *   **UI**: `app/create-package/page.tsx` dynamically loads `PackageForm` (`src/components/package-form/index.tsx`). Includes customer search (`customer-search.tsx`) and a confirmation dialog (`confirmation-dialog.tsx`).
    *   **State/Logic**: Primarily managed by the `usePackageForm` hook (`src/hooks/usePackageForm.ts`), which uses `react-hook-form`, fetches initial data (customers, package types) from Supabase, and handles the submission flow.
    *   **API**: Submits data to an inferred package creation API endpoint (e.g., `/api/packages/create`).
*   **Package Usage Update**:
    *   **UI**: `app/update-package/page.tsx` renders `UsageForm` (`src/components/package-usage/usage-form.tsx`).
    *   **Logic**: Allows staff to select a customer and package, then record usage (e.g., deduct a session).
    *   **API**: Submits usage updates to an inferred package update API endpoint (e.g., `/api/packages/update-usage`).
*   **Package Monitoring**:
    *   **UI**: `app/package-monitor/page.tsx` displays active "Diamond" packages and packages nearing expiration using `PackageGrid` components (`src/components/package-monitor/package-grid.tsx`). Includes a `CustomerSelector`.
    *   **Data Fetching**: Uses the `usePackageMonitor` hook (`src/hooks/use-package-monitor.ts`) which employs SWR to fetch data from `/api/packages/monitor` (`app/api/packages/monitor/route.ts`).
    *   **API**: The `/api/packages/monitor` endpoint queries Supabase for relevant package data based on criteria like package type and expiration date.

### 3.4. Customer Data Management

*   **Purpose**: Maintain an up-to-date list of customers, potentially synchronized with an external CRM.
*   **CRM Sync**:
    *   **Trigger**: A button on the main page (`app/page.tsx`) calls the `/api/crm/update-customers` endpoint.
    *   **API**: `app/api/crm/update-customers/route.ts` handles GET requests. It authenticates using Google Auth (`src/lib/google-auth.ts`) and triggers an external Google Cloud Run service responsible for the actual data refresh.
*   **Data Fetching within App**:
    *   **Hooks**: Two hooks exist for fetching customer lists:
        *   `useCustomers` (`src/hooks/useCustomers.ts`): Uses `useState`/`useEffect` and the Supabase client-component client (`createClientComponentClient`) directly.
        *   `use-customers` (`src/hooks/use-customers.ts`): Uses SWR to fetch from an API endpoint (likely `/api/customers`). This might be a newer or alternative approach.
    *   **Usage**: These hooks are likely used in forms (Booking, Package) to populate customer selection fields.

### 3.5. Notifications

*   **Purpose**: Send real-time notifications (e.g., booking confirmations, cancellations) to staff via LINE.
*   **Mechanism**: Migrated from LINE Notify to LINE Messaging API.
*   **Logic**: Handled by functions within `src/lib/line-messaging.ts`. This library supports sending text and flex messages to multiple LINE groups.
*   **Configuration**: Requires `LINE_CHANNEL_ACCESS_TOKEN`, `LINE_CHANNEL_SECRET`, and group IDs (`LINE_GROUP_ID`, `LINE_GROUP_RATCHAVIN_ID`, `LINE_GROUP_COACHING_ID`) from environment variables.
*   **Triggers**: Notification logic is likely called from API routes handling booking creation, updates, or cancellations (e.g., within `/api/bookings/create`).

## 4. Key Workflows (Examples)

### 4.1. Creating a New Booking

1.  **User Action**: Staff navigates to `/create-booking`.
2.  **Frontend**: `app/create-booking/page.tsx` loads. The `BookingForm` component (`src/components/booking-form/`) renders, possibly using `BookingProvider` context and/or `useBookingForm` hook.
3.  **Data Fetching (Form)**: The form might fetch initial data like available time slots (via `/api/bookings/availability`?) or customer lists (using `useCustomers` or `use-customers` hook).
4.  **User Input**: Staff fills in customer details, date, time, duration, bay, etc. Form validation (client-side) occurs.
5.  **Submission**: Staff submits the form.
6.  **API Call**: Form data is sent via POST request to `/api/bookings/create`.
7.  **Backend (`/api/bookings/create`)**:
    *   Validates incoming data.
    *   Uses the `refac-supabase` client (`src/lib/refac-supabase.ts`) to insert a new record into the `bookings` table.
    *   Calls `src/lib/google-calendar.ts` functions to create a corresponding event in the appropriate Google Calendar.
    *   Calls `src/lib/line-messaging.ts` functions to send a notification to the configured LINE group(s).
    *   Returns a success or error response.
8.  **Frontend**: Displays a success message (e.g., using `useToast`) or error details based on the API response.

### 4.2. Viewing the Package Monitor

1.  **User Action**: Staff navigates to `/package-monitor`.
2.  **Frontend**: `app/package-monitor/page.tsx` loads.
3.  **Data Fetching**: The page component uses the `usePackageMonitor` hook (`src/hooks/use-package-monitor.ts`).
4.  **Hook Logic (`usePackageMonitor`)**: This hook uses SWR to make a GET request to `/api/packages/monitor`.
5.  **API Call**: Request sent to `/api/packages/monitor`.
6.  **Backend (`/api/packages/monitor`)**:
    *   Receives the request.
    *   Queries the Supabase database (likely `packages` and `customers` tables) to find:
        *   Active packages of type "Diamond".
        *   Packages expiring within a certain timeframe.
    *   Formats the data (`PackageMonitorData` type).
    *   Returns the data as JSON.
7.  **Hook Logic**: SWR receives the data, manages caching, and provides the data (`data`), loading state (`isLoading`), and error state (`error`) to the page component.
8.  **Frontend**: The page component receives the data from the hook and renders it using `PackageGrid` components for the different sections (Diamond, Expiring Soon). Loading or error states are handled appropriately.

## 5. Technical Details & Codebase Structure

*(Referencing PROJECT_STRUCTURE.md)*

### 5.1. `app/` Directory (App Router)

*   **Layout (`layout.tsx`)**: Root layout, includes `<Nav />`, `<SessionProvider />`, `<Toaster />`.
*   **Pages (`page.tsx`, `*/page.tsx`)**: Entry points for different features/routes (e.g., `/`, `/create-booking`, `/bookings-calendar`).
*   **API Routes (`app/api/*`)**: Backend logic handlers. Organized by resource (bookings, packages, crm, auth).
*   **Authentication Pages (`app/auth/*`)**: Sign-in UI (`signin/page.tsx`).

### 5.2. `src/` Directory (Source Code)

*   **`lib/`**: Critical for backend logic and integrations.
    *   `supabase.ts`, `refac-supabase.ts`: Supabase client initializations. **Note the use of two separate clients**, possibly pointing to different Supabase projects or schemas. `refac-supabase` is explicitly used for booking creation.
    *   `google-*.ts`: Google API interactions (Calendar, Auth, Sheets).
    *   `line-messaging.ts`: LINE notification logic.
    *   `auth-config.ts`: NextAuth.js configuration.
    *   `utils.ts`: General utilities (`cn` for class names).
*   **`components/`**: Reusable UI elements.
    *   `ui/`: Base components (Button, Input, Card, DatePicker, etc.), likely based on Shadcn/UI.
    *   `booking-form/`, `package-form/`, `package-usage/`, `package-monitor/`: Feature-specific composite components.
    *   `nav.tsx`: Main navigation bar.
*   **`hooks/`**: Reusable stateful logic and data fetching.
    *   `use-package-monitor.ts`, `use-customers.ts`: SWR-based data fetching hooks.
    *   `usePackageForm.ts`: Complex form state management hook.
    *   `useCustomers.ts`: Direct Supabase client data fetching hook.
*   **`types/`**: Centralized TypeScript definitions (`Booking`, `PackageFormData`, etc.).
*   **`config/`**: Static configuration (`menu-items.ts`).

### 5.3. Key Files (Root)

*   **`middleware.ts`**: Handles request interception, primarily for authentication checks.
*   **`next.config.js`**: Next.js build and runtime configuration.
*   **`tailwind.config.ts`**: Tailwind CSS customization.
*   **`tsconfig.json`**: TypeScript compiler settings, including path aliases (`@/*`).
*   **`package.json`**: Project dependencies and scripts.

### 5.4. Database (Supabase)

*   Implicitly defined schema including tables like `bookings`, `customers`, `packages`, `package_types`.
*   Interactions occur via the Supabase JS clients defined in `src/lib/supabase.ts` and `src/lib/refac-supabase.ts`. Queries are embedded within API routes and potentially some hooks (`useCustomers`).

### 5.5. Environment Variables

*   Crucial for connecting to services. Defined in `README.md` and loaded via Next.js environment variable handling. Includes Supabase keys, Google credentials, Calendar IDs, LINE keys, and NextAuth secrets.

## 6. Deployment

*   Deployed on **Vercel**.
*   Updates to the `main` branch likely trigger automatic deployments (configured via Vercel settings and potentially `.github/workflows/cd.yml`).
*   All necessary environment variables must be configured in the Vercel project settings.

## 7. Conclusion

The Lengolf Forms backoffice is a well-structured Next.js application utilizing Supabase for its backend and integrating with several external services (Google, LINE). It provides a feature-rich interface for managing core aspects of the golf academy's operations. Understanding the separation of concerns between the `app/` directory (routing, pages, APIs) and the `src/` directory (reusable logic, components, hooks, types) is key to navigating and maintaining the codebase. 