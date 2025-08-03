# LENGOLF Website Internationalization Plan

## Executive Summary

This document outlines a comprehensive plan to implement Thai language support for the LENGOLF booking system with future scalability for additional languages. The implementation will use **Next.js 14 App Router** with **next-intl** as the primary internationalization library, providing automatic language detection based on browser settings and seamless language switching capability.

## 🎯 Goals

1. **Primary**: Add Thai language support with English/Thai language switching
2. **Secondary**: Create scalable i18n architecture for future language additions
3. **UX**: Automatic language detection based on browser Accept-Language header
4. **Performance**: Maintain current performance standards with static generation support

## 📋 Current State Analysis

### Technology Stack
- **Framework**: Next.js 14 with App Router
- **Database**: Supabase PostgreSQL with RLS
- **Authentication**: NextAuth.js with Google/Facebook/LINE/Guest providers
- **UI Components**: Shadcn/UI + Tailwind CSS
- **State Management**: React Context + Server Components

### Text Content Categories

#### 1. Static UI Text (High Priority)
- **Navigation & Headers**: Menu items, page titles, breadcrumbs
- **Authentication**: Login buttons, form labels, error messages
- **Booking Flow**: Step indicators, form fields, validation messages
- **VIP Dashboard**: Card titles, status messages, action buttons
- **Error Pages**: 404, error boundaries, loading states

#### 2. Dynamic Content (Medium Priority)
- **Time Slots**: Period names (Morning/Afternoon/Evening), time formatting
- **Booking Status**: Confirmed, pending, cancelled states
- **VIP Tiers**: Gold, Silver tier names and descriptions
- **Package Names**: From CRM data (may need mapping table)

#### 3. Metadata & SEO (High Priority)
- **Page Titles**: HTML title tags, Open Graph titles
- **Meta Descriptions**: SEO descriptions, social media previews
- **Keywords**: Search engine optimization terms
- **Structured Data**: JSON-LD business information

#### 4. Email & Notifications (Medium Priority)
- **Email Templates**: Booking confirmations, review requests
- **System Messages**: Success/error notifications
- **Review Request Templates**: Automated follow-up emails

#### 5. Database Content (Low Priority - Future Phase)
- **Package Types**: Names and descriptions in backoffice.package_types
- **VIP Tier Descriptions**: Custom tier benefit descriptions
- **Static System Messages**: Stored in database for admin control

## 🏗️ Implementation Architecture

### Recommended Solution: Next-Intl

**Why Next-Intl over i18next:**
- Native Next.js 14 App Router support
- Server component optimization
- Static generation compatibility
- Automatic locale detection
- TypeScript-first design
- Smaller bundle size

### 1. Project Structure

```
app/
├── [locale]/                    # Dynamic locale segment
│   ├── layout.tsx              # Locale-aware root layout
│   ├── page.tsx                # Localized home page
│   ├── (features)/
│   │   ├── auth/
│   │   │   └── login/
│   │   │       └── page.tsx    # Localized login
│   │   ├── bookings/
│   │   │   ├── page.tsx        # Localized booking flow
│   │   │   └── confirmation/
│   │   │       └── page.tsx    # Localized confirmation
│   │   └── vip/
│   │       ├── dashboard/
│   │       │   └── page.tsx    # Localized VIP dashboard
│   │       ├── profile/
│   │       └── packages/
│   └── globals.css
├── api/                        # API routes (locale-agnostic)
├── middleware.ts              # Enhanced for i18n routing
└── layout.tsx                 # Global layout wrapper

messages/                      # Translation files
├── en.json                   # English translations
├── th.json                   # Thai translations
└── shared.json               # Shared/common translations

lib/
├── i18n/
│   ├── config.ts            # i18n configuration
│   ├── request.ts           # Server-side i18n
│   ├── navigation.ts        # Localized navigation
│   └── locale-detection.ts  # Browser language detection
```

### 2. Routing Configuration

```typescript
// lib/i18n/config.ts
import {defineRouting} from 'next-intl/routing';

export const routing = defineRouting({
  locales: ['en', 'th'],
  defaultLocale: 'en',
  localDetection: true,
  domains: {
    // Optional: Domain-based routing for future expansion
    'en.booking.len.golf': 'en',
    'th.booking.len.golf': 'th'
  }
});

export const pathnames = {
  '/': '/',
  '/bookings': {
    en: '/bookings',
    th: '/จองเลน'  // Localized URL paths
  },
  '/vip': {
    en: '/vip',
    th: '/สมาชิกวีไอพี'
  }
} as const;
```

### 3. Middleware Enhancement

```typescript
// middleware.ts (Enhanced)
import createMiddleware from 'next-intl/middleware';
import { routing } from './lib/i18n/config';
import { NextRequest } from 'next/server';

const i18nMiddleware = createMiddleware(routing);

export default function middleware(request: NextRequest) {
  // Apply i18n routing first
  const response = i18nMiddleware(request);
  
  // Existing auth middleware logic can be preserved
  // ... existing middleware code
  
  return response;
}

export const config = {
  matcher: [
    '/((?!api|_next|_vercel|.*\\..*).*)',
    '/(en|th)/:path*'
  ]
};
```

