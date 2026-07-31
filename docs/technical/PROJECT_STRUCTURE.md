# Project Structure Documentation

## Overview
The Lengolf Booking Refactor application is a Next.js 14 full-stack application built with TypeScript, featuring a VIP customer portal, booking management system, and CRM integration. This document provides a comprehensive overview of the codebase organization.

## 📁 Root Directory Structure

```
lengolf-booking-refactor/
├── app/                    # Next.js 14 App Router
│   ├── (features)/        # Feature-based route groups
│   ├── api/               # API routes
│   ├── auth/              # Authentication pages
│   └── globals.css        # Global styles
├── components/            # Reusable React components
│   ├── ui/               # Base UI components (Shadcn/UI)
│   ├── vip/              # VIP-specific components
│   ├── shared/           # Shared components
│   └── providers/        # Context providers
├── lib/                  # Core services and utilities
├── utils/                # Utility functions and helpers
├── hooks/                # Custom React hooks
├── types/                # TypeScript type definitions
├── public/               # Static assets
├── docs/                 # Documentation
└── supabase/            # Database migrations
```

## 🎯 App Directory Structure

### Feature Routes (`app/(features)/`)
```
(features)/
├── auth/                 # Authentication flow
│   ├── components/       # Auth-specific components
│   ├── login/           # Login page
│   └── layout.tsx       # Auth layout
├── bookings/            # Main booking system
│   ├── components/      # Booking components
│   ├── hooks/           # Booking-specific hooks
│   ├── types/           # Booking type definitions
│   ├── confirmation/    # Booking confirmation
│   └── actions.ts       # Server actions
└── vip/                 # VIP customer portal
    ├── profile/         # Profile management
    ├── bookings/        # VIP booking management
    ├── packages/        # Package tracking
    ├── dashboard/       # VIP dashboard
    ├── membership/      # Membership tiers
    ├── link-account/    # Account linking
    ├── contexts/        # VIP-specific contexts
    └── layout.tsx       # VIP layout wrapper
```

### API Routes (`app/api/`)
```
api/
├── auth/                # NextAuth.js configuration
│   ├── [...nextauth]/   # NextAuth dynamic route
│   └── options.ts       # Auth configuration
├── availability/        # Bay availability checking
│   ├── check/           # Availability verification
│   └── route.ts         # Main availability endpoint
├── bookings/            # Booking management
│   ├── create/          # Booking creation
│   └── calendar/        # Calendar integration
├── vip/                 # VIP customer APIs
│   ├── status/          # VIP status checking
│   ├── profile/         # Profile management
│   ├── bookings/        # VIP booking operations
│   ├── packages/        # Package information
│   └── link-account/    # Account linking
├── ~crm/~               # ❌ DEPRECATED CRM integration (removed 2025)
│   ├── ~mapping/~       # ❌ Customer mapping (deprecated)
│   ├── ~match/~         # ❌ Customer matching (deprecated)
│   ├── ~profile/~       # ❌ CRM profile sync (deprecated)
│   ├── ~packages/~      # ❌ Package sync (deprecated)
│   └── ~sync-packages/~ # ❌ Package synchronization (deprecated)
├── notifications/       # Notification system
│   ├── line/            # LINE messaging
│   ├── email/           # Email notifications
│   ├── schedule-review-request/
│   ├── send-review-request/
│   └── process-review-requests/
└── admin/               # Administrative APIs
    └── calendar-retry/  # Calendar operation retry
```

## 🧩 Component Architecture

### UI Components (`components/ui/`)
Based on Shadcn/UI library with Radix UI primitives:
```
ui/
├── button.tsx          # Button variants
├── input.tsx           # Form inputs
├── dialog.tsx          # Modal dialogs
├── dropdown-menu.tsx   # Dropdown menus
├── tabs.tsx            # Tab navigation
├── badge.tsx           # Status badges
├── alert.tsx           # Alert messages
├── checkbox.tsx        # Checkboxes
├── label.tsx           # Form labels
├── calendar.tsx        # Date picker
├── popover.tsx         # Popover content
├── select.tsx          # Select dropdowns
├── separator.tsx       # Visual separators
├── skeleton.tsx        # Loading skeletons
└── tooltip.tsx         # Tooltips
```

