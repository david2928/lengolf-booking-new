# LIFF Development Guide

## Overview

This guide documents the patterns and best practices for developing LIFF (LINE Front-end Framework) pages for LENGOLF's LINE Official Account rich menu. Based on the Contact Us page implementation, this serves as a reference for creating future LIFF functionalities.

**Last Updated:** December 17, 2025
**Reference Implementation:** Contact Us LIFF Page (`/liff/contact`)

---

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Project Structure](#project-structure)
3. [Step-by-Step Implementation Guide](#step-by-step-implementation-guide)
4. [Bilingual Support](#bilingual-support)
5. [Brand Consistency](#brand-consistency)
6. [LIFF SDK Integration](#liff-sdk-integration)
7. [Testing Strategy](#testing-strategy)
8. [Deployment Checklist](#deployment-checklist)
9. [Common Patterns](#common-patterns)
10. [Troubleshooting](#troubleshooting)

---

## Architecture Overview

### LIFF Pages in LENGOLF

LIFF pages are web applications that run inside the LINE app, providing a native-like experience for LINE users. Our LIFF pages:

- Run as Next.js client components (`'use client'`)
- Use LIFF SDK for LINE integration
- Support dev mode for local testing without LINE
- Follow responsive mobile-first design
- Maintain LENGOLF brand consistency

### Existing LIFF Pages

1. **Lucky Draw** (`/liff/lucky-draw`) - VIP customer spin wheel with prize redemption
2. **Contact Us** (`/liff/contact`) - Business contact information with bilingual support
3. **Promotions** (`/liff/promotions`) - Instagram Stories-style promotion showcase with countdown timers

---

## Project Structure

### File Organization

```
app/
  liff/
    layout.tsx                    # Shared LIFF layout (viewport, PWA config)
    [feature-name]/
      layout.tsx                  # Feature-specific metadata (title, description)
      page.tsx                    # Main LIFF page (client component)

components/
  liff/
    [feature-name]/
      ComponentA.tsx              # Feature-specific components
      ComponentB.tsx
      ...

lib/
  liff/
    translations.ts               # Shared bilingual translations
    [feature-specific].ts         # Feature-specific utilities

types/
  liff.d.ts                       # LIFF SDK type definitions
```

### Example: Contact Us Structure

```
app/liff/contact/
  ├── layout.tsx                  # Page metadata (title, description)
  └── page.tsx                    # Main page component
components/liff/contact/
  ├── ContactHeader.tsx           # Header with language toggle
  ├── ContactCard.tsx             # Reusable contact method card
  ├── GoogleMapsEmbed.tsx         # Interactive map component
  ├── GettingHere.tsx             # Transportation info
  ├── OpeningHours.tsx            # Business hours with live status
  └── SocialLinks.tsx             # Social media links
lib/liff/translations.ts          # Bilingual translations
```

---

## Step-by-Step Implementation Guide

### 1. Plan Your LIFF Page

**Questions to Answer:**
- What is the primary user goal?
- Does it require authentication?
- Will it be bilingual (TH/EN)?
- What data does it display/collect?
- Does it need API integration?

### 2. Create the Page File

**File:** `app/liff/[feature-name]/page.tsx`

```typescript
'use client';

import { useEffect, useState } from 'react';
import { Language } from '@/lib/liff/translations';

type ViewState = 'loading' | 'error' | 'ready' | 'not-linked';

export default function FeaturePage() {
  const [viewState, setViewState] = useState<ViewState>('loading');
  const [language, setLanguage] = useState<Language>('en');
  const [error, setError] = useState('');

  useEffect(() => {
    initializeLiff();
  }, []);

  const initializeLiff = async () => {
    try {
      // Dev mode check
      const urlParams = new URLSearchParams(window.location.search);
      const devMode = urlParams.get('dev') === 'true';

      if (devMode && process.env.NODE_ENV === 'development') {
        console.log('[DEV MODE] Bypassing LIFF initialization');
        setViewState('ready');
        return;
      }

      // Load LIFF SDK
      if (!window.liff) {
        const script = document.createElement('script');
        script.src = 'https://static.line-scdn.net/liff/edge/2/sdk.js';
        script.async = true;
        document.body.appendChild(script);
        await new Promise((resolve, reject) => {
          script.onload = resolve;
          script.onerror = reject;
        });
      }

      // Initialize LIFF
      const liffId = process.env.NEXT_PUBLIC_LIFF_ID;
      if (!liffId) {
        console.warn('LIFF ID not configured');
        setViewState('ready');
        return;
      }

      await window.liff.init({ liffId });

      // Check authentication if needed
      if (!window.liff.isLoggedIn()) {
        window.liff.login({ redirectUri: window.location.href });
        return;
      }

      // Get user profile if needed
      const profile = await window.liff.getProfile();

      setViewState('ready');
    } catch (err) {
      console.error('Error initializing LIFF:', err);
      setError(err instanceof Error ? err.message : 'Failed to initialize');
      setViewState('error');
    }
  };

  // Render loading, error, and ready states
  // ...
}
```

### 3. Create Page-Specific Layout (Metadata)

**File:** `app/liff/[feature-name]/layout.tsx`

**IMPORTANT:** Each LIFF page needs its own layout file to set the correct page title. The LIFF app name in LINE Developers Console is only for management - the actual browser/header title comes from the HTML `<title>` element, which is controlled by Next.js metadata.

```typescript
import type { Metadata, Viewport } from "next";

export const metadata: Metadata = {
  title: "LENGOLF Feature Name",
  description: "Brief description of the feature",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default function FeatureLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
```

**Why This Matters:**
- The `title` field controls what appears in the browser tab and LIFF header
- Without a feature-specific layout, the page will inherit the parent layout's title
- This is a common source of bugs where the wrong title displays

**Example:**
- Contact Us: `title: "LENGOLF Contact Us"`
- Lucky Draw: `title: "LENGOLF Lucky Draw"`

### 4. Add Bilingual Support

**File:** `lib/liff/translations.ts`

```typescript
export type Language = 'en' | 'th';

export interface FeatureTranslations {
  title: string;
  subtitle: string;
  // ... other text fields
}

export const featureTranslations: Record<Language, FeatureTranslations> = {
  en: {
    title: 'Feature Title',
    subtitle: 'Feature Subtitle',
    // ...
  },
  th: {
    title: 'ชื่อฟีเจอร์',
    subtitle: 'คำบรรยาย',
    // ...
  }
};
```

### 5. Create Reusable Components

Break down your UI into small, reusable components:

```typescript
// components/liff/[feature]/ComponentName.tsx
import { Language } from '@/lib/liff/translations';

interface ComponentProps {
  language: Language;
  // ... other props
}

export default function ComponentName({ language }: ComponentProps) {
  const t = translations[language];

  return (
    <div className="bg-white rounded-lg shadow-md p-4 border border-gray-100">
      {/* Component content */}
    </div>
  );
}
```

### 6. Add Brand Styling

Use LENGOLF brand colors consistently:

```typescript
// Primary brand color (LENGOLF Green)
className="bg-primary text-primary-foreground"

// Headers
className="text-primary"

// Buttons
className="bg-primary hover:opacity-90 active:opacity-80"

// Cards
className="bg-white rounded-lg shadow-md border border-gray-100"
```

### 7. Implement Language Toggle

```typescript
const toggleLanguage = () => {
  const newLanguage = language === 'en' ? 'th' : 'en';
  setLanguage(newLanguage);
  if (typeof window !== 'undefined') {
    localStorage.setItem('liff-[feature]-language', newLanguage);
  }
};

// In useEffect, load saved preference
useEffect(() => {
  if (typeof window !== 'undefined') {
    const savedLanguage = localStorage.getItem('liff-[feature]-language') as Language;
    if (savedLanguage && (savedLanguage === 'en' || savedLanguage === 'th')) {
      setLanguage(savedLanguage);
    }
  }
}, []);
```

---

## Bilingual Support

### Translation File Structure

Organize translations by feature:

```typescript
// lib/liff/translations.ts
export type Language = 'en' | 'th';

// Export individual feature translations
export interface ContactTranslations {
  // ... fields
}

export interface FeatureTranslations {
  // ... fields
}

export const contactTranslations: Record<Language, ContactTranslations> = {
  en: { /* ... */ },
  th: { /* ... */ }
};

export const featureTranslations: Record<Language, FeatureTranslations> = {
  en: { /* ... */ },
  th: { /* ... */ }
};
```

### Best Practices

1. **Default Language:** Use English by default (`useState<Language>('en')`)
2. **Persistence:** Save language preference to localStorage
3. **Comprehensive Coverage:** Translate ALL user-facing text
4. **Context-Aware:** Consider cultural differences (e.g., date formats)
5. **Testing:** Test both languages thoroughly

---

## Brand Consistency

### LENGOLF Design System

#### Colors

```css
/* Primary Brand Color */
--primary: 151 100% 17.6%  /* #005a32 - LENGOLF Green */
--primary-foreground: 0 0% 98%  /* White text on primary */

/* Usage in components */
bg-primary          /* LENGOLF green background */
text-primary        /* LENGOLF green text */
border-primary      /* LENGOLF green border */
```

#### Header Pattern

All LIFF pages should use consistent header styling:

```typescript
<header className="bg-primary text-primary-foreground py-4 sticky top-0 z-50 shadow-md">
  <div className="container mx-auto px-4 sm:px-6 lg:px-8">
    <div className="flex justify-between items-center">
      <h1 className="text-2xl font-bold text-white">
        {pageTitle}
      </h1>
      {/* Right content: language toggle, etc. */}
    </div>
  </div>
</header>
```

#### Component Cards

```typescript
<div className="bg-white rounded-lg shadow-md p-4 border border-gray-100">
  {/* Card content */}
</div>
```

#### Typography

- **Headings:** `text-xl font-bold text-gray-900`
- **Subheadings:** `text-base font-semibold text-gray-900`
- **Body:** `text-sm text-gray-600`
- **Labels:** `text-sm font-medium text-gray-600`

#### Spacing

- **Page padding:** `p-4 space-y-4`
- **Card padding:** `p-4`
- **Section spacing:** `space-y-4` or `gap-4`

---

## LIFF SDK Integration

### SDK Loading Pattern

Always load LIFF SDK dynamically:

```typescript
if (!window.liff) {
  const script = document.createElement('script');
  script.src = 'https://static.line-scdn.net/liff/edge/2/sdk.js';
  script.async = true;
  document.body.appendChild(script);

  await new Promise((resolve, reject) => {
    script.onload = resolve;
    script.onerror = reject;
  });
}
```

### Authentication Check

```typescript
const liffId = process.env.NEXT_PUBLIC_LIFF_ID;
await window.liff.init({ liffId });

if (!window.liff.isLoggedIn()) {
  window.liff.login({ redirectUri: window.location.href });
  return;
}

const profile = await window.liff.getProfile();
// profile.userId, profile.displayName, profile.pictureUrl
```

### User Linking Check (VIP Features)

```typescript
const { data: profile } = await supabase
  .from('profiles')
  .select('customer_id')
  .eq('provider', 'line')
  .eq('provider_id', userId)
  .single();

if (!profile?.customer_id) {
  setViewState('not-linked');
  return;
}
```

### Common LIFF Methods

```typescript
// Open external URL
window.liff.openWindow({
  url: 'https://example.com',
  external: true
});

// Close LIFF window
window.liff.closeWindow();

// Check API availability
if (window.liff.isApiAvailable('shareTargetPicker')) {
  // Use share feature
}

// Get OS
const os = window.liff.getOS(); // 'ios', 'android', 'web'
```

---

## Testing Strategy

### Local Testing (Dev Mode)

Test without LINE app using dev mode:

```
http://localhost:3000/liff/[feature]?dev=true
```

For features requiring user data:

```
http://localhost:3000/liff/[feature]?dev=true&customerId=[uuid]
```

### Implementation Pattern

```typescript
const urlParams = new URLSearchParams(window.location.search);
const devMode = urlParams.get('dev') === 'true';

if (devMode && process.env.NODE_ENV === 'development') {
  console.log('[DEV MODE] Bypassing LIFF initialization');
  // Set test data
  const testCustomerId = urlParams.get('customerId') || '';
  setViewState('ready');
  return;
}
```

### Testing Checklist

- [ ] Dev mode works locally
- [ ] Both languages (EN/TH) display correctly
- [ ] Language toggle persists selection
- [ ] Mobile responsive (375px - 768px)
- [ ] Loading states display properly
- [ ] Error states handle gracefully
- [ ] All links work (tel:, mailto:, https:)
- [ ] LIFF SDK initializes in LINE app
- [ ] Authentication flow (if applicable)
- [ ] Back button behavior
- [ ] TypeScript compilation succeeds
- [ ] Production build succeeds

---

## Deployment Checklist

### Pre-Deployment

1. **TypeScript Check**
   ```bash
   npm run typecheck
   ```

2. **Production Build**
   ```bash
   npm run build
   ```

3. **Code Review**
   - All translations present
   - Brand colors consistent
   - No console.logs in production code
   - Error handling complete

### LINE Developers Console Setup

1. **Create LIFF App**
   - Go to LINE Developers Console
   - Select your channel
   - Add LIFF app

2. **Configure LIFF Settings**
   - **Endpoint URL:** `https://booking.len.golf/liff/[feature]`
   - **Size:** Full
   - **Scope:** `profile` (if authentication needed)
   - **Bot link feature:** On (if you have a bot)

3. **Get LIFF ID**
   - Copy the LIFF ID (format: `XXXXXXX-XXXXXXX`)
   - Add to `.env.local`: `NEXT_PUBLIC_LIFF_ID=your-liff-id`

4. **Update Rich Menu**
   - Add button/link to rich menu
   - Link format: `https://liff.line.me/[LIFF_ID]`
   - Or directly: `https://booking.len.golf/liff/[feature]` (if public)

### Post-Deployment

1. **Test in LINE App**
   - Open from rich menu
   - Test authentication flow
   - Verify all features work
   - Test both languages

2. **Monitor Errors**
   - Check Vercel logs
   - Check browser console in LINE app (if possible)
   - Monitor Supabase logs (if database queries)

---

## Common Patterns

### Loading State

```typescript
if (viewState === 'loading') {
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="text-center">
        <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-primary mb-4"></div>
        <p className="text-gray-600">Loading...</p>
      </div>
    </div>
  );
}
```

### Error State

```typescript
if (viewState === 'error') {
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg shadow-md p-6 max-w-md w-full">
        <div className="text-red-600 text-center mb-4">
          <svg className="w-16 h-16 mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <h2 className="text-xl font-bold">Error</h2>
        </div>
        <p className="text-gray-600 text-center">{error}</p>
      </div>
    </div>
  );
}
```

### Click-to-Action Links

**IMPORTANT:** Use simple `<a>` tags with `href` attributes for navigation in LIFF, NOT `liff.openWindow()`. This is more reliable and works consistently across different LINE app versions.

```typescript
// Phone
<a href="tel:+66966682335">Call Now</a>

// Email
<a href="mailto:info@len.golf">Send Email</a>

// Maps
<a href="https://maps.app.goo.gl/[shortlink]">Get Directions</a>

// Internal navigation (same app)
<a href="/bookings">Book Now</a>

// External URL
<a href="https://lin.ee/uxQpIXn">Contact Us</a>

// With styling to look like a button
<a
  href="/bookings"
  className="block w-full bg-primary text-primary-foreground px-6 py-3.5 rounded-xl font-bold text-base text-center hover:opacity-90 active:opacity-80 transition-opacity shadow-lg"
>
  Book Now
</a>
```

**Why not `liff.openWindow()`?**
- Simple links work more reliably in LIFF
- No need for complex initialization checks
- Better compatibility across LINE versions
- Works in both LIFF and regular browsers

**When to use `liff.openWindow()`:**
- Only if you specifically need LIFF SDK features
- For sharing content via LINE
- For closing the LIFF window programmatically

### Interactive Elements

```typescript
// Buttons
<button className="w-full px-4 py-2.5 bg-primary text-primary-foreground font-medium rounded-lg hover:opacity-90 active:opacity-80 transition-opacity">
  Button Text
</button>

// Cards with icons
<div className="flex gap-3">
  <div className="flex-shrink-0 w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center">
    <svg className="w-6 h-6 text-blue-600" {...}>...</svg>
  </div>
  <div className="flex-1">
    <div className="font-semibold text-gray-900">Title</div>
    <div className="text-sm text-gray-600">Description</div>
  </div>
</div>
```

### Instagram Stories-Style UI Pattern

For swipeable/tappable full-screen content (like the Promotions page):

**Key Components:**
1. Progress bars at top showing current position
2. Tap zones for navigation (left = previous, right = next)
3. Auto-advance timer with pause on hold
4. Full-screen layout with image and content sections

**Critical: Touch vs Mouse Event Handling**

Mobile devices fire BOTH touch and mouse events, which can cause double-triggering. Always handle this correctly:

```typescript
const [isTouchDevice, setIsTouchDevice] = React.useState(false);

const handleTouchStart = () => {
  setIsTouchDevice(true);
  onPauseStart();
};

const handleTouchEnd = (e: React.TouchEvent<HTMLDivElement>) => {
  e.preventDefault(); // Prevent mouse events from firing
  onPauseEnd();
  // Navigation logic here
};

const handleMouseDown = () => {
  if (isTouchDevice) return; // Skip if touch already handled
  onPauseStart();
};

const handleMouseUp = (e: React.MouseEvent<HTMLDivElement>) => {
  if (isTouchDevice) return; // Skip if touch already handled
  // Navigation logic here
};
```

**Event Propagation with Interactive Elements**

Use `stopPropagation()` on buttons/links inside tap zones to prevent parent handlers from firing:

```typescript
const handleTouchStart = (e: React.TouchEvent<HTMLAnchorElement>) => {
  e.stopPropagation();
};

const handleTouchEnd = (e: React.TouchEvent<HTMLAnchorElement>) => {
  e.stopPropagation();
};

<a
  href="/bookings"
  onTouchStart={handleTouchStart}
  onTouchEnd={handleTouchEnd}
  className="..."
>
  Book Now
</a>
```

**Timer Management**

Clear intervals before navigation to prevent race conditions:

```typescript
const handleNext = useCallback(() => {
  // Clear interval FIRST to prevent race condition
  if (progressIntervalRef.current) {
    clearInterval(progressIntervalRef.current);
    progressIntervalRef.current = null;
  }

  // Then update state
  setCurrentIndex((prev) => {
    if (prev < items.length - 1) {
      return prev + 1;
    }
    // Stay on last item, don't auto-close
    return prev;
  });
}, []);
```

**Layout Pattern for Image-Heavy Content**

Split layout works best - no gradient overlays:

```typescript
<div className="relative w-full h-full flex flex-col">
  {/* Image Section - Top 60% */}
  <div className="relative w-full h-[60%] bg-black">
    <Image
      src={imageUrl}
      alt={title}
      fill
      className="object-contain"
      priority
    />
  </div>

  {/* Content Section - Bottom 40% */}
  <div className="relative w-full h-[40%] bg-black flex flex-col px-5 pt-6 pb-safe">
    <h2 className="text-2xl font-black text-white mb-3">
      {title}
    </h2>
    <p className="text-sm text-white/90 mb-4">
      {description}
    </p>
    {/* Buttons, etc. */}
  </div>
</div>
```

**Reference Implementation:** See `app/liff/promotions/` for complete example

---

## Troubleshooting

### Common Issues

#### 1. Wrong Page Title Displayed

**Symptom:** LIFF page shows incorrect title in browser header (e.g., "Lucky Draw" appears on Contact page)

**Cause:** Missing or incorrect page-specific `layout.tsx` file. The LIFF app name in LINE Developers Console does NOT control the page title - it only affects the management console.

**Solution:**
1. Create `app/liff/[feature]/layout.tsx` for each LIFF page
2. Set correct metadata:
   ```typescript
   export const metadata: Metadata = {
     title: "LENGOLF Your Feature Name",
     description: "Feature description",
     // ...
   };
   ```
3. Verify parent layout (`app/liff/layout.tsx`) has generic title
4. Rebuild and redeploy

**Reference:** See Step 3 in Implementation Guide

#### 2. LIFF SDK Not Loading

**Symptom:** `window.liff is undefined`

**Solution:**
- Check internet connection
- Verify CDN URL is correct
- Ensure script loading completes before init

#### 3. Authentication Loop

**Symptom:** Page keeps redirecting to login

**Solution:**
- Check LIFF ID is correct
- Verify redirect URI matches current URL
- Clear LINE app cache

#### 4. Dev Mode Not Working

**Symptom:** Dev mode shows production behavior

**Solution:**
- Ensure `?dev=true` in URL
- Check `process.env.NODE_ENV === 'development'`
- Verify conditional logic

#### 5. Translations Missing

**Symptom:** Some text not translated

**Solution:**
- Check all text uses translation keys
- Verify translation object has all keys
- Test both languages

#### 6. Build Fails

**Symptom:** Production build errors

**Solution:**
```bash
# Clean build cache
rm -rf .next

# Run typecheck
npm run typecheck

# Fix errors, then rebuild
npm run build
```

#### 7. Button Clicks Not Working in LIFF

**Symptom:** Buttons work in browser but do nothing when clicked in LINE app

**Cause:** Using `liff.openWindow()` or complex onClick handlers that don't work reliably in LIFF context

**Solution:**
1. Replace `<button onClick={...}>` with `<a href="...">`
2. Use simple `href` navigation instead of LIFF SDK methods
3. If inside tap zones or other event handlers, add `stopPropagation()` to link events:
   ```typescript
   <a
     href="/bookings"
     onTouchStart={(e) => e.stopPropagation()}
     onTouchEnd={(e) => e.stopPropagation()}
   >
     Book Now
   </a>
   ```

**Reference:** See Contact Us page (`components/liff/contact/ContactCard.tsx`) for working example

#### 8. Double-Tap/Double-Click Issues

**Symptom:** Tapping once causes two actions (skips items, triggers twice)

**Cause:** Mobile browsers fire both touch AND mouse events for the same interaction

**Solution:**
1. Add touch device detection state
2. Use `preventDefault()` in touch handlers
3. Skip mouse handlers if touch was detected
4. See "Instagram Stories-Style UI Pattern" section for complete pattern

**Reference:** See Promotions page (`components/liff/promotions/PromotionStory.tsx`)

---

## Resources

### Documentation

- [LINE LIFF Documentation](https://developers.line.biz/en/docs/liff/)
- [Next.js Documentation](https://nextjs.org/docs)
- [Tailwind CSS](https://tailwindcss.com/docs)

### Internal References

- Lucky Draw LIFF: `app/liff/lucky-draw/page.tsx`
- Contact Us LIFF: `app/liff/contact/page.tsx`
- Promotions LIFF: `app/liff/promotions/page.tsx` (Instagram Stories pattern)
- LIFF Types: `types/liff.d.ts`
- Brand Colors: `app/globals.css` (`:root` variables)
- Promotions Data: `lib/liff/promotions-data.ts`

### Tools

- LIFF Inspector: Available in LINE Developers Console
- React DevTools: For component debugging
- Chrome DevTools: Use remote debugging for LINE app

---

## Future Improvements

### Potential Features to Add

1. **Booking LIFF Page**
   - Quick booking from LINE
   - Package selection
   - Time slot picker

2. **Profile LIFF Page**
   - View VIP status
   - Package usage
   - Booking history

3. **Promotions LIFF Page**
   - Current promotions
   - Coupon codes
   - Special offers

4. **FAQ LIFF Page**
   - Common questions
   - Search functionality
   - Category filters

### Suggested Enhancements

- Shared LIFF components library
- Common hooks (useLiff, useLanguage)
- Analytics integration
- Error reporting service
- A/B testing framework

---

## Changelog

| Date | Changes |
|------|---------|
| 2025-12-17 | Initial documentation based on Contact Us implementation |
| 2025-12-17 | Added page title/metadata troubleshooting and page-specific layout guidance |
| 2025-12-19 | Added Promotions LIFF page learnings: Instagram Stories UI pattern, touch/mouse event handling, navigation best practices (use anchor tags not liff.openWindow), timer management, split layout for image-heavy content |

---

**Maintainer:** Development Team
**Last Review:** December 19, 2025