## 📝 Translation Content Breakdown

### Priority 1: Core User Experience (Week 1-2)

#### Navigation & Layout (app/[locale]/layout.tsx)
```json
{
  "navigation": {
    "home": "Home | หน้าหลัก",
    "bookings": "Book a Bay | จองเลน",
    "vip": "VIP Portal | พอร์ทัล VIP",
    "profile": "Profile | โปรไฟล์"
  },
  "meta": {
    "title": "LENGOLF - Indoor Golf Simulator in Bangkok | LENGOLF - จำลองกอล์ฟในร่มที่กรุงเทพ",
    "description": "Experience Bangkok's premier indoor golf simulator | สัมผัสประสบการณ์จำลองกอล์ฟในร่มชั้นนำของกรุงเทพ"
  }
}
```

#### Authentication Flow (app/[locale]/(features)/auth/login/page.tsx)
```json
{
  "auth": {
    "welcome": "Welcome to LENGOLF | ยินดีต้อนรับสู่ LENGOLF",
    "loginPrompt": "Please choose a login method to start booking your slot | เลือกวิธีการล็อกอินเพื่อเริ่มจองเลน",
    "continueWith": "Continue with | ดำเนินการต่อด้วย",
    "continueAsGuest": "Continue as Guest | ดำเนินการต่อในฐานะแขก",
    "or": "Or | หรือ",
    "connecting": "Connecting... | กำลังเชื่อมต่อ...",
    "privacyPolicy": "Privacy Policy | นโยบายความเป็นส่วนตัว",
    "browserWarning": "For the best experience, please open this page in your device's external browser | เพื่อประสบการณ์ที่ดีที่สุด โปรดเปิดหน้านี้ในเบราว์เซอร์ภายนอกของอุปกรณ์"
  }
}
```

#### Booking Flow (app/[locale]/(features)/bookings/)
```json
{
  "booking": {
    "selectDate": "Select Date | เลือกวันที่",
    "selectTime": "Select Time | เลือกเวลา", 
    "morning": "Morning | เช้า",
    "afternoon": "Afternoon | บ่าย",
    "evening": "Evening | เย็น",
    "duration": "Duration | ระยะเวลา",
    "hours": "hour | ชั่วโมง",
    "hours_plural": "hours | ชั่วโมง",
    "select": "Select | เลือก",
    "loading": "Loading available times... | กำลังโหลดเวลาที่ว่าง...",
    "noSlots": "No available time slots for this date | ไม่มีเวลาว่างสำหรับวันที่นี้",
    "upTo": "Up to | สูงสุด"
  }
}
```

#### VIP Dashboard (components/vip/DashboardView.tsx)
```json
{
  "vip": {
    "welcome": "Welcome, | ยินดีต้อนรับ",
    "welcomeBack": "Welcome back, | ยินดีต้อนรับกลับมา",
    "readyToManage": "Ready to manage your bookings? | พร้อมจัดการการจองของคุณแล้วหรือยัง?",
    "vipAccess": "Your VIP access is ready. Start by making a booking to begin your golf journey! | การเข้าถึง VIP ของคุณพร้อมแล้ว เริ่มต้นด้วยการจองเพื่อเริ่มการเดินทางกอล์ฟของคุณ!",
    "tier": "Tier | ระดับ",
    "enjoyBenefits": "Enjoy your premium benefits | เพลิดเพลินกับสิทธิประโยชน์พรีเมียมของคุณ",
    "upcomingSession": "Upcoming Session | เซสชันที่จะมาถึง",
    "activePackage": "Active Package | แพ็คเกจที่ใช้งาน",
    "quickAccess": "Quick Access | เข้าถึงอย่างรวดเร็ว",
    "makeNewBooking": "Make New Booking | จองใหม่",
    "manageBookings": "Manage Bookings | จัดการการจอง",
    "myVipProfile": "My VIP Profile | โปรไฟล์ VIP ของฉัน",
    "myPackages": "My Packages | แพ็คเกจของฉัน",
    "lengolfMainSite": "LENGOLF Main Site | เว็บไซต์หลัก LENGOLF",
    "noUpcoming": "You have no upcoming bookings | คุณไม่มีการจองที่จะมาถึง",
    "makeFirstBooking": "Make First Booking | จองครั้งแรก",
    "noActivePackage": "No active package found | ไม่พบแพ็คเกจที่ใช้งาน",
    "remaining": "remaining | เหลือ",
    "expires": "Expires | หมดอายุ",
    "viewPackageDetails": "View Package Details | ดูรายละเอียดแพ็คเกจ",
    "viewPackages": "View Packages | ดูแพ็คเกจ"
  }
}
```

### Priority 2: Extended Features (Week 3-4)

