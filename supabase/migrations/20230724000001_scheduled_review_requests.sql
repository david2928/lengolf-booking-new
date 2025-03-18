-- Create scheduled review requests table
CREATE TABLE IF NOT EXISTS scheduled_review_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id TEXT REFERENCES bookings(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id),
  scheduled_time TIMESTAMPTZ NOT NULL,
  provider VARCHAR(10) NOT NULL, -- 'line' or 'email'
  contact_info TEXT NOT NULL, -- email or LINE user ID
  sent BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add RLS policies for the new table
ALTER TABLE scheduled_review_requests ENABLE ROW LEVEL SECURITY;

-- Service role can do everything
CREATE POLICY "Service role can do everything on scheduled_review_requests"
  ON scheduled_review_requests
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Users can view their own review requests
CREATE POLICY "Users can view their own review requests"
  ON scheduled_review_requests
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- Add index for efficient queries
CREATE INDEX idx_scheduled_review_requests_scheduled_time ON scheduled_review_requests(scheduled_time, sent);
CREATE INDEX idx_scheduled_review_requests_booking_id ON scheduled_review_requests(booking_id); 