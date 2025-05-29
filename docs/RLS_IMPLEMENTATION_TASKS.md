# Phased RLS Implementation Plan

This document outlines the tasks required to safely implement Row Level Security (RLS) for the LENGOLF application, including the new VIP features. This plan prioritizes minimizing impact on the live production environment.

**Reference Document:** For technical details on NextAuth/Supabase RLS integration, see [AUTH_RLS_DISCOVERY_LOG.md](./AUTH_RLS_DISCOVERY_LOG.md).

---

## Phase 1: Production Data & Application Preparedness for RLS

**Goal:** Ensure the current production application and its data are ready for RLS policies before any RLS rules are enabled on production tables. This is critical to prevent disruption.

---

**Task ID:** RLS-P1-001
**Title:** Analyze & Update Production Backend for `bookings` Table
**Assignee:** Backend Team
**Status:** Done
**Priority:** Critical
**Description:**
  - Identify all backend code paths in the *current production application* that create or update records in the `public.bookings` table.
  - Modify this code to ensure the `user_id` column (which references `public.profiles.id`) is always correctly populated with the `auth.uid()` of the authenticated user performing the action.
  - This ensures that when RLS `INSERT` or `UPDATE` policies like `WITH CHECK (auth.uid() = user_id)` are active, the application already provides compliant data.
**Dependencies:** None
**Acceptance Criteria:**
  - All `INSERT` operations into `public.bookings` by the production application correctly set `user_id`.
  - All `UPDATE` operations on `public.bookings` by the production application maintain the correct `user_id` or ensure conditions for updates are met based on `user_id`.
  - Code deployed to production.
  - New bookings and updates in production database show correct `user_id` population.

---

**Task ID:** RLS-P1-002
**Title:** Analyze & Update Production Backend for `crm_customer_mapping` Table
**Assignee:** Backend Team
**Status:** Done
**Priority:** Critical
**Description:**
  - Identify all backend code paths in the *current production application* that create or update records in the `public.crm_customer_mapping` table.
  - Modify this code to ensure the `profile_id` column (which references `public.profiles.id`) is always correctly populated with the `auth.uid()` of the authenticated user if the mapping is directly tied to them during creation/update.
  - If mappings are managed by admin/system processes, ensure those processes are RLS-aware or use `service_role`.
**Dependencies:** None
**Acceptance Criteria:**
  - All relevant `INSERT`/`UPDATE` operations into `public.crm_customer_mapping` by the production application correctly set `profile_id` or are handled by RLS-exempt roles.
  - Code deployed to production.
  - Mappings in production database show correct `profile_id` population where applicable.

---

**Task ID:** RLS-P1-003
**Title:** Verify `profiles` Table Data Integrity
**Assignee:** Backend Team
**Status:** Done
**Priority:** High
**Description:**
  - Confirm that the `public.profiles.id` column is the definitive `auth.uid()` source.
  - Ensure that user creation processes (e.g., NextAuth `signIn` callback) correctly populate `public.profiles` and that `id` is the UUID used in `auth.uid()`.
**Dependencies:** None
**Acceptance Criteria:**
  - Confirmed that `profiles.id` is consistently the value reflected in `auth.uid()` for logged-in users.

---

## Phase 2: VIP Feature Development in Staging with RLS

**Goal:** Develop and test the new LENGOLF VIP features in an isolated staging environment with RLS enabled on copies of production tables.

---

**Task ID:** RLS-P2-001
**Title:** Create Staging Table Infrastructure
**Assignee:** Backend/Platform Team
**Status:** Done
**Priority:** High
**Description:**
  - Develop SQL scripts to create staging copies of relevant tables:
    - `profiles_vip_staging` (from `profiles`)
    - `bookings_vip_staging` (from `bookings`)
    - `crm_customer_mapping_vip_staging` (from `crm_customer_mapping`)
  - Scripts should include schema and optionally a snapshot of anonymized production data.
**Dependencies:** RLS-P1-001, RLS-P1-002, RLS-P1-003
**Acceptance Criteria:**
  - Scripts successfully create staging tables with correct schemas.
  - Process for initial data population (if any) is defined and tested.

---

**Task ID:** RLS-P2-002
**Title:** Apply RLS Policies to Staging Tables
**Assignee:** Backend/Platform Team
**Status:** Done
**Priority:** High
**Description:**
  - Develop/Refine SQL scripts to apply the planned RLS policies (as discussed and defined in previous iterations, e.g., allowing users to manage their own data, service_role access) to the `_vip_staging` tables.
  - Include `ENABLE ROW LEVEL SECURITY` and `FORCE ROW LEVEL SECURITY`.
