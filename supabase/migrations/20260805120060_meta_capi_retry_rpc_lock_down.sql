-- CRITICAL. The companion migration used
--   REVOKE ALL ON FUNCTION ... FROM anon, authenticated;
-- which is a NO-OP for functions: Postgres grants EXECUTE to PUBLIC by default,
-- so revoking from anon removes a grant that never existed and leaves the
-- PUBLIC grant intact. The function is SECURITY DEFINER, so anyone holding the
-- (public by definition) anon key could POST
-- /rest/v1/rpc/increment_meta_capi_retry with an arbitrary booking_id array,
-- flip rows to 'failed' and push retry_count past 3 -- permanently retiring
-- those bookings from conversion upload. A silent, unauthenticated kill switch.
--
-- For FUNCTIONS the revoke must target PUBLIC, then grant back explicitly.
-- (For TABLES Supabase's default privileges go to anon/authenticated, which is
-- why the table revokes DID work -- the two cases are genuinely different and
-- that is what made this easy to miss.)

REVOKE ALL ON FUNCTION public.increment_meta_capi_retry(TEXT[], TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.increment_meta_capi_retry(TEXT[], TEXT, TEXT) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.increment_meta_capi_retry(TEXT[], TEXT, TEXT) TO service_role;