### VIP Components (`components/vip/`)
```
vip/
├── DashboardView.tsx        # Main VIP dashboard
├── DashboardCard.tsx        # Dashboard summary cards
├── ProfileView.tsx          # Profile management
├── BookingsList.tsx         # VIP booking list
├── BookingModifyModal.tsx   # Booking modification
├── BookingCancelModal.tsx   # Booking cancellation
├── PackagesList.tsx         # Package tracking
├── MembershipTiers.tsx      # VIP tier display
├── ManualLinkAccountForm.tsx # Account linking
├── LinkAccountPrompt.tsx    # Account link prompt
├── EmptyState.tsx          # Empty state display
└── SummaryCard.tsx         # Summary information
```

### Shared Components (`components/shared/`)
```
shared/
├── Header.tsx           # Application header
├── Footer.tsx           # Application footer
├── Navigation.tsx       # Main navigation
├── LoadingSpinner.tsx   # Loading indicators
└── ErrorPage.tsx        # Error boundary
```

### Providers (`components/providers/`)
```
providers/
├── VipStatusProvider.tsx        # VIP status context
└── GtmUserProfileProvider.tsx   # Google Tag Manager
```

## 🔧 Core Services (`lib/`)

### Service Files
```
lib/
├── calendarService.ts         # Google Calendar integration
├── emailService.ts           # Email notifications
├── lineNotifyService.ts      # LINE messaging
├── vipService.ts            # VIP customer operations
├── reviewRequestScheduler.ts # Review automation
├── googleApiConfig.ts       # Google API setup
├── bookingCalendarConfig.ts # Booking calendar config
├── bayConfig.ts            # Bay configuration
├── cache.ts                # Caching utilities
├── debug.ts                # Debug utilities
├── env.ts                  # Environment variables
├── init.ts                 # Initialization
└── utils.ts                # General utilities
```

## 🛠️ Utilities (`utils/`)

### Utility Modules
```
utils/
├── supabase/              # Supabase integrations
│   ├── client.ts         # Client initialization
│   ├── server.ts         # Server client
│   ├── middleware.ts     # Supabase middleware
│   ├── crm.ts           # CRM utilities
│   └── crm-packages.ts  # Package utilities
├── customer-matching.ts  # Customer matching logic
├── booking-formatter.ts  # Booking formatting
├── calendar-retry.ts     # Calendar retry logic
├── gtm.ts               # Google Tag Manager
├── logging.ts           # Logging utilities
├── date.ts              # Date utilities
└── logger.ts            # Logger configuration
```

## 🎣 Custom Hooks (`hooks/`)

```
hooks/
└── useMediaQuery.ts     # Media query hook
```

### Feature-Specific Hooks
```
app/(features)/bookings/hooks/
├── useAvailability.ts   # Availability checking
└── useBookingFlow.ts    # Booking flow management
```

## 📝 Type Definitions (`types/`)

```
types/
├── index.ts             # Main type exports
├── next-auth.d.ts       # NextAuth type extensions
├── env.d.ts            # Environment types
├── supabase.ts         # Supabase types
└── database.ts         # Database types
```

### Feature-Specific Types
```
app/(features)/bookings/types/
└── index.ts             # Booking types
```

## 🎨 Styling Structure

### Global Styles
- **globals.css**: Tailwind CSS base styles and custom CSS variables
- **tailwind.config.ts**: Tailwind configuration with custom theme
- **components.json**: Shadcn/UI configuration

### Styling Approach
- **Tailwind CSS**: Utility-first CSS framework
- **CSS Variables**: For theme customization
- **Shadcn/UI**: Pre-built component library
- **Responsive Design**: Mobile-first approach

## 🔧 Configuration Files

### Core Configuration
```
├── next.config.js       # Next.js configuration
├── next.config.ts       # TypeScript Next.js config
├── tsconfig.json        # TypeScript configuration
├── tailwind.config.ts   # Tailwind CSS configuration
├── middleware.ts        # Next.js middleware
├── package.json         # Dependencies and scripts
└── vercel.json         # Vercel deployment config
```

### Development Tools
```
├── eslint.config.mjs    # ESLint configuration
├── .eslintrc.json      # Legacy ESLint config
├── jest.config.js      # Jest testing configuration
├── jest.setup.js       # Jest setup file
├── postcss.config.js   # PostCSS configuration
└── Dockerfile          # Docker configuration
```

## 🧪 Testing Structure

```
__tests__/
├── availability.test.ts # Availability system tests
└── sample.test.ts      # Sample test file
```

## 📊 Database Structure

```
supabase/
└── migrations/          # Database migration files
```

### Key Database Tables (Updated 2025)
- **profiles**: User authentication and basic information with customer_id links
- **customers**: Unified customer data (primary source of truth)
- **bookings**: Booking records with customer_id relationships and full audit trail
- **crm_packages**: Customer package information with customer_id links
- **~vip_customer_data~**: ❌ **DEPRECATED** - Removed in 2025 modernization
- **~vip_tiers~**: ❌ **DEPRECATED** - VIP tiers removed in new system
- **~crm_customer_mapping~**: ❌ **DEPRECATED** - Direct customer_id links used instead