#### Time & Date Formatting
```typescript
// lib/i18n/date-utils.ts
export const formatBookingDateTime = (dateStr: string, timeStr: string, locale: string) => {
  const dateObj = new Date(`${dateStr}T${timeStr}`);
  
  if (locale === 'th') {
    // Thai Buddhist calendar + Thai formatting
    const thaiYear = dateObj.getFullYear() + 543;
    const thaiWeekday = dateObj.toLocaleDateString('th-TH', { weekday: 'long' });
    const thaiMonth = dateObj.toLocaleDateString('th-TH', { month: 'long' });
    const day = dateObj.getDate();
    const time = dateObj.toLocaleTimeString('th-TH', { hour: 'numeric', minute: '2-digit' });
    
    return `${thaiWeekday}ที่ ${day} ${thaiMonth} ${thaiYear} เวลา ${time}`;
  }
  
  // English formatting (existing)
  const weekday = dateObj.toLocaleDateString('en-US', { weekday: 'long' });
  const month = dateObj.toLocaleDateString('en-US', { month: 'short' });
  const day = dateObj.getDate();
  const time = dateObj.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
  
  return `${weekday}, ${month} ${day} at ${time}`;
};
```

#### Error Messages & Validation
```json
{
  "errors": {
    "general": "An error occurred | เกิดข้อผิดพลาด",
    "networkError": "Network connection failed | การเชื่อมต่อเครือข่ายล้มเหลว",
    "authError": "Authentication failed | การยืนยันตัวตนล้มเหลว",
    "bookingFailed": "Booking creation failed | การสร้างการจองล้มเหลว",
    "invalidInput": "Invalid input | ข้อมูลไม่ถูกต้อง",
    "required": "This field is required | จำเป็นต้องกรอกช่องนี้",
    "phoneInvalid": "Invalid phone number | หมายเลขโทรศัพท์ไม่ถูกต้อง",
    "emailInvalid": "Invalid email address | อีเมลไม่ถูกต้อง"
  }
}
```

### Priority 3: Email & Notifications (Week 5-6)

#### Email Templates (app/api/notifications/email/)
```json
{
  "email": {
    "bookingConfirmation": {
      "subject": "Booking Confirmation - LENGOLF | ยืนยันการจอง - LENGOLF",
      "greeting": "Dear | เรียน",
      "confirmationText": "Your booking has been confirmed | การจองของคุณได้รับการยืนยันแล้ว",
      "bookingDetails": "Booking Details | รายละเอียดการจอง",
      "date": "Date | วันที่",
      "time": "Time | เวลา",
      "duration": "Duration | ระยะเวลา",
      "bay": "Bay | เลน",
      "totalAmount": "Total Amount | จำนวนเงินรวม",
      "thankYou": "Thank you for choosing LENGOLF! | ขอขอบคุณที่เลือก LENGOLF!"
    },
    "reviewRequest": {
      "subject": "How was your LENGOLF experience? | LENGOLF เป็นอย่างไรบ้าง?",
      "greeting": "Hi | สวัสดี",
      "requestText": "We hope you enjoyed your golf session! | เราหวังว่าคุณจะเพลิดเพลินกับเซสชันกอล์ฟ!",
      "reviewPrompt": "Please take a moment to review your experience | กรุณาใช้เวลาสักครู่เพื่อรีวิวประสบการณ์ของคุณ"
    }
  }
}
```

## 🛠️ Implementation Phases

### Phase 1: Foundation (Week 1-2)
**Goal**: Core i18n infrastructure and authentication flow

1. **Setup Next-Intl**
   ```bash
   npm install next-intl
   ```

2. **Create folder structure** as outlined above

3. **Configure routing and middleware**

4. **Implement language detection and switching**

5. **Translate authentication flow** (login page, providers, error messages)

6. **Update app layout** with locale-aware metadata and language switcher

### Phase 2: Booking Flow (Week 3-4)
**Goal**: Complete booking experience in both languages

1. **Translate booking components**
   - Date selection
   - Time slots with Thai time formatting
   - Booking form fields
   - Confirmation page

2. **Implement date/time localization**
   - Thai Buddhist calendar support
   - Thai number formatting
   - Localized time period names

3. **Add form validation** in both languages

### Phase 3: VIP Portal (Week 4-5)
**Goal**: Full VIP experience localization

1. **Translate VIP dashboard**
   - Welcome messages
   - Package information
   - Booking management
   - Quick access menu

2. **Implement dynamic content translation**
   - Package names from CRM
   - VIP tier descriptions
   - Booking status messages

3. **Localized navigation** and breadcrumbs

### Phase 4: Email & SEO (Week 5-6)
**Goal**: Communication and discoverability

1. **Email template localization**
   - Booking confirmations
   - Review requests
   - Cancellation notices

2. **SEO optimization**
   - Localized meta descriptions
   - Hreflang tags
   - Structured data in Thai

3. **Search engine optimization**
   - Thai keywords
   - Localized URLs (optional)

### Phase 5: Testing & Optimization (Week 6-7)
**Goal**: Quality assurance and performance

1. **Comprehensive testing**
   - User acceptance testing with Thai users
   - Cross-browser compatibility
   - Mobile responsiveness

2. **Performance optimization**
   - Bundle size analysis
   - Static generation verification
   - Core Web Vitals testing

