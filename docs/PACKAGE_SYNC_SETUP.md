# Package Sync System Documentation

This document outlines the comprehensive package sync system that keeps CRM package data synchronized with the booking database.

## Overview

The package sync system operates on two levels:

1. **Individual Sync**: Triggered when users log in or during booking creation
2. **Bulk Sync**: Scheduled daily via Supabase cron job to sync all profiles

## System Architecture

### Individual Sync (Real-time)

**Trigger Points:**
- User login via NextAuth callback (`app/api/auth/options.ts`)
- Booking creation (`app/api/bookings/create/route.ts`)
- Manual VIP package refresh (`app/api/vip/packages/route.ts`)

**Flow:**
1. `getOrCreateCrmMapping()` is called with user profile ID
2. If CRM matching succeeds, `syncPackagesForProfile()` is automatically triggered
3. Individual user's packages are synced from CRM to local database

### Bulk Sync (Scheduled)

**Trigger Points:**
- Daily Supabase cron job
- Manual API call to `/api/crm/sync-packages`

**Flow:**
1. `bulkSyncPackagesForAllProfiles()` fetches all profiles with CRM mappings
2. Processes profiles in batches (default: 20 per batch)
3. For each profile, syncs packages from CRM to local database
4. Returns comprehensive statistics

## File Structure

```
utils/supabase/
├── crm-packages.ts              # Core package sync functions
├── crm.ts                       # CRM client configuration
└── customer-matching.ts         # CRM customer matching logic

app/api/
├── auth/options.ts              # NextAuth with individual sync trigger
├── crm/sync-packages/route.ts   # Bulk sync API endpoint
└── vip/packages/route.ts        # VIP package endpoints

scripts/
├── sync-packages.js             # Legacy script (can be deprecated)
└── test-bulk-sync.js            # Test script for bulk sync
```

## API Endpoints

### `/api/crm/sync-packages` (Bulk Sync)

**Authentication:** Bearer token required
**Methods:** POST, GET

**POST Request:**
```bash
curl -X POST https://booking.len.golf/api/crm/sync-packages \
  -H "Authorization: Bearer YOUR_CRON_SECRET" \
  -H "Content-Type: application/json" \
  -d '{
    "batchSize": 20,
    "maxProfiles": 100,
    "onlyNewProfiles": false
  }'
```

**Response:**
```json
{
  "success": true,
  "result": {
    "totalProfiles": 50,
    "successfulProfiles": 48,
    "failedProfiles": 2,
    "totalPackages": 125,
    "errors": ["Profile xyz: CRM error", "..."],
    "duration": "45s"
  },
  "timestamp": "2024-01-15T10:30:00.000Z"
}
```

### `/api/vip/packages` (Individual Sync)

**Authentication:** NextAuth session required
**Methods:** GET, POST

**POST Request (Force Sync):**
```bash
curl -X POST https://booking.len.golf/api/vip/packages \
  -H "Authorization: Bearer USER_SESSION_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"profileId": "user-uuid"}'
```

## Supabase Cron Job Setup

### 1. Create the Cron Job

Execute this SQL in your Supabase SQL editor:

```sql
-- Create daily package sync cron job
select cron.schedule(
  'daily-package-sync',           -- Job name
  '0 2 * * *',                   -- Schedule: 2 AM daily (UTC)
  $$
  select net.http_post(
    url := 'https://booking.len.golf/api/crm/sync-packages',
    headers := jsonb_build_object(
      'Authorization', 'Bearer 2f93c28600516c88c346b197246515c6ce9b82aade54311a75031578bc75da42',
      'Content-Type', 'application/json'
    ),
    body := jsonb_build_object(
      'batchSize', 20,
      'maxProfiles', null,
      'onlyNewProfiles', false
    ),
    timeout_milliseconds := 300000  -- 5 minute timeout
  );
  $$
);
```

### 2. Verify Cron Job

```sql
-- List all cron jobs
SELECT * FROM cron.job;

-- Check cron job execution history
SELECT * FROM cron.job_run_details 
WHERE jobname = 'daily-package-sync' 
ORDER BY start_time DESC 
LIMIT 10;
```

