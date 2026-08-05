-- 'skipped' was terminal. It should not be.
--
-- The route records four distinct skip reasons and only ONE of them is a
-- permanent property of the booking:
--
--   * 'No usable email or phone identifier'  -- transient. A staff member
--     fixing a typo'd phone number, or a customer record getting linked, makes
--     the same booking uploadable tomorrow.
--   * 'Unexpected action_source'             -- transient. That literal can
--     only appear if the view's CASE expression grew a branch; repairing the
--     view repairs every row it stamped.
--   * 'Unparseable event_time'               -- transient. Same shape: a data
--     repair upstream makes the row usable.
--   * 'Older than the Meta 7-day event_time window' -- permanent, and already
--     enforced independently by the view's own `created_at >= NOW() - 7 days`
--     floor. Nothing extra is needed to retire those.
--
-- So excluding 'skipped' bought nothing on the one reason that is genuinely
-- terminal, and silently made the other three terminal too: a booking skipped
-- once for a missing identifier could never be uploaded again even after the
-- data was fixed. The 7-day floor retires everything after a week regardless,
-- which bounds how long a stubborn row can keep being re-evaluated.
--
-- 'pending' is likewise NOT terminal: it means a run staged the row and then
-- died before recording an outcome. The stable event_id makes the retry safe
-- against double-counting at Meta's end.
--
-- Only a confirmed send ('uploaded') or an exhausted retry budget
-- ('failed' AND retry_count >= 3) is terminal.

CREATE OR REPLACE VIEW public.meta_capi_pending AS
SELECT
  b.id                                        AS booking_id,
  b.created_at                                AS event_time,
  b.name                                      AS customer_name,
  NULLIF(BTRIM(b.email), '')                  AS booking_email,
  NULLIF(BTRIM(c.email), '')                  AS customer_email,
  COALESCE(
    NULLIF(BTRIM(b.phone_number), ''),
    NULLIF(BTRIM(c.contact_number), '')
  )                                           AS phone,
  CASE WHEN EXISTS (
    SELECT 1 FROM public.booking_process_logs l
     WHERE l.booking_id = b.id
       AND l.step = 'Booking creation'
  ) THEN 'website' ELSE 'physical_store' END  AS action_source
FROM public.bookings b
LEFT JOIN public.customers c ON c.id = b.customer_id
WHERE b.status <> 'cancelled'
  AND COALESCE(b.customer_notes, '') NOT ILIKE '%TEST BOOKING%'
  AND b.created_at >= NOW() - INTERVAL '7 days'
  AND NOT EXISTS (
    SELECT 1 FROM marketing.meta_capi_uploads u
     WHERE u.booking_id = b.id
       -- Only a confirmed send, or an exhausted retry budget, is terminal.
       -- 'pending' means a run staged the row then died; 'skipped' means the
       -- data was unusable at the time and may not be tomorrow (a staff member
       -- fixing a typo'd phone number should recover the booking). Both retry.
       -- The view's own 7-day floor retires everything after a week anyway.
       AND (u.status = 'uploaded'
            OR (u.status = 'failed' AND u.retry_count >= 3))
  );

COMMENT ON VIEW public.meta_capi_pending IS
  'Bookings eligible for Meta CAPI upload: non-cancelled, non-test, within Meta''s '
  '7-day event_time window, not already uploaded or retry-exhausted.';

-- Server-side only. CREATE OR REPLACE VIEW preserves the existing ACL, but
-- restating the revoke keeps this file correct in isolation on a fresh replay.
REVOKE ALL ON public.meta_capi_pending FROM anon, authenticated, google_ads_readonly;
