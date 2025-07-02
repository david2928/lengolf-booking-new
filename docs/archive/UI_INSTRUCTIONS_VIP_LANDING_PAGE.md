# UI Instructions: LENGOLF VIP Section - Landing Page

## 1. Introduction

This document provides UI/UX guidelines for the main landing page of the LENGOLF VIP section. This page is the first view a user sees after successfully logging into the VIP area (e.g., navigating to `/vip`). The content and functionality of this page are dynamic, primarily depending on whether the authenticated user\\\'s profile is successfully linked to an existing Lengolf CRM customer record.

These instructions are for UI developers, outlining the design direction for the VIP feature.

## 2. Frontend Stack Reference

The LENGOLF VIP section is built using the following frontend technologies:

*   **Framework:** Next.js (version 13+ with App Router)
*   **UI Library:** React
*   **Styling:** Tailwind CSS is utilized. Key theme configurations are located in `tailwind.config.ts`, which references CSS variables defined in `app/globals.css`. Adhere to these established styles for a clean, responsive, and modern look and feel, consistent with the existing Lengolf branding.
*   **Component Structure:**
    *   Reusable UI components are to be placed in `src/components/vip/`.
    *   Page-level components are to be placed in `app/vip/`.
    *   A general wrapper, `VipLayout` (target file: `app/vip/layout.tsx`), will define the main structure, navigation within the VIP area, and handle initial authentication/status checks.

## 3. VIP Landing Page (`/vip` or `/vip/dashboard`)

This is the default page a user lands on after logging into the VIP section.

### 3.1. Design Philosophy

*   **Clarity and Intuition:** The page must be immediately understandable.
*   **Action-Oriented Design:** Guide the user toward relevant actions based on their account status.
*   **Responsive Implementation:** Ensure a seamless experience across all device sizes (desktop, tablet, mobile), which is critical for LIFF integration within LINE.
*   **Brand Consistency:** Strictly adhere to Lengolf\\\'s established visual identity (refer to colors and typography detailed below).

### 3.2. Core Dynamic Content (Based on `crm_customer_mapping.is_matched` status)

The VIP landing page must present different information and CTAs depending on whether the user is fully linked or has a placeholder account. This status (`is_matched`) is determined by the backend (`/api/vip/status`) and made available to the frontend, likely through the `VipLayout` or a page-specific data fetch.

---

#### Scenario A: User Account is Linked & Matched (`is_matched = true`)

This user has full access to all VIP features. The landing page should function as a welcoming mini-dashboard.

**Required Elements:**

1.  **Welcome Message:**
    *   Display a personalized greeting: "Welcome back, \\[User\\\'s Display Name]!"
    *   Optionally, include a brief, friendly message: e.g., "Ready to manage your bookings?"

2.  **Quick Summary / Dashboard Snippets (P0 - Simplicity is key):**
    *   **Next Upcoming Booking:**
        *   If an upcoming booking exists: Display "Your next session: **[Bay Name]** on **[Date, e.g., Mon, Aug 26]** at **[Time, e.g., 2:00 PM]**."
        *   Provide a subtle link: "View all bookings" pointing to `/vip/bookings`.
        *   If no upcoming bookings: Display "You have no upcoming bookings." (Consider a friendly CTA: "Book a Session?")
    *   **Active Packages (Optional highlight):**
        *   If active packages exist: Display "You have **[Number]** active package(s)."
        *   Provide a subtle link: "View packages" pointing to `/vip/packages`.
        *   If no active packages: Display "No active packages found."

3.  **Main Navigation CTAs:**
    *   Implement as visually distinct buttons or cards for key VIP sections.
    *   **My Profile:**
        *   Button/Card Text: "View/Edit Profile"
        *   Icon: Utilize an appropriate user/profile icon.
        *   Link: `/vip/profile`
    *   **My Bookings:**
        *   Button/Card Text: "Manage My Bookings"
        *   Icon: Utilize an appropriate calendar/booking icon.
        *   Link: `/vip/bookings`
    *   **My Packages:**
        *   Button/Card Text: "View My Packages"
        *   Icon: Utilize an appropriate package/card icon.
        *   Link: `/vip/packages`

**Layout Direction:**
*   Position the welcome message at the top.
*   Arrange dashboard snippets clearly below the welcome message.
*   Present navigation CTAs as a primary set of actions.

---

#### Scenario B: User Account is NOT Linked or Placeholder Mapping (`is_matched = false`)

This user must complete their account setup by linking to their CRM profile to access most VIP features. The landing page design must prioritize this action.

**Required Elements:**

1.  **Welcome Message:**
    *   Display a personalized greeting: "Welcome, \\[User\\\'s Display Name]!"

