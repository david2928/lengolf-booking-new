-- Support functions for customer-facing in-place booking edits.
--
-- Two additions, both purely additive. Nothing existing is altered, so the
-- rollback is `drop function` on each.
--
--   1. public.get_booking_credit_hours  — read the free-hour credit applied to a
--      booking without the app reaching into `backoffice`.
--   2. public.get_available_slots_with_max_hours_v4 — v3, plus the ability to
--      ignore one booking when computing availability.

-- ---------------------------------------------------------------------------
-- 1. Credit hours applied to a booking
-- ---------------------------------------------------------------------------
-- Both Supabase clients in lengolf-booking-new are pinned to the `public`
-- schema, so a SECURITY DEFINER wrapper is the established pattern for reading
-- `backoffice` from that app — the same shape as public.get_customer_packages
-- over backoffice.get_customer_packages, and public.get_customer_credit_balance
-- over backoffice.get_credit_balance.
--
-- The edit endpoint needs this to enforce an invariant the wallet cannot: credit
-- is refunded by a trigger on CANCEL, and nothing gives hours back when a
-- booking is merely SHORTENED. So an edit that drops a 2 h booking with 1 h of
-- credit down to 30 minutes would strand half an hour of someone's promotion.
-- Reading the redeemed total lets the endpoint refuse instead.
--
-- Only 'active' redemptions count. A refunded row is history, not a claim on the
-- booking's length.
create or replace function public.get_booking_credit_hours(p_booking_id text)
returns numeric
language sql
stable
security definer
set search_path to 'pg_catalog', 'public'
as $$
  select coalesce(sum(quantity), 0)::numeric
  from backoffice.credit_redemptions
  where booking_id = p_booking_id
    and status = 'active';
$$;

comment on function public.get_booking_credit_hours(text) is
  'Total active sim-hour credit redeemed against a booking, in hours. Used by /api/vip/bookings/[id]/modify to refuse an edit that would shorten a booking below the credit already applied to it (credits are only refunded on cancel, never on shorten).';

revoke all on function public.get_booking_credit_hours(text) from public, anon, authenticated;
grant execute on function public.get_booking_credit_hours(text) to service_role;

-- ---------------------------------------------------------------------------
-- 2. Slot availability that can ignore one booking
-- ---------------------------------------------------------------------------
-- v3 verbatim, with `p_exclude_booking_id` threaded into its four
-- check_availability calls.
--
-- A NEW NAME, not a fifth defaulted parameter on v3. PostgREST resolves
-- overloads by argument name, and a defaulted parameter would make both
-- candidates match the existing four-named-argument callers — PGRST203, which
-- would take out the live booking flow. v3 is left untouched and remains the
-- rollback path.
--
-- What it fixes: a customer editing a booking must not see their own slot as
-- occupied. Without the exclusion, moving a 19:00 booking to 20:00 on an
-- otherwise-full evening shows 19:00 greyed out, i.e. the customer is told their
-- current time is unavailable.
create or replace function public.get_available_slots_with_max_hours_v4(
    p_date date,
    p_current_time_bangkok timestamp with time zone default null::timestamp with time zone,
    p_start_hour integer default 10,
    p_end_hour integer default 23,
    p_exclude_booking_id text default null
)
returns jsonb
language plpgsql
set search_path to 'pg_catalog', 'public'
as $function$
DECLARE
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
            EXIT WHEN check_duration * 60 > remaining_minutes;

            bay_available_count := 0;
            social_bay_count := 0;
            ai_lab_count := 0;
            available_bays := ARRAY[]::text[];

            IF check_availability(p_date, 'Bay 1', slot_time, check_duration::real, p_exclude_booking_id) THEN
                bay_available_count := bay_available_count + 1;
                social_bay_count := social_bay_count + 1;
                available_bays := array_append(available_bays, 'Bay 1');
            END IF;

            IF check_availability(p_date, 'Bay 2', slot_time, check_duration::real, p_exclude_booking_id) THEN
                bay_available_count := bay_available_count + 1;
                social_bay_count := social_bay_count + 1;
                available_bays := array_append(available_bays, 'Bay 2');
            END IF;

            IF check_availability(p_date, 'Bay 3', slot_time, check_duration::real, p_exclude_booking_id) THEN
                bay_available_count := bay_available_count + 1;
                social_bay_count := social_bay_count + 1;
                available_bays := array_append(available_bays, 'Bay 3');
            END IF;

            IF check_availability(p_date, 'Bay 4', slot_time, check_duration::real, p_exclude_booking_id) THEN
                bay_available_count := bay_available_count + 1;
                ai_lab_count := ai_lab_count + 1;
                available_bays := array_append(available_bays, 'Bay 4');
            END IF;

            IF bay_available_count > 0 THEN
                max_hours := check_duration;

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
                EXIT;
            END IF;
        END LOOP;

        IF max_hours > 0 THEN
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

comment on function public.get_available_slots_with_max_hours_v4(date, timestamp with time zone, integer, integer, text) is
  'Bookable slots for a date, optionally ignoring one booking so a customer editing it does not see their own slot as occupied. Identical to v3 when p_exclude_booking_id is null. Separate name rather than a v3 overload: a defaulted fifth parameter would make PostgREST ambiguous (PGRST203) for existing four-argument callers.';