**Dependencies:** RLS-P2-001
**Acceptance Criteria:**
  - RLS policies are successfully applied to all `_vip_staging` tables.
  - Policies match the intended security model for the VIP features.

---

**Task ID:** RLS-P2-003
**Title:** Develop/Adapt VIP Features for Staging RLS Environment
**Assignee:** Frontend/Backend VIP Team
**Status:** To Do
**Priority:** High
**Description:**
  - Configure the new VIP feature's application code (frontend components, `app/(features)/vip/...` pages, and `app/api/vip/...` API routes) to connect to and operate exclusively against the `_vip_staging` tables.
  - Ensure client-side Supabase calls in VIP components use `session.accessToken` for authenticated requests as per `AUTH_RLS_DISCOVERY_LOG.md`.
  - Verify NextAuth `jwt` and `session` callbacks correctly provide `accessToken` to the client.
**Dependencies:** RLS-P2-001, RLS-P2-002
**Acceptance Criteria:**
  - VIP feature application code targets `_vip_staging` tables.
  - Authenticated client-side calls use user's JWT.
  - Session management provides necessary tokens.

---

**Task ID:** RLS-P2-004
**Title:** Test VIP Features in Staging RLS Environment
**Assignee:** QA/VIP Team
**Status:** To Do
**Priority:** Critical
**Description:**
  - Conduct thorough testing of all LENGOLF VIP functionalities (status, linking, profile, bookings, packages) against the RLS-enabled `_vip_staging` tables.
  - Test with multiple user accounts to verify data isolation and policy enforcement.
  - Test edge cases and error handling related to RLS.
**Dependencies:** RLS-P2-003
**Acceptance Criteria:**
  - All VIP features function correctly in the RLS-enabled staging environment.
  - RLS policies are enforced as expected (users can only access/modify their own data).
  - No unintended data exposure or access denial.

---

## Phase 3: (Optional) Data Synchronization: Production -> Staging

**Goal:** Keep the staging environment data fresh for ongoing development and testing if Phase 2 is lengthy.

---

**Task ID:** RLS-P3-001
**Title:** Design and Implement Production-to-Staging Sync
**Assignee:** Backend/Platform Team
**Status:** To Do
**Priority:** Medium
**Description:**
  - If VIP development is expected to be prolonged, design and implement a one-way synchronization mechanism (e.g., triggers, batch jobs) to copy new/updated data from production tables (`profiles`, `bookings`, `crm_customer_mapping`) to their respective `_vip_staging` counterparts.
  - Ensure the sync handles RLS on staging tables (e.g., sync process might need `service_role` on staging).
**Dependencies:** RLS-P2-001
**Acceptance Criteria:**
  - Sync mechanism is implemented and tested.
  - Staging data is kept reasonably up-to-date with production changes.
  - Sync process does not unduly load production systems.

---

## Phase 4: Go-Live - RLS on Production & VIP Launch

**Goal:** Safely enable RLS on production tables and launch the new VIP features.

---

### Sub-Phase 4.1: Final Preparations

---

**Task ID:** RLS-P4.1-001
**Title:** Prepare and Test RLS Rollback Scripts for Production
**Assignee:** Backend/Platform Team
**Status:** To Do
**Priority:** Critical
**Description:**
  - Create and thoroughly test SQL scripts to quickly:
    - Drop all RLS policies from production tables (`profiles`, `bookings`, `crm_customer_mapping`).
    - `ALTER TABLE ... NO FORCE ROW LEVEL SECURITY;`
    - `ALTER TABLE ... DISABLE ROW LEVEL SECURITY;`
  - These scripts are for emergency rollback if RLS enablement causes critical issues.
**Dependencies:** None
**Acceptance Criteria:**
  - Rollback scripts are documented, tested (e.g., in a non-prod environment), and readily available.

---

**Task ID:** RLS-P4.1-002
**Title:** Schedule Maintenance Window
**Assignee:** Project Lead/Platform Team
**Status:** To Do
**Priority:** High
**Description:**
  - Plan the RLS enablement and VIP launch for a low-traffic period or a scheduled maintenance window.
  - Communicate the window to stakeholders.
**Dependencies:** None
**Acceptance Criteria:**
  - Maintenance window scheduled and communicated.

---

**Task ID:** RLS-P4.1-003
**Title:** Perform Final Production-to-Staging Data Sync (if applicable)
**Assignee:** Backend/Platform Team
**Status:** To Do
**Priority:** High
**Description:**
  - If Phase 3 (data sync) was implemented, perform a final, verified synchronization before the maintenance window.
