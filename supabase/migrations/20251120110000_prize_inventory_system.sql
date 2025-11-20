-- Prize Inventory System for Lucky Draw Campaign
-- Implements quantity-based weighted probability and inventory tracking

-- ============================================================================
-- 1. Create prize_inventory table
-- ============================================================================
CREATE TABLE IF NOT EXISTS prize_inventory (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  prize_name TEXT NOT NULL UNIQUE,
  prize_description TEXT NOT NULL,
  initial_quantity INTEGER NOT NULL CHECK (initial_quantity >= 0),
  remaining_quantity INTEGER NOT NULL CHECK (remaining_quantity >= 0),
  retail_value NUMERIC,
  cost_value NUMERIC,
  prize_tier TEXT, -- '1st', '2nd', '3rd', '4th', '5th', 'others'
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT remaining_lte_initial CHECK (remaining_quantity <= initial_quantity)
);

-- Index for active prizes with inventory
CREATE INDEX idx_prize_inventory_active ON prize_inventory(is_active, remaining_quantity) WHERE is_active = true AND remaining_quantity > 0;

COMMENT ON TABLE prize_inventory IS 'Prize inventory for lucky draw campaign with quantity tracking';
COMMENT ON COLUMN prize_inventory.remaining_quantity IS 'Current available quantity - decrements when prize is won';
COMMENT ON COLUMN prize_inventory.is_active IS 'Set to false to temporarily disable a prize from being won';

-- ============================================================================
-- 2. Insert initial prize inventory (December 2025 Campaign)
-- ============================================================================
INSERT INTO prize_inventory (prize_name, prize_description, initial_quantity, remaining_quantity, retail_value, cost_value, prize_tier) VALUES
-- High-value prizes (Low quantity)
('Golf Bag + Logo', 'Premium golf bag with LENGOLF logo', 1, 1, 6500, 3850, '1st'),
('LEN Golf Bronze Package', 'Bronze membership package at LENGOLF', 1, 1, 3000, 0, '2nd'),
('Premium Tumbler + Logo', 'High-quality tumbler with LENGOLF branding', 5, 5, 2000, 1250, '3rd'),
('2-Hour Bay + Drink Voucher', '2-hour bay booking with complimentary drink', 5, 5, 10000, 250, '4th'),
('1-Hour Bay + Drink Voucher', '1-hour bay booking with complimentary drink', 5, 5, 5000, 250, '5th'),

-- Common prizes (High quantity)
('Golf Hat', 'LENGOLF branded golf hat', 40, 40, 400, 400, 'others'),
('Golf Marker', 'Premium golf ball marker', 40, 40, 400, 400, 'others'),
('LEN Golf Gloves', 'Professional golf gloves', 15, 15, 5500, 2250, 'others'),
('Golf Balls (Logo)', 'Golf balls with LENGOLF logo (set)', 36, 36, 2100, 1100, 'others'),
('20% Discount Voucher', '20% off your next visit', 20, 20, 4000, 0, 'others'),
('Drink Voucher', 'Complimentary beverage voucher', 40, 40, 2000, 1200, 'others')
ON CONFLICT (prize_name) DO NOTHING;

-- ============================================================================
-- 3. Link lucky_draw_spins to prize_inventory
-- ============================================================================
ALTER TABLE lucky_draw_spins
  ADD COLUMN IF NOT EXISTS prize_inventory_id UUID REFERENCES prize_inventory(id);

CREATE INDEX IF NOT EXISTS idx_lucky_draw_spins_prize_inventory ON lucky_draw_spins(prize_inventory_id);

COMMENT ON COLUMN lucky_draw_spins.prize_inventory_id IS 'Links to prize_inventory for tracking which specific prize was won';

-- ============================================================================
-- 4. Function to select prize with weighted probability based on inventory
-- ============================================================================
CREATE OR REPLACE FUNCTION select_prize_weighted()
RETURNS TABLE (
  prize_id UUID,
  prize_name TEXT,
  prize_description TEXT,
  remaining_quantity INTEGER
) AS $$
DECLARE
  v_total_quantity INTEGER;
  v_random_value NUMERIC;
  v_cumulative NUMERIC := 0;
  v_prize RECORD;
