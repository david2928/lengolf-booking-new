-- Lucky Draw V2: Transaction-Based System
-- This migration transforms the lucky draw from one-time campaign to transaction-based rewards
-- Customers earn 1 draw per transaction >500 THB and can spin multiple times

-- ============================================================================
-- 1. Create customer_lucky_draws table
-- ============================================================================
CREATE TABLE IF NOT EXISTS customer_lucky_draws (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  draws_earned INTEGER DEFAULT 0 NOT NULL CHECK (draws_earned >= 0),
  draws_used INTEGER DEFAULT 0 NOT NULL CHECK (draws_used >= 0),
  draws_available INTEGER GENERATED ALWAYS AS (draws_earned - draws_used) STORED,
  last_updated TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(customer_id)
);

-- Index for quick lookups by customer
CREATE INDEX idx_customer_lucky_draws_customer_id ON customer_lucky_draws(customer_id);

-- Comment
COMMENT ON TABLE customer_lucky_draws IS 'Tracks lucky draw balance for customers based on transactions >500 THB';
COMMENT ON COLUMN customer_lucky_draws.draws_earned IS 'Total draws earned from qualifying transactions';
COMMENT ON COLUMN customer_lucky_draws.draws_used IS 'Total draws used (spins completed)';
COMMENT ON COLUMN customer_lucky_draws.draws_available IS 'Computed field: draws_earned - draws_used';

-- ============================================================================
-- 2. Extend lucky_draw_spins table
-- ============================================================================

-- Add new columns
ALTER TABLE lucky_draw_spins
  ADD COLUMN IF NOT EXISTS transaction_id UUID,
  ADD COLUMN IF NOT EXISTS customer_id UUID REFERENCES public.customers(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS draw_sequence INTEGER,
  ADD COLUMN IF NOT EXISTS redeemed_by_staff_name TEXT;

-- Remove the one-spin-per-user constraint (allow multiple spins)
ALTER TABLE lucky_draw_spins
  DROP CONSTRAINT IF EXISTS one_spin_per_line_user;

-- Add new indexes
CREATE INDEX IF NOT EXISTS idx_lucky_draw_spins_customer_id ON lucky_draw_spins(customer_id);
CREATE INDEX IF NOT EXISTS idx_lucky_draw_spins_transaction_id ON lucky_draw_spins(transaction_id);

-- Update comments
COMMENT ON COLUMN lucky_draw_spins.transaction_id IS 'Reference to pos.transactions that earned this draw';
COMMENT ON COLUMN lucky_draw_spins.customer_id IS 'Direct link to public.customers for linked accounts';
COMMENT ON COLUMN lucky_draw_spins.draw_sequence IS 'Sequential number of this draw for the customer (1st, 2nd, 3rd, etc.)';
COMMENT ON COLUMN lucky_draw_spins.redeemed_by_staff_name IS 'Name of staff member who confirmed redemption (no auth required)';

-- ============================================================================
-- 3. Create trigger function to auto-award draws from transactions
-- ============================================================================
CREATE OR REPLACE FUNCTION award_lucky_draw_after_transaction()
RETURNS TRIGGER AS $$
BEGIN
  -- Only award if transaction > 500 THB (strictly greater) and has customer_id
  IF NEW.total_amount > 500 AND NEW.customer_id IS NOT NULL THEN
    -- Award 1 draw directly (customer_id is already UUID)
    INSERT INTO customer_lucky_draws (customer_id, draws_earned)
    VALUES (NEW.customer_id, 1)
    ON CONFLICT (customer_id) DO UPDATE
    SET
      draws_earned = customer_lucky_draws.draws_earned + 1,
      last_updated = NOW(),
      updated_at = NOW();

    -- Log for debugging (optional)
    RAISE NOTICE 'Awarded 1 lucky draw to customer % (transaction % = % THB)',
      NEW.customer_id, NEW.transaction_id, NEW.total_amount;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION award_lucky_draw_after_transaction IS 'Automatically awards 1 draw when transaction > 500 THB. pos.transactions.customer_id is UUID referencing public.customers(id)';

-- ============================================================================
-- 4. Create trigger on pos.transactions
-- ============================================================================
-- Note: This assumes pos.transactions exists. If running on booking system only,
-- this trigger will need to be created separately on the POS database.

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'pos' AND table_name = 'transactions') THEN
    -- Drop existing trigger if it exists
    DROP TRIGGER IF EXISTS trigger_award_lucky_draw ON pos.transactions;

    -- Create new trigger
    CREATE TRIGGER trigger_award_lucky_draw
    AFTER INSERT ON pos.transactions
    FOR EACH ROW EXECUTE FUNCTION award_lucky_draw_after_transaction();

    RAISE NOTICE 'Created trigger on pos.transactions';
  ELSE
    RAISE NOTICE 'pos.transactions table not found - trigger not created. Create manually on POS database.';
  END IF;
END $$;

-- ============================================================================
-- 5. Create helper function for retroactive draw calculation
-- ============================================================================
CREATE OR REPLACE FUNCTION calculate_retroactive_draws(
  p_customer_id UUID DEFAULT NULL,
  p_from_date TIMESTAMPTZ DEFAULT NULL
)
RETURNS TABLE (
  customer_id UUID,
  transactions_count INTEGER,
  draws_awarded INTEGER
) AS $$
DECLARE
  v_transaction RECORD;
BEGIN
  -- If specific customer requested
  IF p_customer_id IS NOT NULL THEN
    -- Count qualifying transactions for this customer
    SELECT COUNT(*)::INTEGER INTO v_transaction.txn_count
    FROM pos.transactions pt
    WHERE pt.total_amount > 500
      AND pt.customer_id = p_customer_id
      AND (p_from_date IS NULL OR pt.transaction_date >= p_from_date);

    -- Award draws if any qualifying transactions found
    IF v_transaction.txn_count > 0 THEN
      INSERT INTO customer_lucky_draws (customer_id, draws_earned)
      VALUES (p_customer_id, v_transaction.txn_count)
      ON CONFLICT (customer_id) DO UPDATE
      SET draws_earned = customer_lucky_draws.draws_earned + EXCLUDED.draws_earned,
          last_updated = NOW();
    END IF;

    RETURN QUERY SELECT p_customer_id, v_transaction.txn_count, v_transaction.txn_count;
  ELSE
    -- Process all customers with qualifying transactions
    FOR v_transaction IN
      SELECT
        pt.customer_id,
        COUNT(*)::INTEGER as txn_count
      FROM pos.transactions pt
      WHERE pt.total_amount > 500
        AND pt.customer_id IS NOT NULL
        AND (p_from_date IS NULL OR pt.transaction_date >= p_from_date)
      GROUP BY pt.customer_id
    LOOP
      -- Award draws for each customer
      INSERT INTO customer_lucky_draws (customer_id, draws_earned)
      VALUES (v_transaction.customer_id, v_transaction.txn_count)
      ON CONFLICT (customer_id) DO UPDATE
      SET draws_earned = customer_lucky_draws.draws_earned + EXCLUDED.draws_earned,
          last_updated = NOW();

      RETURN QUERY SELECT v_transaction.customer_id, v_transaction.txn_count, v_transaction.txn_count;
    END LOOP;
  END IF;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION calculate_retroactive_draws IS 'One-time calculation to award draws from past transactions. Admin use only. customer_id is UUID from public.customers.';

-- ============================================================================
-- 6. Create updated_at trigger for customer_lucky_draws
-- ============================================================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_customer_lucky_draws_updated_at
BEFORE UPDATE ON customer_lucky_draws
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- End of migration
-- ============================================================================