**Dependencies:** RLS-P3-001 (if implemented)
**Acceptance Criteria:**
  - Staging data is as up-to-date as possible with production.

---

### Sub-Phase 4.2: RLS on Production Tables & VIP Launch

---

**Task ID:** RLS-P4.2-001
**Title:** Apply RLS Policies to Production Tables
**Assignee:** Backend/Platform Team
**Status:** To Do
**Priority:** Critical
**Description:**
  - During the maintenance window, execute SQL scripts to:
    - Apply all planned RLS policies to `public.profiles`.
    - `ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;`
    - `ALTER TABLE public.profiles FORCE ROW LEVEL SECURITY;`
    - Repeat for `public.bookings` and `public.crm_customer_mapping`.
  - These policies should be identical to those tested on the `_vip_staging` tables.
**Dependencies:** RLS-P1-001, RLS-P1-002, RLS-P1-003, RLS-P4.1-001
**Acceptance Criteria:**
  - RLS policies are active on production tables.
  - `FORCE ROW LEVEL SECURITY` is enabled on production tables.

---

**Task ID:** RLS-P4.2-002
**Title:** Test Current Production Application with RLS
**Assignee:** QA/Backend Team
**Status:** To Do
**Priority:** Critical
**Description:**
  - Immediately after RLS enablement, thoroughly test critical flows of the *existing production application*.
  - Focus on areas interacting with `profiles`, `bookings`, and `crm_customer_mapping`.
  - Thanks to Phase 1, the application *should* function correctly. This step is a verification.
**Dependencies:** RLS-P4.2-001
**Acceptance Criteria:**
  - Existing production application functions as expected with RLS enabled on its tables.
  - No unexpected errors or access issues for regular users.
  - If issues arise, execute rollback (RLS-P4.1-001) and diagnose.

---

**Task ID:** RLS-P4.2-003
**Title:** Deploy New VIP Application Code to Production
**Assignee:** Frontend/Backend VIP Team
**Status:** To Do
**Priority:** Critical
**Description:**
  - Deploy the new LENGOLF VIP feature code (frontend and `app/api/vip/...` backend).
  - This code should be configured to use the *actual production tables* (which now have RLS enabled).
**Dependencies:** RLS-P2-004, RLS-P4.2-002
**Acceptance Criteria:**
  - VIP feature code is deployed to production.
  - VIP code is configured to use production tables.

---

**Task ID:** RLS-P4.2-004
**Title:** Test VIP Features in Production
**Assignee:** QA/VIP Team
**Status:** To Do
**Priority:** Critical
**Description:**
  - Conduct thorough testing of all LENGOLF VIP functionalities in the live production environment.
  - Test with multiple user accounts.
**Dependencies:** RLS-P4.2-003
**Acceptance Criteria:**
  - VIP features function correctly in production with RLS.
  - RLS policies provide correct data access and isolation.

---

**Task ID:** RLS-P4.2-005
**Title:** Monitor Production Systems
**Assignee:** Platform/Backend Team
**Status:** To Do
**Priority:** Critical
**Description:**
  - Closely monitor application logs, database performance, and error rates after RLS enablement and VIP launch.
**Dependencies:** RLS-P4.2-004
**Acceptance Criteria:**
  - Systems are stable.
  - No surge in RLS-related errors or performance degradation.

---

### Sub-Phase 4.3: Cleanup

---

**Task ID:** RLS-P4.3-001
**Title:** Review and Remove/Restrict Temporary Anonymous Policies
**Assignee:** Backend/Platform Team
**Status:** To Do
**Priority:** Critical
**Description:**
  - As highlighted in `AUTH_RLS_DISCOVERY_LOG.md`, review any temporary broad `SELECT` policies for the `anon` role that might have been added to production tables (e.g., `TEMP Anon users can read all profiles`).
  - **These MUST be removed or significantly tightened** to enforce the principle of least privilege now that main application paths are RLS-aware. This is a critical security hardening step.
**Dependencies:** RLS-P4.2-005
**Acceptance Criteria:**
  - Temporary anonymous read policies are removed or restricted to only what is absolutely necessary.
  - Data exposure to anonymous users is minimized.

---

**Task ID:** RLS-P4.3-002
**Title:** Decommission Staging Tables
**Assignee:** Backend/Platform Team
**Status:** To Do
**Priority:** Medium
**Description:**
  - Once the production RLS implementation is stable and VIP features are verified, the `_vip_staging` tables can be decommissioned and dropped.
**Dependencies:** RLS-P4.3-001
**Acceptance Criteria:**
  - Staging tables (`profiles_vip_staging`, etc.) are backed up (if needed) and dropped.

--- 