3. **Accessibility testing**
   - Screen reader compatibility
   - Keyboard navigation
   - Color contrast (Thai text)

## 🌐 Language Switching Implementation

### Language Switcher Component
```typescript
// components/shared/LanguageSwitcher.tsx
'use client';

import { useRouter, usePathname } from 'next/navigation';
import { useLocale } from 'next-intl';
import { Globe } from 'lucide-react';

export function LanguageSwitcher() {
  const router = useRouter();
  const pathname = usePathname();
  const locale = useLocale();

  const switchLanguage = (newLocale: string) => {
    const path = pathname.replace(`/${locale}`, `/${newLocale}`);
    router.push(path);
  };

  return (
    <div className="relative">
      <button 
        className="flex items-center gap-2 px-3 py-2 rounded-md hover:bg-gray-100"
        onClick={() => switchLanguage(locale === 'en' ? 'th' : 'en')}
      >
        <Globe className="h-4 w-4" />
        <span className="text-sm font-medium">
          {locale === 'en' ? 'ไทย' : 'EN'}
        </span>
      </button>
    </div>
  );
}
```

### Automatic Language Detection
```typescript
// lib/i18n/locale-detection.ts
export function detectPreferredLocale(): 'en' | 'th' {
  if (typeof window === 'undefined') return 'en';
  
  const browserLang = navigator.language || navigator.languages?.[0];
  
  // Thai language detection
  if (browserLang?.startsWith('th')) {
    return 'th';
  }
  
  // Default to English
  return 'en';
}

// Middleware integration
export function createLocaleMiddleware() {
  return createMiddleware({
    locales: ['en', 'th'],
    defaultLocale: 'en',
    localeDetection: true,
    localePrefix: 'always' // Always show locale in URL
  });
}
```

## 📊 Database Considerations

### Translation-Ready Schema Extensions

For future database content translation, consider these additions:

```sql
-- Translation table for package types
CREATE TABLE backoffice.package_type_translations (
  id SERIAL PRIMARY KEY,
  package_type_id INTEGER REFERENCES backoffice.package_types(id),
  locale VARCHAR(5) NOT NULL,
  name VARCHAR(255) NOT NULL,
  display_name VARCHAR(255),
  description TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(package_type_id, locale)
);

-- Translation table for VIP tiers
CREATE TABLE public.vip_tier_translations (
  id SERIAL PRIMARY KEY,
  tier_name VARCHAR(50) NOT NULL,
  locale VARCHAR(5) NOT NULL,
  display_name VARCHAR(255) NOT NULL,
  description TEXT,
  benefits JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(tier_name, locale)
);

-- System messages for admin control
CREATE TABLE public.system_message_translations (
  id SERIAL PRIMARY KEY,
  message_key VARCHAR(100) NOT NULL,
  locale VARCHAR(5) NOT NULL,
  content TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(message_key, locale)
);
```

### CRM Package Name Mapping
```typescript
// lib/package-translations.ts
const PACKAGE_NAME_MAPPING: Record<string, { en: string; th: string }> = {
  "Gold Package 10hrs": {
    en: "Gold Package 10hrs",
    th: "แพ็คเกจโกลด์ 10 ชั่วโมง"
  },
  "Silver Package 5hrs": {
    en: "Silver Package 5hrs", 
    th: "แพ็คเกจซิลเวอร์ 5 ชั่วโมง"
  },
  // Add more mappings as needed
};

export function translatePackageName(packageName: string, locale: string): string {
  const mapping = PACKAGE_NAME_MAPPING[packageName];
  if (mapping && locale in mapping) {
    return mapping[locale as keyof typeof mapping];
  }
  return packageName; // Fallback to original name
}
```

## 🚀 Future Language Expansion

### Adding Additional Languages (e.g., Chinese, Japanese)

1. **Update Configuration**
```typescript
// lib/i18n/config.ts
export const routing = defineRouting({
  locales: ['en', 'th', 'zh', 'ja'],
  defaultLocale: 'en'
});
```

2. **Add Translation Files**
```
messages/
├── en.json
├── th.json
├── zh.json     # Simplified Chinese
└── ja.json     # Japanese
```

3. **Extend Language Switcher**
```typescript
const languages = [
  { code: 'en', name: 'English', native: 'English' },
  { code: 'th', name: 'Thai', native: 'ไทย' },
  { code: 'zh', name: 'Chinese', native: '中文' },
  { code: 'ja', name: 'Japanese', native: '日本語' }
];
```

4. **Update Date/Time Formatting**
```typescript
export function formatDateTime(date: Date, locale: string) {
  const formatters = {
    'en': () => format(date, 'PPp', { locale: enUS }),
    'th': () => formatThaiDate(date),
    'zh': () => format(date, 'PPp', { locale: zhCN }),
    'ja': () => format(date, 'PPp', { locale: ja })
  };
  
  return formatters[locale]?.() || formatters['en']();
}
```

## 📈 Performance Considerations

### Bundle Size Optimization
- **Tree shaking**: Only import used translations
- **Code splitting**: Load translations per route
- **Compression**: Enable gzip for translation files
- **CDN caching**: Static translation assets

