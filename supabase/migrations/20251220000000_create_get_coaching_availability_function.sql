-- Migration: Create get_coaching_availability RPC function
-- Description: Public function to fetch coach availability with schedules, overrides, blocks, and bookings
-- Usage: Used by LIFF Coaching page to display real-time coach availability

CREATE OR REPLACE FUNCTION public.get_coaching_availability(
  p_from_date DATE DEFAULT CURRENT_DATE,
  p_to_date DATE DEFAULT CURRENT_DATE + INTERVAL '14 days'
)
RETURNS TABLE (
  coach_id UUID,
  coach_name TEXT,
  coach_display_name TEXT,
  availability_date DATE,
  day_of_week INTEGER,
  available_slots TEXT[],
  schedule_start TIME,
  schedule_end TIME,
  is_available BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  WITH
  -- Get all active coaches
  coaches AS (
    SELECT au.id, au.coach_name, au.coach_display_name
    FROM backoffice.allowed_users au
    WHERE au.is_coach = true
  ),

  -- Generate date series
  date_series AS (
    SELECT d::DATE as check_date, EXTRACT(dow FROM d)::INTEGER as dow
    FROM generate_series(p_from_date, p_to_date, '1 day'::INTERVAL) d
  ),

  -- Cross join coaches with dates
  coach_dates AS (
    SELECT c.id as coach_id, c.coach_name, c.coach_display_name,
           ds.check_date, ds.dow
    FROM coaches c
    CROSS JOIN date_series ds
  ),

  -- Get base weekly schedules
  weekly AS (
    SELECT cd.coach_id, cd.coach_name, cd.coach_display_name, cd.check_date, cd.dow,
           ws.start_time, ws.end_time, ws.is_available
    FROM coach_dates cd
    LEFT JOIN coach_weekly_schedules ws
      ON ws.coach_id = cd.coach_id AND ws.day_of_week = cd.dow
  ),

  -- Apply date overrides (available overrides replace schedule, unavailable subtract from it)
  with_overrides AS (
    SELECT w.*,
           COALESCE(ao.start_time, w.start_time) as final_start,
           COALESCE(ao.end_time, w.end_time) as final_end,
           CASE
             WHEN ao.override_type = 'available' THEN true
             WHEN ao.override_type = 'unavailable' AND ao.start_time = w.start_time AND ao.end_time = w.end_time THEN false
             ELSE COALESCE(w.is_available, false)
           END as final_available,
           ao.override_type
    FROM weekly w
    LEFT JOIN coach_date_overrides ao
      ON ao.coach_id = w.coach_id AND ao.override_date = w.check_date
  ),

  -- Generate hourly slots for each available day
  hourly_slots AS (
    SELECT wo.coach_id, wo.coach_name, wo.coach_display_name, wo.check_date, wo.dow,
           wo.final_start, wo.final_end, wo.final_available,
           generate_series(
             EXTRACT(HOUR FROM wo.final_start)::INTEGER,
             EXTRACT(HOUR FROM wo.final_end)::INTEGER - 1
           ) as slot_hour
    FROM with_overrides wo
    WHERE wo.final_available = true AND wo.final_start IS NOT NULL
  ),

  -- Remove recurring blocks
  after_blocks AS (
    SELECT hs.*
    FROM hourly_slots hs
    WHERE NOT EXISTS (
      SELECT 1 FROM coach_recurring_blocks rb
      WHERE rb.coach_id = hs.coach_id
        AND rb.day_of_week = hs.dow
        AND rb.is_active = true
        AND hs.slot_hour >= EXTRACT(HOUR FROM rb.start_time)
        AND hs.slot_hour < EXTRACT(HOUR FROM rb.end_time)
    )
    -- Also remove unavailable date overrides (partial day blocks)
    AND NOT EXISTS (
      SELECT 1 FROM coach_date_overrides uo
      WHERE uo.coach_id = hs.coach_id
        AND uo.override_date = hs.check_date
        AND uo.override_type = 'unavailable'
        AND hs.slot_hour >= EXTRACT(HOUR FROM uo.start_time)
        AND hs.slot_hour < EXTRACT(HOUR FROM uo.end_time)
    )
  ),

  -- Remove booked slots (coaching bookings)
  after_bookings AS (
    SELECT ab.*
    FROM after_blocks ab
    WHERE NOT EXISTS (
      SELECT 1 FROM bookings b
      WHERE b.date = ab.check_date
        AND b.status = 'confirmed'
        AND b.booking_type ILIKE '%' || ab.coach_display_name || '%'
        AND ab.slot_hour >= CAST(SPLIT_PART(b.start_time, ':', 1) AS INTEGER)
        AND ab.slot_hour < CAST(SPLIT_PART(b.start_time, ':', 1) AS INTEGER) + COALESCE(b.duration, 1)
    )
  ),

  -- Aggregate slots by coach and date
  aggregated AS (
    SELECT
      ab.coach_id,
      ab.coach_name,
      ab.coach_display_name,
      ab.check_date,
      ab.dow,
      ab.final_start,
      ab.final_end,
      ARRAY_AGG(LPAD(ab.slot_hour::TEXT, 2, '0') || ':00' ORDER BY ab.slot_hour) as slots
    FROM after_bookings ab
    GROUP BY ab.coach_id, ab.coach_name, ab.coach_display_name, ab.check_date, ab.dow, ab.final_start, ab.final_end
  )

  SELECT
    a.coach_id,
    a.coach_name,
    a.coach_display_name,
    a.check_date as availability_date,
    a.dow as day_of_week,
    a.slots as available_slots,
    a.final_start as schedule_start,
    a.final_end as schedule_end,
    true as is_available
  FROM aggregated a

  UNION ALL

  -- Include days with no availability
  SELECT
    cd.coach_id,
    cd.coach_name,
    cd.coach_display_name,
    cd.check_date as availability_date,
    cd.dow as day_of_week,
    ARRAY[]::TEXT[] as available_slots,
    NULL::TIME as schedule_start,
    NULL::TIME as schedule_end,
    false as is_available
  FROM coach_dates cd
  WHERE NOT EXISTS (
    SELECT 1 FROM aggregated a
    WHERE a.coach_id = cd.coach_id AND a.check_date = cd.check_date
  )

  ORDER BY coach_display_name, availability_date;
END;
$$;

-- Grant execute permissions to authenticated and anonymous users (for LIFF public access)
GRANT EXECUTE ON FUNCTION public.get_coaching_availability TO authenticated, anon;

-- Add comment for documentation
COMMENT ON FUNCTION public.get_coaching_availability IS
'Returns coach availability considering weekly schedules, date overrides, recurring blocks, and confirmed bookings. Used by the LIFF Coaching page.';
