# LENGOLF Booking System - Refactoring Analysis

## Project Overview
The LENGOLF Booking System is a full-stack web application that manages golf bay bookings. The system handles user authentication through multiple providers, booking management, and integrates with various external services.

## Current Architecture

### Core Features
1. **Authentication (21 files)**
   - Multiple login methods: Google, Facebook, LINE, and Guest
   - JWT-based authentication
   - Session management

2. **Booking Management (14 files)**
   - Slot availability checking
   - Bay assignment
   - Booking creation and management
   - Calendar integration

3. **Customer Management (10 files)**
   - Customer data storage
   - Profile management
   - Data synchronization with Google Sheets

4. **Notifications (11 files)**
   - Email confirmations
   - LINE notifications
   - Booking status updates

5. **Integration Services (25 files)**
   - Google Calendar API
   - Google Sheets API
   - LINE Notify API
   - Facebook OAuth
   - LINE Login

6. **Utilities (25 files)**
   - Logging system
   - Caching mechanism
   - Configuration management
   - Scheduling tasks

### Technical Stack
- Backend: Node.js with Express
- Frontend: HTML, CSS, JavaScript
- Database: Firebase Firestore
- External Services: Google APIs, LINE APIs, Facebook OAuth
- Caching: Node-Cache
- Authentication: JWT

### Project Statistics
- Total Files: 34
- Total Lines of Code: 4,473
- File Distribution:
  - JavaScript: 32 files (3,202 lines)
  - HTML: 1 file (531 lines)
  - CSS: 1 file (740 lines)

## Areas for Refactoring

### 1. Authentication System
- Current: Multiple authentication strategies with duplicated code
- Opportunity: Implement unified authentication service

### 2. Service Integration
- Current: Direct service calls scattered across components
- Opportunity: Create unified integration layer

### 3. Data Management
- Current: Mixed use of Firestore and Google Sheets
- Opportunity: Standardize data storage approach

### 4. Error Handling
- Current: Inconsistent error handling patterns
- Opportunity: Implement centralized error handling

### 5. Configuration Management
- Current: Environment variables spread across files
- Opportunity: Centralize configuration management

### 6. Caching Strategy
- Current: Basic in-memory caching
- Opportunity: Implement more robust caching solution

### 7. API Structure
- Current: Basic REST endpoints
- Opportunity: Implement proper API versioning and documentation

## Key Dependencies
The system relies on several external services and libraries:
- Google APIs (Calendar, Sheets)
- LINE APIs (Login, Notify)
- Facebook OAuth
- Firebase/Firestore
- Express.js framework
- Node-Cache
- Winston (logging)
- Nodemailer

## Suggested Refactoring Priorities

1. **High Priority**
   - Authentication system consolidation
   - Service integration layer
   - Error handling standardization

2. **Medium Priority**
   - Data layer abstraction
   - Caching improvement
   - Configuration management

3. **Lower Priority**
   - API documentation
   - Code style standardization
   - Test coverage

## Migration Considerations

### Technical Debt
- Inconsistent error handling
- Mixed data storage approaches
- Duplicate authentication logic
- Limited test coverage

### Security Considerations
- Token management
- API key storage
- Data encryption
- Rate limiting

### Performance Optimization
- Caching strategy
- Database queries
- API response times
- Resource utilization

## Next Steps

1. **Phase 1: Planning**
   - Create detailed refactoring plan
   - Define new architecture
   - Set up development environment

2. **Phase 2: Core Refactoring**
   - Authentication system
   - Service integration
   - Data layer

3. **Phase 3: Enhancement**
   - Caching
   - Error handling
   - Testing

4. **Phase 4: Documentation**
   - API documentation
   - System architecture
   - Deployment guides

## Additional Notes
- Maintain backward compatibility during refactoring
- Consider implementing feature flags
- Plan for zero-downtime deployment
- Establish monitoring and logging standards

## CRM Customer Mapping

The system now includes a feature to map booking customers to customers in the CRM system. This allows for better customer tracking and data integration across systems.

### Features

1. **Automatic Customer Matching**
   - Maps booking system customers to CRM customers
   - Uses phone numbers, emails, and names for matching
   - Configurable confidence threshold for automatic matches

2. **Manual Mapping Management**
   - Admin API to manually set or update mappings
   - API to retrieve CRM data for a specific profile

3. **Periodic Synchronization**
   - API endpoint for triggering syncs
   - Support for incremental updates (syncing only new/updated customers)
   - Statistics on match rates and confidence levels

### Implementation

The CRM customer mapping is implemented with the following components:

1. **Database Table**
   - `crm_customer_mapping` table in Supabase
   - Stores mapping between profiles and CRM customers
   - Includes match confidence and method (auto/manual)

2. **Utility Functions**
   - Phone number normalization
   - Match confidence calculation
   - CRM data retrieval

3. **API Endpoints**
   - `/api/admin/crm-sync` - Trigger and monitor syncs
   - `/api/admin/crm-mapping` - Manage mappings

4. **UI Component**
   - `CrmCustomerInfo` component to display linked CRM data

### Usage

#### Initial Setup

1. Ensure the CRM Supabase connection details are set in `.env.local`:
   ```
   CRM_SUPABASE_URL=your-crm-supabase-url
   CRM_SUPABASE_SERVICE_KEY=your-crm-supabase-service-key
   ```

2. Run the database migration to create the required table

3. Update the `fetchCrmCustomers` function in `utils/supabase/crm.ts` to match your CRM database structure

4. Trigger initial sync by running:
   ```
   npx ts-node scripts/trigger-crm-sync.ts
   ```

#### Ongoing Management

1. Periodically trigger syncs via the API:
   ```
   POST /api/admin/crm-sync
   ```

2. Check mapping statistics:
   ```
   GET /api/admin/crm-sync
   ```

