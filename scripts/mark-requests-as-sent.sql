-- SQL Script to mark all pending review requests as sent
-- Run this in the Supabase SQL Editor if you need to manually mark requests as sent

-- First, display the pending requests for verification
SELECT id, booking_id, user_id, scheduled_time, provider, contact_info, sent, created_at
FROM scheduled_review_requests
WHERE sent = false
ORDER BY scheduled_time;

-- Now update all pending requests to mark them as sent
-- Uncomment this section when you're ready to execute it
/*
UPDATE scheduled_review_requests
SET sent = true
WHERE sent = false;

-- Verify the update by checking that no pending requests remain
SELECT count(*) as remaining_pending_requests
FROM scheduled_review_requests
WHERE sent = false;
*/

-- To update specific requests by ID, use:
/*
UPDATE scheduled_review_requests
SET sent = true
WHERE id IN ('18f5b8fc-8837-48f4-80bc-22520588c9c2', '81b55513-65fd-4aa6-b4d1-fdf9a71e9f72');
*/ 