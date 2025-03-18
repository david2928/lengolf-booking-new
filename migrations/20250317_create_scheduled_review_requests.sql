-- Migration: Create scheduled_review_requests table with all constraints
-- This is a comprehensive migration that creates the table if it doesn't exist

-- Only create the table if it doesn't exist
CREATE TABLE IF NOT EXISTS scheduled_review_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    booking_id TEXT NOT NULL,
    user_id UUID NOT NULL,
    scheduled_time TIMESTAMPTZ NOT NULL,
    provider TEXT NOT NULL CHECK (provider IN ('email', 'line')),
    contact_info TEXT NOT NULL,
    sent BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Add constraints
    CONSTRAINT scheduled_review_requests_user_provider_unique UNIQUE (user_id, provider),
    CONSTRAINT scheduled_review_requests_booking_id_fkey FOREIGN KEY (booking_id) 
        REFERENCES bookings(id) ON DELETE CASCADE
);

-- Add indexes for better performance
CREATE INDEX IF NOT EXISTS idx_scheduled_review_requests_booking_id 
    ON scheduled_review_requests(booking_id);

CREATE INDEX IF NOT EXISTS idx_scheduled_review_requests_user_id 
    ON scheduled_review_requests(user_id);

CREATE INDEX IF NOT EXISTS idx_scheduled_review_requests_sent_scheduled 
    ON scheduled_review_requests(sent, scheduled_time);

-- Success message
DO $$
BEGIN
    RAISE NOTICE 'Migration completed successfully: Created scheduled_review_requests table with constraints';
END $$; 