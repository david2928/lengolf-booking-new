-- get_available_slots_with_max_hours_v3
--
-- ADDITIVE ONLY. Creates a NEW function; v2 is left completely untouched and
-- keeps serving production until app/api/availability/route.ts is switched over
-- (a separate code change, on a separate branch). That is what makes applying
-- this to production safe: nothing calls v3 until code that calls it deploys.
-- Reversible with: DROP FUNCTION public.get_available_slots_with_max_hours_v3(
--   date, timestamp with time zone, integer, integer);
--
-- Differences from v2:
--   1. Duration probing steps over an explicit ladder (1, 1.5, 2, 2.5, 3, 4, 5)
--      instead of the integer loop 1..5. 3.5 and 4.5 are deliberately absent:
--      in the 180 days to 2026-07-25 they accounted for three paid bay-rate
--      bookings between them, and about half their volume was staff bay blocks
--      created in the POS, which this function does not serve. 4 and 5 stay in
--      the ladder because 46 package holders used them; the CLIENT decides
--      whether to offer them, gated on hasActivePackage. See
--      lib/booking-durations.ts, which must stay in step with this array.
--   2. max_hours is numeric, not integer, so a slot that fits 2.5 hours reports
--      2.5. bay_availability_by_duration keys become '1', '1.5', '2', ...
--      trim_scale() is what keeps them as '1.5' rather than '1.50', which
--      matters because the client reads the map with (1.5).toString().
--   3. Same-day lead time rounds up to the next HALF hour instead of the next
--      full hour, so at 14:10 the 14:30 slot is offered rather than discarded.
--
-- Verified against this database before writing: PostgreSQL 17.6, trim_scale()
-- present and yielding '1.5' / '1' / '2.5', and check_availability's fourth
-- parameter is `p_duration real`, so fractional durations need no cast change.
CREATE OR REPLACE FUNCTION public.get_available_slots_with_max_hours_v3(
    p_date date,
    p_current_time_bangkok timestamp with time zone DEFAULT NULL::timestamp with time zone,
    p_start_hour integer DEFAULT 10,
    p_end_hour integer DEFAULT 23
)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
    -- Keep in step with BASE_DURATIONS + PACKAGE_ONLY_DURATIONS in
    -- lib/booking-durations.ts.
    duration_ladder numeric[] := ARRAY[1, 1.5, 2, 2.5, 3, 4, 5];
    slot_time text;
    slot_total_minutes integer;
    slot_hour_part integer;
    slot_min_part integer;
    remaining_minutes integer;
    max_hours numeric;
    period text;
    slots jsonb := '[]';
    current_total_minutes integer;
    is_today boolean;
    start_minutes_adjusted integer;
    check_duration numeric;
    bay_available_count integer;
    social_bay_count integer;
    ai_lab_count integer;
    available_bays text[] := ARRAY[]::text[];
    optimal_social_bay_count integer;
    optimal_ai_lab_count integer;
    optimal_available_bays text[] := ARRAY[]::text[];
    duration_breakdown jsonb;
    end_total_minutes integer;
