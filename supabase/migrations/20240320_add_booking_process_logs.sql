-- Create booking process logs table for detailed performance tracking
CREATE TABLE IF NOT EXISTS booking_process_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id TEXT NOT NULL,
  user_id UUID NOT NULL,
  step TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('success', 'error', 'info')),
  duration_ms INTEGER NOT NULL,
  total_duration_ms INTEGER NOT NULL,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
  
  -- Add foreign key to bookings
  CONSTRAINT fk_booking FOREIGN KEY (booking_id) REFERENCES bookings(id) ON DELETE CASCADE,
  
  -- Add foreign key to profiles
  CONSTRAINT fk_user FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE
);

-- Add index on booking_id for faster lookups
CREATE INDEX IF NOT EXISTS idx_booking_process_logs_booking_id ON booking_process_logs(booking_id);

-- Add index on user_id for faster lookups
CREATE INDEX IF NOT EXISTS idx_booking_process_logs_user_id ON booking_process_logs(user_id);

-- Add index on step for analytics queries
CREATE INDEX IF NOT EXISTS idx_booking_process_logs_step ON booking_process_logs(step);

-- Add index on status for filtering by success/error
CREATE INDEX IF NOT EXISTS idx_booking_process_logs_status ON booking_process_logs(status);

-- Add RLS policies (optional, add if your app uses RLS)
ALTER TABLE booking_process_logs ENABLE ROW LEVEL SECURITY;

-- Allow admins to view all logs
CREATE POLICY admin_all ON booking_process_logs
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
    )
  );

-- Allow users to view their own logs
CREATE POLICY user_select ON booking_process_logs
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

COMMENT ON TABLE booking_process_logs IS 'Detailed logs for booking process performance tracking'; 