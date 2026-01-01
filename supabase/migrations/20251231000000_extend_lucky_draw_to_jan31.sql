-- Extend Lucky Draw Campaign to January 31, 2026
-- This migration updates the campaign dates from Dec 31, 2025 to Jan 31, 2026

-- ============================================================================
-- Update trigger function to extend campaign period to Jan 31, 2026
-- ============================================================================
CREATE OR REPLACE FUNCTION award_lucky_draw_after_transaction()
RETURNS TRIGGER AS $$
DECLARE
  campaign_start_date DATE := '2025-12-07';
  campaign_end_date DATE := '2026-01-31';
BEGIN
  -- Award 1 draw per transaction >= 500 THB with customer_id
  -- Only for transactions within campaign period (Dec 7, 2025 - Jan 31, 2026)
  IF NEW.total_amount >= 500
     AND NEW.customer_id IS NOT NULL
     AND NEW.transaction_date::DATE >= campaign_start_date
     AND NEW.transaction_date::DATE <= campaign_end_date THEN

    INSERT INTO customer_lucky_draws (customer_id, draws_earned)
    VALUES (NEW.customer_id, 1)
    ON CONFLICT (customer_id) DO UPDATE
    SET draws_earned = customer_lucky_draws.draws_earned + 1,
        last_updated = NOW(),
        updated_at = NOW();

    RAISE NOTICE 'Awarded 1 lucky draw to customer % (transaction % = % THB on %)',
      NEW.customer_id, NEW.transaction_id, NEW.total_amount, NEW.transaction_date;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION award_lucky_draw_after_transaction IS 'Automatically awards 1 draw when transaction >= 500 THB during campaign period (Dec 7, 2025 - Jan 31, 2026)';