BEGIN
    -- Same-day lead time: round the current time UP to the next half hour.
    -- v2 rounded to the next full hour, which threw away a slot that was only
    -- 20 minutes out (at 14:10 the earliest offer was 15:00, not 14:30).
    IF p_current_time_bangkok IS NOT NULL THEN
        current_total_minutes :=
            EXTRACT(hour FROM p_current_time_bangkok AT TIME ZONE 'Asia/Bangkok')::integer * 60
          + EXTRACT(minute FROM p_current_time_bangkok AT TIME ZONE 'Asia/Bangkok')::integer;
        is_today := DATE(p_current_time_bangkok AT TIME ZONE 'Asia/Bangkok') = p_date;
        start_minutes_adjusted := CASE
            WHEN is_today THEN GREATEST(p_start_hour * 60, ceil(current_total_minutes / 30.0)::integer * 30)
            ELSE p_start_hour * 60
        END;
    ELSE
        start_minutes_adjusted := p_start_hour * 60;
    END IF;

    slot_total_minutes := start_minutes_adjusted;

    WHILE slot_total_minutes < (p_end_hour * 60) LOOP
        slot_hour_part := slot_total_minutes / 60;
        slot_min_part := slot_total_minutes % 60;
        slot_time := lpad(slot_hour_part::text, 2, '0') || ':' || lpad(slot_min_part::text, 2, '0');

        remaining_minutes := (p_end_hour * 60) - slot_total_minutes;

        -- Minimum booking is 1 hour. This skip IS that rule.
        IF remaining_minutes < 60 THEN
            slot_total_minutes := slot_total_minutes + 30;
            CONTINUE;
        END IF;

        max_hours := 0;
        optimal_social_bay_count := 0;
        optimal_ai_lab_count := 0;
        optimal_available_bays := ARRAY[]::text[];
        duration_breakdown := '{}'::jsonb;

        FOREACH check_duration IN ARRAY duration_ladder LOOP
            -- Stop once the ladder exceeds what is left before closing.
            EXIT WHEN check_duration * 60 > remaining_minutes;

            bay_available_count := 0;
            social_bay_count := 0;
            ai_lab_count := 0;
            available_bays := ARRAY[]::text[];

            -- Bay 1-3 are Social Bays, Bay 4 is the AI Lab.
            IF check_availability(p_date, 'Bay 1', slot_time, check_duration::real) THEN
                bay_available_count := bay_available_count + 1;
                social_bay_count := social_bay_count + 1;
                available_bays := array_append(available_bays, 'Bay 1');
            END IF;

            IF check_availability(p_date, 'Bay 2', slot_time, check_duration::real) THEN
                bay_available_count := bay_available_count + 1;
                social_bay_count := social_bay_count + 1;
                available_bays := array_append(available_bays, 'Bay 2');
            END IF;

            IF check_availability(p_date, 'Bay 3', slot_time, check_duration::real) THEN
                bay_available_count := bay_available_count + 1;
                social_bay_count := social_bay_count + 1;
                available_bays := array_append(available_bays, 'Bay 3');
            END IF;

            IF check_availability(p_date, 'Bay 4', slot_time, check_duration::real) THEN
                bay_available_count := bay_available_count + 1;
                ai_lab_count := ai_lab_count + 1;
                available_bays := array_append(available_bays, 'Bay 4');
            END IF;

            IF bay_available_count > 0 THEN
                max_hours := check_duration;

                -- trim_scale keeps the key as '1.5', not '1.50'; the client
                -- looks this map up with (1.5).toString().
                duration_breakdown := duration_breakdown || jsonb_build_object(
                    trim_scale(check_duration)::text,
                    jsonb_build_object(
                        'social', social_bay_count,
                        'ai', ai_lab_count,
                        'total', bay_available_count,
                        'bays', available_bays
                    )
                );

                IF check_duration = 1 OR optimal_social_bay_count + optimal_ai_lab_count = 0 THEN
                    optimal_social_bay_count := social_bay_count;
                    optimal_ai_lab_count := ai_lab_count;
                    optimal_available_bays := available_bays;
                END IF;
            ELSE
                -- First unavailable rung ends the ladder for this slot.
                EXIT;
            END IF;
        END LOOP;

        IF max_hours > 0 THEN
            -- VESTIGIAL. Nothing reads this field any more.
            --
            -- Its morning/afternoon split at hour < 12 disagreed with the
            -- customer-facing captions ("09:00 - 13:00") and with the LIFF
            -- flow, both of which split at 13. A 12:00 or 12:30 slot was
            -- therefore grouped as Afternoon on the web under a header
            -- claiming 13:00-17:00, and as Morning on LINE.
            --
            -- `lib/booking-periods.ts` now owns the boundaries for BOTH flows
            -- and derives the displayed hour captions from the same constants.
            -- The field is left on the wire only because dropping it means
            -- another migration to a function shipped this week; do not
            -- resurrect it as a source of truth.
            period := CASE
                WHEN slot_hour_part < 12 THEN 'morning'
                WHEN slot_hour_part < 17 THEN 'afternoon'
                ELSE 'evening'
            END;

            end_total_minutes := slot_total_minutes + (max_hours * 60)::integer;

            slots := slots || jsonb_build_object(
                'startTime', slot_time,
                'endTime', lpad((end_total_minutes / 60)::text, 2, '0') || ':' || lpad((end_total_minutes % 60)::text, 2, '0'),
                'maxHours', trim_scale(max_hours),
                'period', period,
                'availableBays', optimal_available_bays,
                'socialBayCount', optimal_social_bay_count,
                'aiLabCount', optimal_ai_lab_count,
                'totalBayCount', optimal_social_bay_count + optimal_ai_lab_count,
                'bayAvailabilityByDuration', duration_breakdown
            );
        END IF;

        slot_total_minutes := slot_total_minutes + 30;
    END LOOP;

    RETURN slots;
END;
$function$;
