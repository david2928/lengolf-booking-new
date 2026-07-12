-- Per-IP rate limiting for unauthenticated write routes (booking-new).
--
-- POST /api/clubs/order and /api/clubs/reserve are guest-checkout endpoints
-- that auto-create public.customers rows on unmatched phone numbers
-- (resolveOrCreateCustomerId, PR #67). A script cycling random valid phones
-- could mint one CRM row per request, polluting the shared customers table
-- that forms/POS/marketing consume. /api/notifications/line is likewise
-- unauthenticated and pushes straight to the staff LINE group.
--
-- Vercel serverless keeps no usable in-memory state across instances, so the
-- counter lives here: a fixed-window per-key counter bumped atomically by
-- rate_limit_hit(). The app fails OPEN on any error — rate limiting must
-- never block a paying customer because of an infra hiccup.

CREATE TABLE IF NOT EXISTS public.rate_limit_counters (
  key text NOT NULL,
  window_start timestamptz NOT NULL,
  count integer NOT NULL DEFAULT 0,
  PRIMARY KEY (key, window_start)
);

COMMENT ON TABLE public.rate_limit_counters IS
  'Fixed-window per-IP request counters for unauthenticated booking-new write routes. Rows are transient; stale windows are cleaned up opportunistically by rate_limit_hit().';

-- Service-role only: no policies (service_role bypasses RLS) and no grants.
ALTER TABLE public.rate_limit_counters ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.rate_limit_counters FROM anon, authenticated;

-- Atomically count a hit against a key and report whether it is allowed.
-- Fixed-window: the window is aligned to epoch-multiples of p_window_seconds,
-- so all instances agree on window boundaries without coordination.
CREATE OR REPLACE FUNCTION public.rate_limit_hit(
  p_key text,
  p_max integer,
  p_window_seconds integer
)
RETURNS TABLE(allowed boolean, current_count integer, retry_after_seconds integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_window_start timestamptz;
  v_window_end timestamptz;
  v_count integer;
BEGIN
  v_window_start := to_timestamp(
    floor(extract(epoch FROM now()) / p_window_seconds) * p_window_seconds
  );
  v_window_end := v_window_start + make_interval(secs => p_window_seconds);

  INSERT INTO public.rate_limit_counters AS c (key, window_start, count)
  VALUES (p_key, v_window_start, 1)
  ON CONFLICT (key, window_start)
  DO UPDATE SET count = c.count + 1
  RETURNING c.count INTO v_count;

  -- Opportunistic cleanup (~2% of calls) keeps the table bounded without a
  -- dedicated pg_cron job. 2 days >> any window we use.
  IF random() < 0.02 THEN
    DELETE FROM public.rate_limit_counters
     WHERE window_start < now() - interval '2 days';
  END IF;

  RETURN QUERY SELECT
    v_count <= p_max,
    v_count,
    GREATEST(1, CEIL(extract(epoch FROM (v_window_end - now())))::integer);
END;
$function$;

-- Functions default to EXECUTE for PUBLIC — lock to service_role only.
REVOKE ALL ON FUNCTION public.rate_limit_hit(text, integer, integer)
  FROM PUBLIC, anon, authenticated;
