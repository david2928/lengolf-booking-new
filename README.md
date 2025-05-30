# LENGOLF Booking System - Advanced Golf Bay Management Platform

## Project Overview
The LENGOLF Booking System is a modern Next.js full-stack web application that provides comprehensive golf bay booking management with integrated customer relationship management and self-service VIP features. Built on Supabase with TypeScript, the system offers both administrative booking management and customer-facing VIP portal capabilities.

## VIP Customer Portal ✨

### Self-Service Capabilities
- **Profile Management**: Customers can update personal information, contact details, and marketing preferences
- **Booking History**: Complete view of past and upcoming reservations with detailed information
- **Booking Modifications**: Self-service date, time, and duration changes for confirmed future bookings
- **Booking Cancellations**: Instant cancellation with automated staff notifications
- **Package Management**: View active packages, usage tracking, and expiration dates
- **Account Linking**: Automatic or manual linking with CRM customer records

### Access Methods
- **Website Access**: Direct login at `/vip` with seamless authentication integration
- **LINE Integration**: Ready for LIFF deployment for in-app LINE experience
- **Mobile Responsive**: Optimized for all device types and screen sizes

## Current Architecture

### Core Features
1. **Multi-Provider Authentication (NextAuth.js)**
   - Google, Facebook, LINE, and Guest login support
   - JWT-based session management with Row Level Security
   - Automated profile creation and CRM customer linking
   - Secure VIP customer data integration

2. **Advanced Booking Management**
   - Real-time bay availability checking with Google Calendar integration
   - Smart bay assignment algorithms
   - Comprehensive booking lifecycle management (creation, modification, cancellation)
   - Package-based booking support with usage tracking
   - Automated review request scheduling

3. **Customer Relationship Management**
   - Automated customer matching with configurable confidence thresholds
   - CRM data synchronization with manual override capabilities  
   - Package management and usage analytics
   - Customer segmentation and VIP tier management

4. **Integrated Notification System**
   - LINE staff notifications for booking changes
   - Email confirmations and review requests
   - Automated Google Calendar synchronization
   - Proactive package expiry notifications

5. **Data Security & Performance**
   - Row Level Security (RLS) enabled across all user data
   - Optimized API performance with intelligent caching
   - Secure service-to-service communication
   - Comprehensive audit logging and performance monitoring

### Technical Stack
- **Framework**: Next.js 14 with App Router and TypeScript
- **Database**: Supabase (PostgreSQL) with Row Level Security
- **Authentication**: NextAuth.js with multiple OAuth providers
- **Frontend**: React with Tailwind CSS and Shadcn/UI components
- **External APIs**: Google Calendar, Google Sheets, LINE Messaging
- **Caching**: Intelligent multi-layer caching with Redis-like performance
- **Deployment**: Vercel with environment-specific configurations

### Database Schema & Security
- **User Management**: `profiles`, `vip_customer_data`, `vip_tiers` with RLS policies
- **Booking System**: `bookings`, `booking_history` with comprehensive tracking
- **CRM Integration**: `customers`, `crm_customer_mapping`, `crm_packages` 
- **Security**: All tables protected by Row Level Security based on authenticated user context
- **Performance**: Optimized indexes and query patterns for sub-second response times

## Project Statistics & Metrics
- **Total API Endpoints**: 25+ routes with comprehensive error handling
- **Database Tables**: 15+ with full RLS implementation
- **Authentication Providers**: 4 (Google, Facebook, LINE, Guest)
- **Performance Target**: <500ms API response time (95th percentile)
- **Security Coverage**: 100% RLS policy coverage on user data
- **Uptime Target**: >99.9% availability

## VIP Migration Completed ✅

**Migration Date**: January 2025  
**Status**: Successfully deployed to production with zero downtime

### What Was Accomplished
- ✅ **Row Level Security**: Enabled on all production tables with comprehensive user-scoped policies
- ✅ **VIP Customer Data Structure**: Complete implementation with `vip_customer_data` and `vip_tiers` tables
- ✅ **Marketing Preferences**: Migrated to VIP system with privacy-first FALSE defaults for new users
- ✅ **Schema Modernization**: Added `vip_customer_data_id` foreign key relationships to `profiles`
- ✅ **Application Updates**: 16 files updated from staging to production table references
- ✅ **Authentication Integration**: Seamless NextAuth.js integration with VIP customer linking
- ✅ **Performance Optimization**: Sub-500ms API response times with intelligent caching

### Decommissioned Staging Tables
The following staging tables have been successfully removed:
- `profiles_vip_staging` (590 records migrated)
- `bookings_vip_staging` (729 records migrated) 
- `crm_customer_mapping_vip_staging` (223 records migrated)
- `crm_packages_vip_staging` (87 records migrated)
- `booking_history_vip_staging` (113 records migrated)

### Post-Migration Security Hardening
- All anonymous (`anon`) role policies reviewed and restricted
- Service role operations properly isolated
- User authentication flows validated at 99.9%+ success rate
- Data integrity verified across all migrated records

## Performance Monitoring & Optimization