## 🚀 Development Workflow

### Key Scripts
```json
{
  "dev": "next dev",
  "build": "next build",
  "start": "next start",
  "lint": "next lint",
  "typecheck": "tsc --noEmit",
  "test": "jest",
  "test:watch": "jest --watch"
}
```

### Environment Setup
- **Development**: Local Next.js server with hot reload
- **Staging**: Preview deployments on Vercel
- **Production**: Optimized build deployed to Vercel

## 🔒 Security Implementation

### Authentication Flow
1. **NextAuth.js**: Multi-provider authentication
2. **JWT Tokens**: Secure session management
3. **Row Level Security**: Database-level access control
4. **Middleware**: Request validation and rate limiting

### Data Protection (Enhanced 2025)
- **RLS Policies**: User-scoped data access with customer-based VIP access
- **Admin Client Pattern**: Bypass RLS with explicit verification for VIP APIs
- **Customer-based Access**: VIP users can access all data linked to their customer_id
- **Input Validation**: Zod schema validation
- **CSRF Protection**: Built-in NextAuth protection
- **Rate Limiting**: IP-based request throttling

## 📱 Responsive Design

### Breakpoints
- **Mobile**: 640px and below
- **Tablet**: 641px - 1024px
- **Desktop**: 1025px and above

### Mobile-First Approach
- Progressive enhancement from mobile base
- Touch-friendly interactions
- Optimized performance for mobile devices

## 🔧 Performance Optimizations

### Frontend Optimizations
- **Code Splitting**: Automatic route-based splitting
- **Image Optimization**: Next.js Image component
- **Font Loading**: Optimized web font loading
- **Bundle Analysis**: Webpack bundle optimization

### Backend Optimizations
- **API Caching**: Intelligent response caching
- **Database Indexing**: Optimized query performance
- **Connection Pooling**: Supabase connection management
- **Response Compression**: Automatic compression

## 🚀 2025 VIP System Modernization

### Major Architecture Changes
The VIP system underwent significant modernization in January 2025:

#### Removed Dependencies
- **❌ vip_customer_data table**: Eliminated legacy VIP data structure
- **❌ stable_hash_id**: Removed legacy identifier system
- **❌ CRM APIs**: Deprecated separate CRM integration endpoints
- **❌ VIP Tiers**: Simplified system without tier complexity

#### Enhanced Security Model
```typescript
// New dual access pattern for VIP APIs
const supabase = createServerClient();        // RLS-compliant for profiles
const adminSupabase = createAdminClient();    // RLS-bypass with verification

// Customer-based access verification
const hasDirectAccess = booking.user_id === profileId;
const hasCustomerAccess = userProfile.customer_id && booking.customer_id === userProfile.customer_id;
```

#### Simplified Data Flow
```
Old: profiles → vip_customer_data → crm_customer_mapping → customers
New: profiles → customers (direct customer_id relationship)
```

#### Performance Improvements
- **48% Code Reduction**: VIP Profile API reduced from 324 to 169 lines
- **Direct Queries**: Eliminated complex cross-table joins
- **Single Source of Truth**: Unified customer data in `customers` table
- **Enhanced Caching**: Improved caching patterns for customer data

#### API Modernization
- **VIP Profile API**: Simplified architecture with direct customer access
- **VIP Bookings API**: Customer-centric access to all related bookings (73 bookings now accessible)
- **VIP Booking Management**: Enhanced cancel/modify with customer verification
- **Security**: Maintained access control while enabling customer-wide visibility

### Migration Accomplishments
✅ **Zero Breaking Changes**: Seamless transition for existing users  
✅ **Enhanced Performance**: Faster response times with simplified queries  
✅ **Improved Security**: Better access control with explicit verification  
✅ **Code Maintainability**: Significantly reduced complexity  
✅ **Data Consistency**: Single source of truth for customer data  

## 📈 Monitoring and Logging

### Development Monitoring
- **Console Logging**: Structured logging in development
- **Performance Tracking**: API response time monitoring
- **Error Tracking**: Comprehensive error logging

### Production Monitoring
- **Vercel Analytics**: Performance monitoring
- **Supabase Monitoring**: Database performance
- **Custom Logging**: Application-specific logging

This project structure supports a scalable, maintainable codebase with clear separation of concerns and modern development practices. 