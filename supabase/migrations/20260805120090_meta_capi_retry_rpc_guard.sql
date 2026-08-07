-- Stop a losing tick from un-recording a confirmed send.
--
-- Two ticks overlap (a slow run still in flight when the next fires, or a
-- manual invocation alongside the nightly cron). Both read the same candidates
-- from the view before either stages. Tick A sends successfully and marks its
-- rows 'uploaded'. Tick B then hits a transient Graph error on the SAME rows
-- and calls this RPC -- flipping rows Meta has already received back to
-- 'failed' and incrementing retry_count. Repeat that and they exhaust at
-- retry_count >= 3 and are retired from upload forever, despite having been
-- delivered.
--
-- The stable event_id protects META from double-counting. It does nothing for
-- the tracking table's integrity, and the tracking table is what decides
-- whether a conversion is ever retried. So the guard has to live here.
--
-- Paired with `.eq('status', 'pending')` on the success update in
-- app/api/cron/meta-capi-upload/route.ts, which is the mirror image: that one
-- stops a stale tick from promoting rows it did not stage.
--
-- 'uploaded' is the only status excluded. 'skipped' and 'pending' must still be
-- claimable by a failing tick -- those are not confirmed sends.

CREATE OR REPLACE FUNCTION public.increment_meta_capi_retry(
  p_booking_ids   TEXT[],
  p_error_message TEXT,
  p_fbtrace_id    TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public', 'marketing'
AS $function$
  UPDATE marketing.meta_capi_uploads
     SET status        = 'failed',
         retry_count   = retry_count + 1,
         error_message = p_error_message,
         fbtrace_id    = COALESCE(p_fbtrace_id, fbtrace_id)
   WHERE booking_id = ANY(p_booking_ids)
     AND status <> 'uploaded';
$function$;

-- CREATE OR REPLACE FUNCTION RESETS THE ACL to the Postgres default, which is
-- EXECUTE to PUBLIC. Without the following three lines this migration silently
-- reopens the unauthenticated kill switch that 20260805120060 closed: any
-- holder of the anon key could POST /rest/v1/rpc/increment_meta_capi_retry and
-- retire arbitrary bookings from conversion upload. Order matters -- these must
-- follow the CREATE OR REPLACE, in this same file.
REVOKE ALL ON FUNCTION public.increment_meta_capi_retry(TEXT[], TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.increment_meta_capi_retry(TEXT[], TEXT, TEXT) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.increment_meta_capi_retry(TEXT[], TEXT, TEXT) TO service_role;