### Static Generation Support
```typescript
// app/[locale]/layout.tsx
export async function generateStaticParams() {
  return [{ locale: 'en' }, { locale: 'th' }];
}

// Ensure all localized routes are pre-rendered
export const dynamic = 'force-static';
```

### Translation Loading Strategy
```typescript
// lib/i18n/messages.ts
import { notFound } from 'next/navigation';

export async function getMessages(locale: string) {
  try {
    return (await import(`../../messages/${locale}.json`)).default;
  } catch (error) {
    notFound();
  }
}
```

## 🧪 Testing Strategy

### Unit Testing
```typescript
// __tests__/i18n.test.ts
import { render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import LoginPage from '@/app/[locale]/(features)/auth/login/page';

describe('LoginPage i18n', () => {
  it('renders in English', () => {
    const messages = { auth: { welcome: 'Welcome to LENGOLF' } };
    render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <LoginPage />
      </NextIntlClientProvider>
    );
    expect(screen.getByText('Welcome to LENGOLF')).toBeInTheDocument();
  });

  it('renders in Thai', () => {
    const messages = { auth: { welcome: 'ยินดีต้อนรับสู่ LENGOLF' } };
    render(
      <NextIntlClientProvider locale="th" messages={messages}>
        <LoginPage />
      </NextIntlClientProvider>
    );
    expect(screen.getByText('ยินดีต้อนรับสู่ LENGOLF')).toBeInTheDocument();
  });
});
```

### E2E Testing
```typescript
// e2e/i18n.spec.ts
import { test, expect } from '@playwright/test';

test('language switching works correctly', async ({ page }) => {
  await page.goto('/en/auth/login');
  
  // Verify English content
  await expect(page.getByText('Welcome to LENGOLF')).toBeVisible();
  
  // Switch to Thai
  await page.click('[data-testid="language-switcher"]');
  
  // Verify Thai content
  await expect(page.getByText('ยินดีต้อนรับสู่ LENGOLF')).toBeVisible();
  
  // Verify URL changed
  expect(page.url()).toContain('/th/auth/login');
});
```

## 📋 Translation Checklist

### High Priority Items
- [ ] Authentication flow (login, registration, errors)
- [ ] Navigation and headers
- [ ] Booking flow (date/time selection, confirmation)
- [ ] VIP dashboard main content
- [ ] Error messages and loading states
- [ ] Form validation messages
- [ ] Email subject lines
- [ ] SEO metadata (titles, descriptions)

### Medium Priority Items
- [ ] Email template body content
- [ ] Toast notifications
- [ ] Modal dialogs
- [ ] Table headers and data labels
- [ ] Button text and tooltips
- [ ] Placeholder text
- [ ] Help text and descriptions

### Low Priority Items
- [ ] Footer content
- [ ] Legal/privacy policy text
- [ ] Advanced error details
- [ ] Debug messages
- [ ] Admin interface text

## 💰 Cost Considerations

### Development Time Estimate
- **Phase 1** (Foundation): 2 weeks
- **Phase 2** (Booking Flow): 2 weeks  
- **Phase 3** (VIP Portal): 1 week
- **Phase 4** (Email & SEO): 1 week
- **Phase 5** (Testing): 1 week
- **Total**: ~7 weeks

### Translation Costs
- **Professional Translation**: ~฿30-50 per word
- **Estimated word count**: 2,000-3,000 words
- **Translation budget**: ฿60,000-150,000
- **Alternative**: In-house translation + professional review

### Ongoing Maintenance
- **New feature translations**: Plan ฿10,000-20,000 per major feature
- **Content updates**: Budget for regular translation updates
- **Quality assurance**: Quarterly review with native speakers

## 🎯 Success Metrics

### User Experience Metrics
- **Language detection accuracy**: >95% correct auto-detection
- **Language switching success rate**: >99%
- **Page load times**: <100ms impact from i18n
- **User engagement**: Track Thai user session duration vs English

### Business Metrics
- **Thai user conversion rate**: Target 15-20% improvement
- **Booking completion rate**: Monitor for both languages
- **Support ticket reduction**: Fewer language-related inquiries
- **Market penetration**: Track Thai market growth

### Technical Metrics
- **Bundle size increase**: <10% impact
- **Core Web Vitals**: Maintain current scores
- **SEO performance**: Thai keyword rankings
- **Error rates**: <0.1% i18n-related errors

## 🔧 Deployment Strategy

### Staging Environment
1. **Feature branch**: `feature/i18n-implementation`
2. **Staging deployment**: Test with Thai users
3. **Performance testing**: Core Web Vitals validation
4. **Translation review**: Professional Thai reviewer

### Production Rollout
1. **Soft launch**: Enable for 10% of traffic
2. **Monitor metrics**: Error rates, performance impact
3. **Gradual rollout**: Increase to 50%, then 100%
4. **Fallback plan**: Quick disable mechanism if issues arise

