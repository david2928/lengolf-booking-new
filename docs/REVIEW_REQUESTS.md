# Review Request System

This document explains how the automated review request system works in the LENGOLF application.

## Overview

The system automatically schedules review requests for new customers after they complete a booking. These requests are sent via email or LINE messaging depending on the user's profile settings.

## Database Schema

Review requests are stored in the `scheduled_review_requests` table with the following structure:

```sql
CREATE TABLE scheduled_review_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    booking_id TEXT NOT NULL,
    user_id UUID NOT NULL,
    scheduled_time TIMESTAMPTZ NOT NULL,
    provider TEXT NOT NULL CHECK (provider IN ('email', 'line')),
    contact_info TEXT NOT NULL,
    sent BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Constraints
    CONSTRAINT scheduled_review_requests_user_provider_unique UNIQUE (user_id, provider),
    CONSTRAINT scheduled_review_requests_booking_id_fkey FOREIGN KEY (booking_id) 
        REFERENCES bookings(id) ON DELETE CASCADE
);
```

Key constraints:
- Each user can only have one pending review request per provider (email/LINE)
- If a booking is deleted, its associated review requests are automatically deleted

## How It Works

1. **Scheduling**:
   - When a new customer makes a booking, a review request is automatically scheduled
   - For LINE users, the provider is set to 'line' and the contact_info is their LINE provider_id 
   - For other users, the provider is set to 'email' and the contact_info is their email address
   - Default delay is 30 minutes after the booking duration ends

2. **Processing**:
   - A cron job runs every 5 minutes to check for pending review requests
   - It processes requests scheduled within a 10-minute window (current time to 10 minutes ago)
   - When a request is processed, a notification is sent via the appropriate channel
   - After successful sending, the request is marked as 'sent'

3. **Notifications**:
   - Email notifications are sent via the configured SMTP server
   - LINE notifications are sent via the LINE Messaging API
   - Both include a thank you message and invitation to leave a Google review
   - A special offer voucher is included as an incentive

## Testing

To test the system, use the provided scripts:

```bash
# Schedule a test review request via email
node scripts/schedule-test-review.js --provider email --to test@example.com --name "Test User"

# Schedule a test review request via LINE 
node scripts/schedule-test-review.js --provider line --to U1234567890abcdef --name "Test User"

# Process pending review requests
node scripts/test-process-reviews.js
```

## Timezone Handling

- All scheduled times are stored in UTC in the database
- Business logic uses Bangkok timezone (Asia/Bangkok)
- When processing requests, times are converted between UTC and local timezone as needed

## Troubleshooting

If review requests aren't being sent:

1. Check if the cron job is running properly
2. Verify that environment variables for email and LINE are properly set
3. Check the server logs for error messages
4. Ensure the scheduled_time is in UTC format
5. Use the SQL script in `migrations/mark-requests-as-sent.sql` to manually mark requests as sent 