BEGIN
  -- Get total available quantity across all active prizes
  SELECT SUM(remaining_quantity) INTO v_total_quantity
  FROM prize_inventory
  WHERE is_active = true AND remaining_quantity > 0;

  -- If no prizes available, return NULL
  IF v_total_quantity IS NULL OR v_total_quantity = 0 THEN
    RETURN;
  END IF;

  -- Generate random number between 0 and total_quantity
  v_random_value := random() * v_total_quantity;

  -- Select prize based on weighted probability
  FOR v_prize IN
    SELECT id, prize_name, prize_description, remaining_quantity
    FROM prize_inventory
    WHERE is_active = true AND remaining_quantity > 0
    ORDER BY id -- Consistent ordering for deterministic results
  LOOP
    v_cumulative := v_cumulative + v_prize.remaining_quantity;

    IF v_random_value < v_cumulative THEN
      RETURN QUERY SELECT
        v_prize.id,
        v_prize.prize_name,
        v_prize.prize_description,
        v_prize.remaining_quantity;
      RETURN;
    END IF;
  END LOOP;

  -- Fallback (should never reach here)
  RETURN QUERY
    SELECT id, prize_name, prize_description, remaining_quantity
    FROM prize_inventory
    WHERE is_active = true AND remaining_quantity > 0
    ORDER BY remaining_quantity DESC
    LIMIT 1;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION select_prize_weighted IS 'Selects a prize using weighted random selection based on remaining inventory. Higher quantity = higher probability.';

-- ============================================================================
-- 5. Function to decrement prize inventory
-- ============================================================================
CREATE OR REPLACE FUNCTION decrement_prize_inventory(p_prize_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
  v_updated INTEGER;
BEGIN
  UPDATE prize_inventory
  SET
    remaining_quantity = remaining_quantity - 1,
    updated_at = NOW()
  WHERE id = p_prize_id
    AND remaining_quantity > 0
  RETURNING 1 INTO v_updated;

  RETURN v_updated IS NOT NULL;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION decrement_prize_inventory IS 'Decrements prize inventory by 1. Returns true if successful, false if no inventory available.';

-- ============================================================================
-- 6. Function to check if campaign has prizes available
-- ============================================================================
CREATE OR REPLACE FUNCTION campaign_has_prizes()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS(
    SELECT 1 FROM prize_inventory
    WHERE is_active = true AND remaining_quantity > 0
  );
END;
$$ LANGUAGE plpgsql STABLE;

COMMENT ON FUNCTION campaign_has_prizes IS 'Returns true if any prizes are still available in the campaign';

-- ============================================================================
-- 7. Function to get campaign status
-- ============================================================================
CREATE OR REPLACE FUNCTION get_campaign_status()
RETURNS TABLE (
  total_prizes INTEGER,
  prizes_remaining INTEGER,
  prizes_awarded INTEGER,
  is_active BOOLEAN,
  prize_breakdown JSONB
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    SUM(initial_quantity)::INTEGER as total_prizes,
    SUM(remaining_quantity)::INTEGER as prizes_remaining,
    (SUM(initial_quantity) - SUM(remaining_quantity))::INTEGER as prizes_awarded,
    EXISTS(SELECT 1 FROM prize_inventory WHERE is_active = true AND remaining_quantity > 0) as is_active,
    jsonb_agg(
      jsonb_build_object(
        'prize_name', prize_name,
        'initial', initial_quantity,
        'remaining', remaining_quantity,
        'awarded', initial_quantity - remaining_quantity
      )
      ORDER BY prize_tier, prize_name
    ) as prize_breakdown
  FROM prize_inventory;
END;
$$ LANGUAGE plpgsql STABLE;

COMMENT ON FUNCTION get_campaign_status IS 'Returns overall campaign status including total prizes, remaining, and breakdown by prize type';

-- ============================================================================
-- 8. Admin function to manually award draws for testing (Phase 1)
-- ============================================================================
CREATE OR REPLACE FUNCTION admin_award_draws(
  p_customer_id UUID,
  p_draws_to_award INTEGER
)
RETURNS TABLE (
  customer_id UUID,
  draws_awarded INTEGER,
  total_draws INTEGER
) AS $$
BEGIN
  -- Insert or update customer draws
  INSERT INTO customer_lucky_draws (customer_id, draws_earned)
  VALUES (p_customer_id, p_draws_to_award)
  ON CONFLICT (customer_id) DO UPDATE
  SET
    draws_earned = customer_lucky_draws.draws_earned + p_draws_to_award,
    last_updated = NOW();

  -- Return result
  RETURN QUERY
  SELECT
    p_customer_id,
    p_draws_to_award,
    draws_earned
  FROM customer_lucky_draws
  WHERE customer_lucky_draws.customer_id = p_customer_id;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION admin_award_draws IS 'Admin function to manually award draws to specific customers for testing (Phase 1)';

-- ============================================================================
-- 9. Function to reset campaign (for testing)
-- ============================================================================
CREATE OR REPLACE FUNCTION admin_reset_campaign()
RETURNS VOID AS $$
BEGIN
  -- Reset all prize quantities to initial values
  UPDATE prize_inventory
  SET
    remaining_quantity = initial_quantity,
    updated_at = NOW();

  RAISE NOTICE 'Campaign inventory reset to initial quantities';
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION admin_reset_campaign IS 'Admin function to reset all prize inventory to initial quantities (for testing)';

-- ============================================================================
-- 10. Updated_at trigger for prize_inventory
-- ============================================================================
CREATE TRIGGER update_prize_inventory_updated_at
BEFORE UPDATE ON prize_inventory
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- End of migration
-- ============================================================================