3. Manually set mappings:
   ```
   POST /api/admin/crm-mapping
   Body: { "profileId": "...", "crmCustomerId": "...", "isMatched": true }
   ```

4. Display CRM data in your components:
   ```jsx
   <CrmCustomerInfo profileId={user.id} />
   ```

# Customer Mapping and Package System

## Overview

This system integrates our booking website with our CRM system to provide:

1. **Customer Mapping**: Matches website users with CRM customer profiles
2. **Package Access**: Allows customers to use their packages for bookings
3. **Automatic Checking**: Checks for mappings and packages when users login or make bookings

## Key Components

### Customer Mapping

The customer mapping system tries to match website profiles with CRM customers by:
- Comparing email addresses
- Comparing phone numbers
- Comparing names

It uses a configurable confidence threshold (currently 0.75) to determine if a match is automatic or requires manual approval.

### Package Integration

When a customer has packages in our CRM system:
- These packages are synced to our booking database
- The packages are linked using a stable hash ID
- Users can see and use their packages during booking

### How It Works

1. **On User Login**:
   - The system calls `checkCustomerProfileOnLogin(profileId)` 
   - This checks for an existing mapping or tries to create one
   - It also fetches any packages associated with the customer

2. **During Booking**:
   - The same function ensures the user's profile is checked
   - Any available packages are offered during the booking process
   - The selected package is recorded with the booking

## API Endpoints

- `GET /api/user/profile-check` - Checks user's profile for CRM mapping and packages
- `GET /api/user/packages` - Returns available packages for the current user
- `POST /api/crm/match-profile` - Attempts to match a profile with CRM customer

## Usage in Code

To check a user's profile and get their packages:

```typescript
import { checkCustomerProfileOnLogin } from '@/utils/customer-matching-service';

// Get both mapping and packages in one call
const { mapping, packages } = await checkCustomerProfileOnLogin(profileId);

// Check if user is mapped to a CRM customer
if (mapping?.matched) {
  // User has a CRM mapping
  console.log(`Mapped to CRM customer: ${mapping.crmCustomerId}`);
}

// Check if user has packages
if (packages.length > 0) {
  // User has packages
  console.log(`User has ${packages.length} packages`);
}
```

## Google Review Requests

The system automatically schedules review requests to be sent to new customers 30 minutes after their session ends. This helps encourage customers to leave Google reviews while their experience is still fresh.

### How it works

1. When a new customer (without a stable hash ID) makes a booking, a review request is automatically scheduled
2. 30 minutes after their session ends, the system sends either:
   - An email with a discount voucher and a link to leave a Google review
   - A LINE message with the same content, depending on the customer's login provider
3. If a booking is canceled or deleted, the review request is automatically canceled

### Configuration

#### Using Supabase Cron (Recommended)

The system uses [Supabase Cron](https://supabase.com/blog/supabase-cron), which is a Postgres extension that allows scheduling jobs directly within your Supabase database:

1. Enable the `pg_cron` extension in your Supabase project:
   ```sql
   create extension if not exists pg_cron;
   
   -- Grant usage to postgres user
   grant usage on schema cron to postgres;
   ```

2. Create a cron job to trigger the webhook:
   ```sql
   -- Check every 5 minutes for review requests that need to be sent
   select cron.schedule(
     'check-review-requests',
     '*/5 * * * *',
     $$
     select
       net.http_post(
         url := 'https://your-app-url/api/notifications/process-review-requests',
         headers := '{"Content-Type": "application/json", "Authorization": "Bearer ' || current_setting('app.cron_api_key') || '"}',
         body := '{}'
       ) as request_sent
     $$
   );
   ```

3. Store your API key securely using Postgres settings:
   ```sql
   alter database postgres set app.cron_api_key = 'your-secure-api-key';
   ```

This approach keeps everything within Supabase and doesn't require external services.

#### Required Environment Variables

```
# For webhook authentication
CRON_API_KEY=your_secure_api_key

# For email delivery
EMAIL_HOST=smtp.your-provider.com
EMAIL_PORT=587
EMAIL_USER=your-username
EMAIL_PASS=your-password
EMAIL_FROM=bookings@your-domain.com

# For LINE messaging
LINE_CHANNEL_ACCESS_TOKEN=your-line-channel-token

# Voucher image URL
REVIEW_VOUCHER_IMAGE_URL=https://your-domain.com/images/discount-voucher.jpg
```

### Testing

Use the provided test script to manually send a review request:

```bash
# Send a test email review request
node scripts/send-test-review-request.js --provider=email --to=user@example.com --name="John Doe"

# Send a test LINE review request
node scripts/send-test-review-request.js --provider=line --to=Uf4177a1781df7fd215e6d2749fd00296 --name="Jane Smith"
```

## Performance Optimizations

### VIP Navigation Performance
Recent optimizations have been implemented to improve the "My Account" navigation speed:

#### Implemented Optimizations:
1. **VIP Profile Caching** - 3-minute cache to prevent redundant API calls
2. **Database Query Optimization** - Single JOIN query instead of multiple round-trips
3. **Route Prefetching** - VIP routes prefetched on hover for instant navigation
4. **Cache Warming** - VIP profile fetched proactively on page load
5. **Performance Monitoring** - API timing logs to track slow requests

#### Performance Monitoring:
- Slow API calls (>1000ms) are logged as warnings
- Development mode shows all API timing for debugging
- Check browser console for `[VIP API Performance]` logs

#### Cache Configuration:
- VIP Profile Cache: 3 minutes
- VIP Status Cache: 5 minutes
- Automatic cache invalidation on user change

#### For Developers:
- Use `refetchVipProfile()` to force cache refresh
- Monitor console for performance warnings
- Consider database indexing if API calls remain slow 