### Post-Launch
1. **User feedback collection**: In-app feedback forms
2. **Translation refinement**: Based on user feedback
3. **SEO monitoring**: Thai search performance
4. **Continuous improvement**: Regular translation updates

## 🎛️ Content Management Solution

### Problem Statement
Managing translations across multiple files can become challenging when content needs frequent updates. We need a centralized, user-friendly way to manage translations without requiring developer intervention for content changes.

### Recommended Solution: Database-Driven Translation Management

#### 1. Translation Management Schema

```sql
-- Translation management tables
CREATE TABLE public.translation_namespaces (
  id SERIAL PRIMARY KEY,
  namespace VARCHAR(100) UNIQUE NOT NULL, -- e.g., 'auth', 'booking', 'vip'
  description TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE public.translation_keys (
  id SERIAL PRIMARY KEY,
  namespace_id INTEGER REFERENCES translation_namespaces(id),
  key_path VARCHAR(255) NOT NULL, -- e.g., 'welcome', 'errors.required'
  description TEXT,
  context TEXT, -- Where this key is used
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(namespace_id, key_path)
);

CREATE TABLE public.translations (
  id SERIAL PRIMARY KEY,
  key_id INTEGER REFERENCES translation_keys(id),
  locale VARCHAR(5) NOT NULL, -- 'en', 'th', etc.
  value TEXT NOT NULL,
  is_approved BOOLEAN DEFAULT false,
  updated_by VARCHAR(255), -- User who updated
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  version INTEGER DEFAULT 1,
  UNIQUE(key_id, locale)
);

-- Translation change history
CREATE TABLE public.translation_history (
  id SERIAL PRIMARY KEY,
  translation_id INTEGER REFERENCES translations(id),
  old_value TEXT,
  new_value TEXT,
  changed_by VARCHAR(255),
  change_reason TEXT,
  changed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Seed data
INSERT INTO translation_namespaces (namespace, description) VALUES
('auth', 'Authentication and login related content'),
('booking', 'Booking flow and time selection'),
('vip', 'VIP dashboard and features'),
('common', 'Common UI elements and navigation'),
('email', 'Email templates and notifications'),
('errors', 'Error messages and validation');
```

#### 2. Admin Interface for Translation Management

Create a simple admin panel at `/admin/translations` (protected route):

```typescript
// app/admin/translations/page.tsx
'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';

interface Translation {
  id: string;
  keyPath: string;
  namespace: string;
  en: string;
  th: string;
  context?: string;
  lastUpdated: string;
  isApproved: boolean;
}

export default function TranslationManagement() {
  const [translations, setTranslations] = useState<Translation[]>([]);
  const [selectedNamespace, setSelectedNamespace] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [editingTranslation, setEditingTranslation] = useState<Translation | null>(null);

  const namespaces = ['all', 'auth', 'booking', 'vip', 'common', 'email', 'errors'];

  return (
    <div className="container mx-auto p-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold">Translation Management</h1>
        <div className="flex gap-4">
          <Button onClick={() => handleExportTranslations()}>
            Export JSON
          </Button>
          <Button onClick={() => handlePublishChanges()} variant="default">
            Publish Changes
          </Button>
        </div>
      </div>

      {/* Filters */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Filters</CardTitle>
        </CardHeader>
        <CardContent className="flex gap-4">
          <select 
            value={selectedNamespace}
            onChange={(e) => setSelectedNamespace(e.target.value)}
            className="px-3 py-2 border rounded-md"
          >
            {namespaces.map(ns => (
              <option key={ns} value={ns}>
                {ns === 'all' ? 'All Namespaces' : ns.charAt(0).toUpperCase() + ns.slice(1)}
              </option>
            ))}
          </select>
          <Input
            placeholder="Search translations..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="flex-1"
          />
        </CardContent>
      </Card>

      {/* Translation List */}
      <div className="grid gap-4">
        {filteredTranslations.map((translation) => (
          <Card key={translation.id}>
            <CardHeader>
              <div className="flex justify-between items-start">
                <div>
                  <CardTitle className="text-lg">
                    {translation.namespace}.{translation.keyPath}
                  </CardTitle>
                  {translation.context && (
                    <p className="text-sm text-muted-foreground mt-1">
                      Used in: {translation.context}
                    </p>
                  )}
                </div>
                <div className="flex gap-2">
                  <Badge variant={translation.isApproved ? "default" : "secondary"}>
                    {translation.isApproved ? "Approved" : "Pending"}
                  </Badge>
                  <Button size="sm" onClick={() => setEditingTranslation(translation)}>
                    Edit
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-2">English</label>
                  <p className="p-3 bg-gray-50 rounded border">{translation.en}</p>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2">Thai</label>
                  <p className="p-3 bg-gray-50 rounded border">{translation.th}</p>
                </div>
              </div>
              <p className="text-xs text-muted-foreground mt-2">
                Last updated: {translation.lastUpdated}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Edit Modal */}
      {editingTranslation && (
        <EditTranslationModal
          translation={editingTranslation}
          onSave={handleSaveTranslation}
          onClose={() => setEditingTranslation(null)}
        />
      )}
    </div>
  );
}
```