2.  **Account Linking Prompt (Primary Focus of this View):**
    *   Implement a clear Headline: e.g., "Complete Your VIP Access" or "Link Your Lengolf Account".
    *   Include a brief explanation: e.g., "To view your bookings, packages, and unlock all VIP benefits, please link your account to your Lengolf customer profile."
    *   **Primary Call-to-Action Button:**
        *   Button Text: "Link My Account Now" or "Connect to My Customer Profile".
        *   Style: Design as prominent, clear, and inviting. Use the `primary` brand color for the background.
        *   Link: `/vip/link-account`

3.  **Benefits of Linking (Optional, keep brief):**
    *   A short bullet list or sentence: e.g., "Linking allows you to: Manage bookings, View package usage, Access exclusive VIP offers."

4.  **Accessible Features (Limited):**
    *   **My Profile:**
        *   Button/Card Text: "View/Edit Basic Profile" (as name, email, marketing preferences from `profiles` are editable).
        *   Icon: Utilize an appropriate user/profile icon.
        *   Link: `/vip/profile`
    *   *(Note: The Bookings and Packages sections, when accessed directly, must clearly indicate that linking is required. Their links in any shared VIP navigation should be styled to reflect their limited state, e.g., disabled or with a tooltip explaining the linking requirement.)*

**Layout Direction:**
*   Position the welcome message at the top.
*   Design a prominent section for the account linking prompt and CTA.
*   The option to manage the basic profile should be secondary in visual hierarchy.

---

### 3.3. Visual Style, Branding, and Tone

*   **Aesthetic:** Modern, clean, and uncluttered. Utilize ample whitespace.
*   **Usability:** Ensure clear typography and intuitive icons.
*   **Brand Identity:** Professionally reinforce Lengolf branding throughout.
*   **Color Usage:** Employ brand colors strategically, especially for primary CTAs.
*   **Responsiveness:** Prioritize mobile-first design, ensuring optimal layout and tap targets for LIFF.

#### 3.3.1. Color Palette (Defined in `app/globals.css` & `tailwind.config.ts`)

Utilize the established brand colors for all VIP section UI to ensure consistency. In Tailwind CSS, these are available via their semantic names (e.g., `bg-primary`, `text-neutral`).

*   **Primary Color (`primary`):** `#005a32` (Dark Green)
    *   Application: Primary CTAs (e.g., "Link My Account Now" button), important highlights, active navigation states.
*   **Neutral Color (`neutral`):** `#000000` (Black)
    *   Application: Can be used for text or secondary elements, but prefer `foreground` for body text for better visual harmony with the `background`.
*   **Accent Color (`accent`):** `#ffffff` (White)
    *   Application: Text on dark backgrounds (e.g., on `primary` buttons), card backgrounds, or section backgrounds to create contrast with the main `background`.
*   **Background Color (`background`):** `#f0f0f0` (Light Gray)
    *   Application: Main page background for the VIP section, providing a soft and clean visual foundation.
*   **Foreground Color (`foreground`):** `#171717` (Very Dark Gray)
    *   Application: Default body text color to ensure readability on light backgrounds. Also suitable for headings.
*   **Footer Colors (for reference, apply if using similar footer patterns within VIP sections):**
    *   `footer-bg`: `#f5fef9` (Very Light Greenish White)
    *   `footer-heading`: `#2b6f36` (Medium Green)
    *   `footer-text`: `#9fa4a5` (Medium Gray)

**Color Application Guidelines:**
*   Verify sufficient contrast ratios for all text and interactive elements to meet accessibility standards (WCAG AA).
*   Use the `primary` color to draw attention to key actions and information.
*   The `background` and `foreground` color pairing should define the base theme for the VIP section.

#### 3.3.2. Typography

*   **Primary Font (`font-sans` in Tailwind CSS):** Poppins (defined by `var(--font-poppins)`).
    *   Application: All text content, including headings, body text, and button labels.
    *   Implement a clear typographic hierarchy using a consistent scale for font sizes and appropriate font weights (e.g., bold for headings, regular for body text).

## 4. Error States / Edge Cases (To be handled by `VipLayout` or Page Logic)

*   **API Unavailability (for VIP Status):** If the `/api/vip/status` call fails, the landing page must display a user-friendly error message (e.g., "Could not load your VIP information at this time. Please try again later.") instead of a broken UI.
*   **Loading State Implementation:** Implement loading indicators (e.g., spinners, skeleton screens) during data fetching (VIP status, dynamic content) to provide clear feedback to the user.

This document outlines the design direction. Creation of detailed UI mockups or wireframes is recommended to further refine the visual layout and user interaction flows prior to development. 