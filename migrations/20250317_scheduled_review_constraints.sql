-- Migration: Add constraints to scheduled_review_requests table
-- 1. Add unique constraint on user_id + provider combination
-- 2. Add foreign key constraint with cascade delete for booking_id

-- Step 1: Make sure no duplicate user+provider combinations exist
-- This query will show any duplicates that need to be handled before adding the constraint
-- SELECT user_id, provider, COUNT(*) FROM scheduled_review_requests GROUP BY user_id, provider HAVING COUNT(*) > 1;

-- Remove duplicates by keeping only the most recent request for each user+provider combo
DO $$
DECLARE
    duplicate_record RECORD;
BEGIN
    FOR duplicate_record IN (
        SELECT user_id, provider
        FROM scheduled_review_requests
        GROUP BY user_id, provider
        HAVING COUNT(*) > 1
    ) LOOP
        -- Delete all but the most recent request for this user+provider
        DELETE FROM scheduled_review_requests
        WHERE id IN (
            SELECT id FROM scheduled_review_requests
            WHERE user_id = duplicate_record.user_id
            AND provider = duplicate_record.provider
            AND id NOT IN (
                SELECT id FROM scheduled_review_requests
                WHERE user_id = duplicate_record.user_id
                AND provider = duplicate_record.provider
                ORDER BY created_at DESC
                LIMIT 1
            )
        );
        
        RAISE NOTICE 'Removed duplicate review requests for user_id: %, provider: %', 
            duplicate_record.user_id, duplicate_record.provider;
    END LOOP;
END $$;

-- Step 2: Add unique constraint on user_id + provider combination
-- This ensures each user can only have one pending review request per provider (email or LINE)
ALTER TABLE scheduled_review_requests 
ADD CONSTRAINT scheduled_review_requests_user_provider_unique 
UNIQUE (user_id, provider);

-- Step 3: Add foreign key constraint with cascade delete for booking_id
ALTER TABLE scheduled_review_requests
DROP CONSTRAINT IF EXISTS scheduled_review_requests_booking_id_fkey;

ALTER TABLE scheduled_review_requests
ADD CONSTRAINT scheduled_review_requests_booking_id_fkey
FOREIGN KEY (booking_id)
REFERENCES bookings(id)
ON DELETE CASCADE;

-- Success message
DO $$
BEGIN
    RAISE NOTICE 'Migration completed successfully: Added constraints to scheduled_review_requests table';
END $$; 