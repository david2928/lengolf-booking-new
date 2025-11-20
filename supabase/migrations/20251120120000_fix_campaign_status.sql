-- Fix ambiguous column reference in get_campaign_status function
-- The issue: line 173 referenced "is_active" without table qualification
-- causing ambiguity with the return column alias

DROP FUNCTION IF EXISTS get_campaign_status();

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
    SUM(pi.initial_quantity)::INTEGER as total_prizes,
    SUM(pi.remaining_quantity)::INTEGER as prizes_remaining,
    (SUM(pi.initial_quantity) - SUM(pi.remaining_quantity))::INTEGER as prizes_awarded,
    EXISTS(
      SELECT 1 FROM prize_inventory pi2
      WHERE pi2.is_active = true AND pi2.remaining_quantity > 0
    ) as is_active,
    jsonb_agg(
      jsonb_build_object(
        'prize_name', pi.prize_name,
        'initial', pi.initial_quantity,
        'remaining', pi.remaining_quantity,
        'awarded', pi.initial_quantity - pi.remaining_quantity
      )
      ORDER BY pi.prize_tier, pi.prize_name
    ) as prize_breakdown
  FROM prize_inventory pi;
END;
$$ LANGUAGE plpgsql STABLE;

COMMENT ON FUNCTION get_campaign_status IS 'Returns overall campaign status including total prizes, remaining, and breakdown by prize type';