#### 3. API Endpoints for Translation Management

```typescript
// app/api/admin/translations/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/utils/supabase/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/options';

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  
  // Check admin permissions
  if (!session || !isAdmin(session.user)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = createServerClient();
  const { searchParams } = new URL(request.url);
  const namespace = searchParams.get('namespace');
  const search = searchParams.get('search');

  let query = supabase
    .from('translation_keys')
    .select(`
      *,
      namespace:translation_namespaces(namespace),
      translations(locale, value, is_approved, updated_at)
    `);

  if (namespace && namespace !== 'all') {
    query = query.eq('translation_namespaces.namespace', namespace);
  }

  if (search) {
    query = query.or(`key_path.ilike.%${search}%,description.ilike.%${search}%`);
  }

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ translations: data });
}

export async function PUT(request: NextRequest) {
  const session = await getServerSession(authOptions);
  
  if (!session || !isAdmin(session.user)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { keyId, locale, value, reason } = await request.json();
  const supabase = createServerClient();

  // Get current value for history
  const { data: currentTranslation } = await supabase
    .from('translations')
    .select('*')
    .eq('key_id', keyId)
    .eq('locale', locale)
    .single();

  // Update translation
  const { error: updateError } = await supabase
    .from('translations')
    .upsert({
      key_id: keyId,
      locale,
      value,
      updated_by: session.user.email,
      updated_at: new Date().toISOString(),
      is_approved: false // Require approval for changes
    });

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  // Log change history
  if (currentTranslation) {
    await supabase.from('translation_history').insert({
      translation_id: currentTranslation.id,
      old_value: currentTranslation.value,
      new_value: value,
      changed_by: session.user.email,
      change_reason: reason
    });
  }

  return NextResponse.json({ success: true });
}
```

#### 4. Build-Time Translation Export

```typescript
// scripts/export-translations.ts
import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';

async function exportTranslations() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  // Fetch all approved translations
  const { data: translations } = await supabase
    .from('translation_keys')
    .select(`
      key_path,
      namespace:translation_namespaces(namespace),
      translations!inner(locale, value, is_approved)
    `)
    .eq('translations.is_approved', true);

  // Group by locale and namespace
  const translationsByLocale: Record<string, Record<string, any>> = {};

  translations?.forEach((item) => {
    item.translations.forEach((translation: any) => {
      const { locale, value } = translation;
      const namespace = item.namespace.namespace;
      
      if (!translationsByLocale[locale]) {
        translationsByLocale[locale] = {};
      }
      
      if (!translationsByLocale[locale][namespace]) {
        translationsByLocale[locale][namespace] = {};
      }

      // Handle nested keys (e.g., "errors.required" -> { errors: { required: "..." } })
      const keyParts = item.key_path.split('.');
      let current = translationsByLocale[locale][namespace];
      
      for (let i = 0; i < keyParts.length - 1; i++) {
        if (!current[keyParts[i]]) {
          current[keyParts[i]] = {};
        }
        current = current[keyParts[i]];
      }
      
      current[keyParts[keyParts.length - 1]] = value;
    });
  });

  // Write to JSON files
  Object.entries(translationsByLocale).forEach(([locale, namespaces]) => {
    const content = JSON.stringify(namespaces, null, 2);
    const filePath = path.join(process.cwd(), 'messages', `${locale}.json`);
    fs.writeFileSync(filePath, content);
    console.log(`Exported ${locale}.json`);
  });
}

exportTranslations().catch(console.error);
```

#### 5. Automated Build Integration

```json
// package.json
{
  "scripts": {
    "build": "npm run export-translations && next build",
    "export-translations": "ts-node scripts/export-translations.ts",
    "dev": "npm run export-translations && next dev"
  }
}
```

#### 6. Content Workflow

```typescript
// lib/translation-workflow.ts
export class TranslationWorkflow {
  // Submit new translation key
  static async submitTranslationKey(
    namespace: string,
    keyPath: string,
    enValue: string,
    thValue: string,
    context?: string
  ) {
    // API call to create new translation key with pending approval
  }

  // Approve translation changes
  static async approveTranslation(translationId: string, approvedBy: string) {
    // Mark translation as approved
    // Trigger build notification
  }

  // Bulk approve translations
  static async bulkApprove(translationIds: string[], approvedBy: string) {
    // Batch approve multiple translations
  }

  // Export for review
  static async exportForReview(namespace?: string) {
    // Export translations to Excel/CSV for external review
  }

  // Import reviewed translations
  static async importReviewed(file: File) {
    // Import translations from Excel/CSV
    // Mark as pending approval
  }
}
```

### Alternative Solutions

#### Option 1: Headless CMS Integration (Strapi/Contentful)

```typescript
// lib/cms-translations.ts
import { createClient } from 'contentful';

const client = createClient({
  space: process.env.CONTENTFUL_SPACE_ID!,
  accessToken: process.env.CONTENTFUL_ACCESS_TOKEN!,
});

export async function getTranslations(locale: string) {
  const entries = await client.getEntries({
    content_type: 'translation',
    locale: locale,
  });

  return entries.items.reduce((acc, item) => {
    const { namespace, key, value } = item.fields;
    if (!acc[namespace]) acc[namespace] = {};
    acc[namespace][key] = value;
    return acc;
  }, {});
}
```

