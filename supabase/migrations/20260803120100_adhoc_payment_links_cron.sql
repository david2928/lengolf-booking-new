-- Expiry sweep for ad-hoc payment links. Companion to
-- 20260803120000_adhoc_payment_links.sql; the ad-hoc analogue of
-- shopeepay_expire_unpaid_rentals().
--
-- DELIBERATE DIVERGENCE from the rental version: that function finds the
-- transactions to fail via `club_rentals.updated_at >= NOW() - INTERVAL '1 minute'`,
-- which silently misses rows whenever a cron tick is late, slow, or skipped --
-- the row is cancelled but its transaction stays 'pending' forever. This version
-- joins on the link's own status instead, so it is fully idempotent and
-- self-healing: a missed tick is repaired by the next one.

CREATE OR REPLACE FUNCTION public.shopeepay_expire_unpaid_payment_links()
RETURNS TABLE (expired_count INTEGER, failed_draft_count INTEGER)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_expired INTEGER;
  v_drafts  INTEGER;
BEGIN
  -- 1. Live links whose validity window lapsed.
  WITH expired AS (
    UPDATE public.payment_links
       SET status = 'expired',
           updated_at = NOW()
     WHERE status = 'pending'
       AND expires_at IS NOT NULL
       AND expires_at < NOW()
    RETURNING id
  )
  SELECT COUNT(*)::INTEGER INTO v_expired FROM expired;

  -- 2. Drafts that never reached the gateway -- the forms process died between
  --    the draft INSERT and the mint call. Nothing was ever payable. 15 minutes
  --    is far longer than the mint round-trip, so this cannot race a live mint.
  WITH stuck AS (
    UPDATE public.payment_links
       SET status = 'failed',
           updated_at = NOW()
     WHERE status = 'draft'
       AND created_at < NOW() - INTERVAL '15 minutes'
    RETURNING id
  )
  SELECT COUNT(*)::INTEGER INTO v_drafts FROM stuck;

  -- 3. Kill every live charge belonging to a link that is no longer payable.
  --    The status set matches payment_txn_one_live_per_link_uidx's predicate
  --    exactly, so a stale row can never block a later legitimate INSERT.
  --    Never touches 'success' / 'refunded'.
  UPDATE public.payment_transactions pt
     SET status = 'failed',
         error_message = COALESCE(pt.error_message, 'Payment link expired before payment'),
         updated_at = NOW()
    FROM public.payment_links pl
   WHERE pt.payment_link_id = pl.id
     AND pl.status IN ('expired','failed','cancelled')
     AND pt.status IN ('pending','redirected');

  RETURN QUERY SELECT v_expired, v_drafts;
END;
$function$;

COMMENT ON FUNCTION public.shopeepay_expire_unpaid_payment_links IS
  'Expires ad-hoc payment links past their validity window and fails their live '
  'transactions. Also fails drafts that never reached the gateway. Idempotent. '
  'Run manually: SELECT * FROM shopeepay_expire_unpaid_payment_links();';

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'shopeepay-expire-unpaid-payment-links') THEN
      PERFORM cron.unschedule('shopeepay-expire-unpaid-payment-links');
    END IF;

    PERFORM cron.schedule(
      'shopeepay-expire-unpaid-payment-links',
      '* * * * *',
      $cron$ SELECT public.shopeepay_expire_unpaid_payment_links(); $cron$
    );
  ELSE
    RAISE NOTICE 'pg_cron not installed -- enable it and re-run this migration.';
  END IF;
END
$$;