### 3. Alternative Schedules

```sql
-- Twice daily (6 AM and 6 PM UTC)
'0 6,18 * * *'

-- Every 6 hours
'0 */6 * * *'

-- Weekly on Sunday at 3 AM UTC
'0 3 * * 0'

-- Hourly (for high-frequency updates)
'0 * * * *'
```

### 4. Update Cron Job

```sql
-- Update schedule or configuration
SELECT cron.alter_job(
  job_id := (SELECT jobid FROM cron.job WHERE jobname = 'daily-package-sync'),
  schedule := '0 3 * * *',  -- New schedule: 3 AM daily
  command := $$
  select net.http_post(
    url := 'https://booking.len.golf/api/crm/sync-packages',
    headers := jsonb_build_object(
      'Authorization', 'Bearer 2f93c28600516c88c346b197246515c6ce9b82aade54311a75031578bc75da42',
      'Content-Type', 'application/json'
    ),
    body := jsonb_build_object(
      'batchSize', 30,          -- Increased batch size
      'onlyNewProfiles', false
    ),
    timeout_milliseconds := 600000  -- 10 minute timeout
  );
  $$
);
```

### 5. Delete Cron Job

```sql
-- Remove the cron job
SELECT cron.unschedule('daily-package-sync');
```

## Environment Variables

Ensure these environment variables are set:

```env
# Main Supabase (Booking Database)
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# CRM Supabase
NEXT_PUBLIC_CRM_SUPABASE_URL=https://crm-project.supabase.co
NEXT_PUBLIC_CRM_SUPABASE_KEY=crm-anon-key

# Cron job authentication
CRON_SECRET=2f93c28600516c88c346b197246515c6ce9b82aade54311a75031578bc75da42
```

## Testing

### Manual API Test

```bash
# Test the bulk sync endpoint
curl -X POST https://booking.len.golf/api/crm/sync-packages \
  -H "Authorization: Bearer 2f93c28600516c88c346b197246515c6ce9b82aade54311a75031578bc75da42" \
  -H "Content-Type: application/json" \
  -d '{"batchSize": 5, "maxProfiles": 10}'
```

### Test Script

```bash
# Run the test script
node scripts/test-bulk-sync.js
```

### Individual Sync Test

1. Log in to the application
2. Check browser console for CRM mapping logs
3. Visit `/vip/packages` to see synced packages
4. Use POST to `/api/vip/packages` to force a fresh sync

## Monitoring and Logs

### Supabase Logs

Monitor cron job execution:

```sql
-- Recent cron job runs
SELECT 
  jobname,
  start_time,
  end_time,
  status,
  return_message
FROM cron.job_run_details 
WHERE jobname = 'daily-package-sync'
ORDER BY start_time DESC 
LIMIT 20;
```

### Application Logs

- Individual sync logs appear in NextAuth callbacks
- Bulk sync logs appear in API route logs
- Package sync details logged with `[bulkSyncPackages]` prefix

### Error Handling

- Individual sync errors don't prevent user login
- Bulk sync errors are collected and returned in API response
- Failed profiles are retried in subsequent sync runs

## Migration from Legacy Script

The new system replaces `scripts/sync-packages.js`. To migrate:

1. ✅ Individual sync: Already implemented via auth callback
2. ✅ Bulk sync: New `bulkSyncPackagesForAllProfiles()` function
3. ✅ API endpoint: `/api/crm/sync-packages`
4. ✅ Cron job: Supabase scheduled function
5. 🔄 Legacy script: Can be deprecated after testing

## Performance Considerations

- **Batch Size**: Default 20 profiles per batch, adjustable
- **Timeout**: 5-minute timeout for cron jobs
- **Rate Limiting**: 500ms delay between batches
- **Error Recovery**: Individual profile failures don't stop entire sync
- **Monitoring**: Comprehensive statistics and error reporting

## Security

- **Authentication**: Bearer token required for bulk sync API
- **Service Role**: Uses Supabase service role for database operations
- **Timeouts**: Prevents long-running operations from blocking
- **Error Isolation**: Profile-level error handling prevents cascading failures 