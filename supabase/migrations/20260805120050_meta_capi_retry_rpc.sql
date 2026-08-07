-- Atomic retry bookkeeping for the Meta CAPI upload. A read-then-write from the
-- app would race two overlapping cron ticks and could reset retry_count,
-- letting a permanently-broken row retry forever.
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
   WHERE booking_id = ANY(p_booking_ids);
$function$;

REVOKE ALL ON FUNCTION public.increment_meta_capi_retry(TEXT[], TEXT, TEXT) FROM anon, authenticated;
