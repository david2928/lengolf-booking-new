-- Course club-rental availability: widen the transport buffer from 1 hour to 2 hours.
--
-- Both availability functions must stay in lockstep (display vs TOCTOU reserve check),
-- so the buffer is changed in the course branch of BOTH. Only the `interval '1 hour'`
-- literals change to `interval '2 hours'`; everything else is reproduced verbatim from
-- the current prod definitions.

CREATE OR REPLACE FUNCTION public.get_available_club_sets(
  p_rental_type text,
  p_start_date date,
  p_end_date date DEFAULT NULL::date,
  p_start_time time without time zone DEFAULT NULL::time without time zone,
  p_duration_hours numeric DEFAULT NULL::numeric,
  p_return_time time without time zone DEFAULT NULL::time without time zone
)
RETURNS TABLE(
  id uuid, name text, slug text, tier text, gender text, brand text, model text,
  description text, specifications jsonb, image_url text, rental_type text,
  indoor_price_1h numeric, indoor_price_2h numeric, indoor_price_4h numeric,
  course_price_1d numeric, course_price_3d numeric, course_price_7d numeric, course_price_14d numeric,
  quantity integer, display_order integer, rented_count bigint, available_count integer
)
LANGUAGE sql
STABLE
SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
  SELECT
    rcs.id, rcs.name, rcs.slug, rcs.tier, rcs.gender, rcs.brand, rcs.model,
    rcs.description, rcs.specifications, rcs.image_url, rcs.rental_type,
    rcs.indoor_price_1h, rcs.indoor_price_2h, rcs.indoor_price_4h,
    rcs.course_price_1d, rcs.course_price_3d, rcs.course_price_7d, rcs.course_price_14d,
    rcs.quantity, rcs.display_order,
    rented.cnt AS rented_count,
    GREATEST(0, rcs.quantity - rented.cnt::int) AS available_count
  FROM public.rental_club_sets rcs
  CROSS JOIN LATERAL (
    SELECT count(*)::bigint AS cnt
    FROM (
      -- Source 1: course club_rentals (course-vs-course hour overlap, or indoor off-site).
      SELECT 1
      FROM public.club_rentals cr
      WHERE cr.rental_club_set_id = rcs.id
        AND cr.rental_type = 'course'
        AND cr.status NOT IN ('cancelled','no_show','returned')
        AND (
          (p_rental_type = 'course'
            AND (cr.start_date::timestamp + COALESCE(cr.start_time, '00:00'::time) - interval '2 hours')
                  < (COALESCE(p_end_date, p_start_date)::timestamp + COALESCE(p_return_time, '23:59'::time))
            AND (cr.end_date::timestamp + COALESCE(cr.return_time::time, '23:59'::time) + interval '2 hours')
                  > (p_start_date::timestamp + COALESCE(p_start_time, '00:00'::time)))
          OR
          (p_rental_type = 'indoor'
            AND cr.start_date <= COALESCE(p_end_date, p_start_date)
            AND cr.end_date >= p_start_date)
        )

      UNION ALL

      -- Source 2 (indoor only): bay bookings that picked this set (canonical indoor source).
      SELECT 1
      FROM public.bookings b
      WHERE p_rental_type = 'indoor'
        AND b.rental_club_set_id = rcs.id
        AND b.status NOT IN ('cancelled','no_show')
        AND b.date = p_start_date
        AND (
          p_start_time IS NULL
          OR p_duration_hours IS NULL
          OR (
            b.start_time::time < (p_start_time + make_interval(secs => (p_duration_hours * 3600)::int))
            AND (b.start_time::time + make_interval(secs => (b.duration * 3600)::int)) > p_start_time
          )
        )
    ) conflicts
  ) rented
  WHERE rcs.is_active = true
    AND rcs.rental_type IN (p_rental_type, 'both')
  ORDER BY rcs.display_order;
$function$;

CREATE OR REPLACE FUNCTION public.check_club_set_availability(
  p_set_id uuid,
  p_start_date date,
  p_end_date date DEFAULT NULL::date,
  p_start_time time without time zone DEFAULT NULL::time without time zone,
  p_duration_hours numeric DEFAULT NULL::numeric,
  p_exclude_rental_id uuid DEFAULT NULL::uuid,
  p_rental_type text DEFAULT NULL::text,
  p_return_time time without time zone DEFAULT NULL::time without time zone,
  p_exclude_booking_id text DEFAULT NULL::text
)
RETURNS integer
LANGUAGE sql
STABLE
SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
  SELECT GREATEST(0,
    (SELECT rcs.quantity FROM public.rental_club_sets rcs WHERE rcs.id = p_set_id)
    -
    (
      SELECT count(*)::int
      FROM (
        -- Source 1: course club_rentals (course-vs-course overlap, or indoor off-site).
        SELECT 1
        FROM public.club_rentals cr
        WHERE cr.rental_club_set_id = p_set_id
          AND cr.rental_type = 'course'
          AND cr.status NOT IN ('cancelled','no_show','returned')
          AND (p_exclude_rental_id IS NULL OR cr.id <> p_exclude_rental_id)
          AND (
            (p_rental_type = 'course'
              AND (cr.start_date::timestamp + COALESCE(cr.start_time, '00:00'::time) - interval '2 hours')
                    < (COALESCE(p_end_date, p_start_date)::timestamp + COALESCE(p_return_time, '23:59'::time))
              AND (cr.end_date::timestamp + COALESCE(cr.return_time::time, '23:59'::time) + interval '2 hours')
                    > (p_start_date::timestamp + COALESCE(p_start_time, '00:00'::time)))
            OR
            (COALESCE(p_rental_type, 'indoor') = 'indoor'
              AND cr.start_date <= COALESCE(p_end_date, p_start_date)
              AND cr.end_date >= p_start_date)
          )

        UNION ALL

        -- Source 2 (indoor only): bay bookings with this set.
        SELECT 1
        FROM public.bookings b
        WHERE COALESCE(p_rental_type, 'indoor') = 'indoor'
          AND b.rental_club_set_id = p_set_id
          AND b.status NOT IN ('cancelled','no_show')
          AND b.date = p_start_date
          AND (p_exclude_booking_id IS NULL OR b.id <> p_exclude_booking_id)
          AND (
            p_start_time IS NULL
            OR p_duration_hours IS NULL
            OR (
              b.start_time::time < (p_start_time + make_interval(secs => (p_duration_hours * 3600)::int))
              AND (b.start_time::time + make_interval(secs => (b.duration * 3600)::int)) > p_start_time
            )
          )
      ) conflicts
    )
  );
$function$;