**Pros**: 
- Rich editing interface
- Version control built-in
- Multi-user collaboration
- Media management

**Cons**:
- Additional service cost
- External dependency
- More complex setup

#### Option 2: GitHub-Based Content Management

```typescript
// lib/github-translations.ts
import { Octokit } from '@octokit/rest';

const octokit = new Octokit({
  auth: process.env.GITHUB_TOKEN,
});

export async function updateTranslation(
  locale: string,
  namespace: string,
  key: string,
  value: string
) {
  const path = `messages/${locale}/${namespace}.json`;
  
  // Get current file
  const { data: fileData } = await octokit.rest.repos.getContent({
    owner: 'your-org',
    repo: 'lengolf-translations',
    path,
  });

  // Update content
  const content = JSON.parse(
    Buffer.from(fileData.content, 'base64').toString()
  );
  
  // Set nested key
  const keys = key.split('.');
  let current = content;
  for (let i = 0; i < keys.length - 1; i++) {
    if (!current[keys[i]]) current[keys[i]] = {};
    current = current[keys[i]];
  }
  current[keys[keys.length - 1]] = value;

  // Commit changes
  await octokit.rest.repos.createOrUpdateFileContents({
    owner: 'your-org',
    repo: 'lengolf-translations',
    path,
    message: `Update ${namespace}.${key} for ${locale}`,
    content: Buffer.from(JSON.stringify(content, null, 2)).toString('base64'),
    sha: fileData.sha,
  });
}
```

**Pros**:
- Version control built-in
- GitHub interface for editing
- Pull request workflow
- Free for public repos

**Cons**:
- Less user-friendly for non-developers
- Manual merge process
- Limited rich text editing

### Recommended: Hybrid Approach

Combine database management with file generation:

1. **Content editing**: Use database-driven admin interface
2. **Version control**: Export to Git on approval
3. **Build process**: Generate static JSON files
4. **Fallback**: Runtime database lookup for missing keys

```typescript
// lib/hybrid-translations.ts
export async function getTranslation(
  locale: string,
  namespace: string,
  key: string
) {
  // Try static file first (fastest)
  try {
    const staticTranslations = await import(`@/messages/${locale}.json`);
    return staticTranslations[namespace]?.[key];
  } catch {
    // Fallback to database (for new/pending translations)
    return getDatabaseTranslation(locale, namespace, key);
  }
}

async function getDatabaseTranslation(
  locale: string,
  namespace: string,
  key: string
) {
  const supabase = createBrowserClient();
  const { data } = await supabase
    .from('translations')
    .select('value')
    .eq('locale', locale)
    .eq('translation_keys.namespace.namespace', namespace)
    .eq('translation_keys.key_path', key)
    .eq('is_approved', true)
    .single();
    
  return data?.value;
}
```

### Content Management Workflow

1. **Content Creation**:
   - Developers add new translation keys via admin interface
   - Content team fills in translations
   - Native speakers review and approve

2. **Content Updates**:
   - Marketing team updates content via admin interface
   - Changes are marked as "pending approval"
   - Automated notifications to reviewers

3. **Publishing**:
   - Approved changes are exported to JSON files
   - Committed to Git repository
   - Triggered build and deployment

4. **Emergency Updates**:
   - Critical fixes can be pushed directly to database
   - Runtime fallback ensures immediate availability
   - Next build incorporates changes into static files

### Integration with Existing Workflow

```typescript
// Update existing components to use managed translations
// components/vip/DashboardView.tsx
import { useTranslations } from 'next-intl';

export default function DashboardView({ isMatched, userName }: Props) {
  const t = useTranslations('vip');
  
  return (
    <div>
      <h1>{t('welcome', { userName })}</h1>
      <p>{t('readyToManage')}</p>
      {/* Rest of component */}
    </div>
  );
}
```

This content management solution provides:
- **Non-technical editing**: Marketing team can update content
- **Professional review**: Native speakers can review translations
- **Version control**: All changes are tracked and reversible
- **Performance**: Static files for fast loading
- **Flexibility**: Database fallback for dynamic content
- **Scalability**: Easy to add new languages and content

---

## 🏁 Conclusion

This comprehensive plan provides a roadmap for implementing Thai language support while maintaining scalability for future languages. The phased approach ensures minimal disruption to current operations while delivering maximum value to Thai users.

The use of **next-intl** with Next.js 14 App Router provides a modern, performant foundation that aligns with current best practices and ensures long-term maintainability.

**Next Steps:**
1. **Review and approve** this implementation plan
2. **Allocate resources** for the 7-week development timeline
3. **Engage professional translator** for high-quality Thai translations
4. **Set up staging environment** for i18n testing
5. **Begin Phase 1** implementation with foundation setup

This investment in internationalization will significantly improve user experience for Thai customers and position LENGOLF for future international expansion.