-- Create lucky_draw_spins table for tracking user spins
CREATE TABLE IF NOT EXISTS lucky_draw_spins (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  line_user_id TEXT NOT NULL,
  phone_number TEXT NOT NULL,
  display_name TEXT,
  prize_name TEXT NOT NULL,
  prize_description TEXT,
  spin_timestamp TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  is_redeemed BOOLEAN DEFAULT false,
  redemption_code TEXT UNIQUE,
  redeemed_at TIMESTAMPTZ,
  CONSTRAINT one_spin_per_line_user UNIQUE(line_user_id)
);

-- Create indexes for efficient lookups
CREATE INDEX idx_lucky_draw_spins_line_user ON lucky_draw_spins(line_user_id);
CREATE INDEX idx_lucky_draw_spins_phone ON lucky_draw_spins(phone_number);
CREATE INDEX idx_lucky_draw_spins_profile ON lucky_draw_spins(profile_id);
CREATE INDEX idx_lucky_draw_spins_redemption_code ON lucky_draw_spins(redemption_code) WHERE redemption_code IS NOT NULL;

-- Add comment
COMMENT ON TABLE lucky_draw_spins IS 'Tracks lucky draw spins for LINE LIFF app campaign';
