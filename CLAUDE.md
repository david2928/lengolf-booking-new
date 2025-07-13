# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview
LENGOLF Booking System - Next.js 14 full-stack golf bay booking management with integrated VIP customer portal. Built with TypeScript, Supabase PostgreSQL, and NextAuth.js multi-provider authentication.

## Commands

### Development
```bash
npm run dev           # Start development server
npm run build         # Production build
npm run start         # Production server
npm run typecheck     # TypeScript type checking (run before commits)
npm run lint          # ESLint code quality check
npm run test          # Run Jest test suite
npm run test:watch    # Jest in watch mode
npm run format        # Prettier code formatting
```

## Architecture Overview

### Core Stack
- **Framework**: Next.js 14 with App Router (NOT Pages Router)
- **Database**: Supabase PostgreSQL with Row Level Security (RLS) enabled
- **Authentication**: NextAuth.js v4 with Google/Facebook/LINE/Guest providers
- **UI**: Tailwind CSS + Shadcn/UI components
- **API**: Next.js API routes with TypeScript

### Database Security
- **CRITICAL**: All user data protected by Row Level Security (RLS)
- Use `createServerClient()` for server-side operations
- Use `createBrowserClient()` for client-side operations
- Always validate authentication before database operations

### Key File Locations

#### Authentication & Users
- NextAuth config: `app/api/auth/options.ts`
- User profiles: `utils/supabase/crm.ts`
- VIP status: `lib/vipService.ts`
- Supabase clients: `utils/supabase/client.ts` & `utils/supabase/server.ts`

#### Booking System
- Availability API: `app/api/availability/`
- Booking creation: `app/api/bookings/create/route.ts`
- Booking components: `app/(features)/bookings/components/`
- Bay assignment logic: `utils/booking-utils.ts`

#### VIP Portal
- VIP dashboard: `app/(features)/vip/dashboard/page.tsx`
- VIP components: `components/vip/`
- VIP API endpoints: `app/api/vip/`
- VIP status caching: 3-minute TTL with user-scoped invalidation

## Critical Development Guidelines

### Database Operations
- **NEVER bypass RLS** - all queries must be user-scoped
- Profile creation auto-triggers VIP customer data creation
- Package data synced from external CRM (read-only)
- Use `backoffice` schema for CRM data (read-only)

### API Patterns
- Use `NextRequest` and `NextResponse` for App Router APIs
- Implement Zod validation where available
- Target <500ms response time (95th percentile)
- Return standardized error responses

### Component Architecture
- UI components: `components/ui/` (Shadcn/UI)
- VIP components: `components/vip/`
- Shared components: `components/shared/`
- Follow server component patterns, client only when needed

### VIP System
- VIP status determined by `vip_customer_data` table presence
- Account linking connects `profiles` to CRM via `crm_customer_mapping`
- Customer matching uses confidence scoring (0.75 threshold)
- Package tracking with real-time usage analytics

## Environment Variables (Required)
```bash
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
NEXTAUTH_SECRET=
NEXTAUTH_URL=
LINE_CHANNEL_ACCESS_TOKEN=
EMAIL_HOST=
EMAIL_USER=
EMAIL_PASSWORD=
```

## Common Gotchas

### Authentication
- Guest users have limited functionality
- VIP features require authenticated + linked CRM accounts
- LINE integration prepared but not fully deployed

### Performance
- VIP profile data cached (3-minute TTL)
- Availability queries optimized for real-time responses
- Use proper loading states and error boundaries

### Booking Flow
- Multi-step: Date → Time → Details → Confirmation
- Real-time availability with Google Calendar integration
- Support for both regular and package-based bookings
- Automated review request scheduling (30min post-session)

## Key Files to Understand First
1. `app/layout.tsx` - Root layout and providers
2. `app/api/auth/options.ts` - Authentication configuration  
3. `utils/supabase/server.ts` - Server-side database client
4. `components/vip/DashboardView.tsx` - VIP portal main component
5. `app/(features)/bookings/page.tsx` - Booking flow entry point

## When Making Changes
1. Maintain RLS compliance for all database operations
2. Follow established component patterns in VIP/booking systems
3. Test authentication flows after auth-related changes
4. Run `npm run typecheck` before committing
5. Validate API changes against frontend implementations