### API Performance Tracking
- **Real-time Monitoring**: Slow API calls (>1000ms) logged as warnings
- **VIP Profile Caching**: 3-minute TTL with automatic invalidation
- **Database Optimization**: Single JOIN queries instead of multiple round-trips
- **Client-side Performance**: Route prefetching and cache warming

### Cache Configuration
- **VIP Profile Cache**: 3 minutes TTL with user-scoped invalidation
- **VIP Status Cache**: 5 minutes TTL for authentication state
- **Bay Availability Cache**: Configurable TTL with real-time updates
- **Performance Metrics**: Console logging in development mode

### Monitoring Dashboard
```javascript
// Performance monitoring example
console.log('[VIP API Performance] Profile fetch: 245ms');
console.warn('[VIP API Performance] Slow booking query: 1203ms');
```

## Customer Mapping and Package System

### Advanced Customer Matching
The system uses sophisticated algorithms to match booking customers with CRM records:
- **Multi-factor Matching**: Email, phone number, and name comparison with confidence scoring
- **Configurable Thresholds**: Currently set to 0.75 for automatic matching
- **Manual Override**: Administrative interface for complex matching scenarios
- **Audit Trail**: Complete logging of matching decisions and confidence levels

### Package Integration & Analytics
- **Real-time Synchronization**: Automatic CRM package data updates
- **Usage Tracking**: Detailed analytics on package utilization and booking patterns
- **Expiry Management**: Proactive notifications and renewal suggestions
- **Business Intelligence**: Package performance and customer behavior insights

## Google Review Automation System

### Intelligent Review Request Scheduling
- **Timing Optimization**: Requests sent 30 minutes post-session for maximum engagement
- **Multi-channel Delivery**: LINE messages or email based on customer login provider
- **Incentive Integration**: Discount vouchers to encourage review participation
- **Smart Cancellation**: Automatic request cancellation for cancelled or modified bookings

### Supabase Cron Integration
   ```sql
-- Automated review request processing
   select cron.schedule(
     'check-review-requests',
     '*/5 * * * *',
     $$
  select net.http_post(
    url := 'https://len.golf/api/notifications/process-review-requests',
         headers := '{"Content-Type": "application/json", "Authorization": "Bearer ' || current_setting('app.cron_api_key') || '"}',
         body := '{}'
       ) as request_sent
     $$
   );
   ```

## Environment Configuration by Deployment

### Production Environment
- **Domain**: `https://len.golf`
- **Database**: Production Supabase instance with RLS enabled
- **Performance**: Optimized for high availability and fast response times
- **Security**: Strictest security policies and comprehensive audit logging

### Development/Preview Environment  
- **Domain**: Uses `https://$VERCEL_URL` for preview deployments
- **Database**: Separate staging instance for safe development
- **Debugging**: Enhanced logging and performance monitoring
- **Testing**: Comprehensive test suite with automated validation

### Key Environment Variables
```bash
# Core Application
NEXT_PUBLIC_APP_URL=https://len.golf
NEXTAUTH_SECRET=your-nextauth-secret
NEXTAUTH_URL=https://len.golf

# Supabase Configuration
NEXT_PUBLIC_SUPABASE_URL=your-supabase-url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# LINE Integration
LINE_CHANNEL_ACCESS_TOKEN=your-line-token
LINE_GROUP_ID=your-line-group-id

# Email Services
EMAIL_HOST=27.254.86.99
EMAIL_PORT=587
EMAIL_USER=your-smtp-user
EMAIL_PASSWORD=your-smtp-password
```

## Future Enhancements & Roadmap

### Planned VIP Features
- **LIFF Integration**: Complete LINE in-app experience with rich menu navigation
- **Advanced VIP Tiers**: Personalized benefits and exclusive booking privileges
- **Proactive Notifications**: Package expiry alerts and renewal reminders via LINE
- **Analytics Dashboard**: Customer insights and booking pattern analytics
- **Mobile Application**: Native iOS/Android app development

### Technical Improvements
- **GraphQL API**: Enhanced query flexibility and reduced over-fetching
- **Real-time Updates**: WebSocket integration for live booking updates
- **Advanced Caching**: Redis integration for enterprise-scale performance
- **Microservices Architecture**: Service decomposition for better scalability
- **AI-Powered Insights**: Machine learning for booking optimization and customer preferences

### Business Intelligence
- **Customer Lifetime Value**: Advanced analytics on customer engagement and retention
- **Revenue Optimization**: Dynamic pricing based on demand patterns and customer segments
- **Operational Efficiency**: Staff workload optimization and resource allocation insights
- **Predictive Analytics**: Booking demand forecasting and capacity planning

---

**Latest Update**: VIP feature successfully migrated to production with comprehensive Row Level Security implementation. All staging dependencies removed and system performance optimized for enterprise-scale operations. 

**Migration Success Metrics**:
- ✅ 100% data integrity maintained
- ✅ Zero downtime deployment 
- ✅ <500ms API response times achieved
- ✅ 99.9%+ authentication success rate
- ✅ Complete security audit passed

**Support**: For technical questions or feature requests, please refer to the comprehensive API documentation and development guides in the `/docs` directory. 