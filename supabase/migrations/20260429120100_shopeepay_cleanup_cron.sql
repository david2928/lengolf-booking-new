-- Cleanup function + pg_cron schedule for unpaid course rentals.
--
-- Companion to 20260429120000_shopeepay_payment_transactions.sql.
-- Auto-cancels course rentals whose ShopeePay payment window has
-- expired (expires_at < NOW()) and that haven't been paid. Cancels
-- by setting status='cancelled' rather than deleting — preserves the
-- audit trail in payment_transactions and lets staff investigate.
--
-- Schedule: every minute. The job is cheap thanks to the partial
-- index on (expires_at) WHERE payment_status != 'paid'.

-- ---------------------------------------------------------------------
-- 1. The cleanup function
-- ---------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.shopeepay_expire_unpaid_rentals()
RETURNS TABLE (cancelled_count INTEGER)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count INTEGER;
BEGIN
  WITH expired AS (
    UPDATE public.club_rentals
       SET status = 'cancelled',
           expires_at = NULL,
           updated_at = NOW()
     WHERE rental_type = 'course'
       AND status = 'reserved'
       AND payment_status <> 'paid'
       AND expires_at IS NOT NULL
       AND expires_at < NOW()
     RETURNING id
  )
  SELECT COUNT(*)::INTEGER INTO v_count FROM expired;

  -- Also flag the associated pending payment_transactions as failed
  -- so the audit trail reflects "abandoned, never paid".
  UPDATE public.payment_transactions pt
     SET status = 'failed',
         error_message = COALESCE(pt.error_message, 'Reservation expired before payment'),
         updated_at = NOW()
   WHERE pt.club_rental_id IN (
       SELECT id
         FROM public.club_rentals
        WHERE status = 'cancelled'
          AND rental_type = 'course'
          AND updated_at >= NOW() - INTERVAL '1 minute'
     )
     AND pt.status IN ('pending', 'redirected');

  RETURN QUERY SELECT v_count;
END;
$$;

COMMENT ON FUNCTION public.shopeepay_expire_unpaid_rentals IS
  'Cancels course rentals whose ShopeePay payment window has lapsed '
  '(expires_at < NOW(), payment_status != paid). Returns the number '
  'of rentals cancelled. Scheduled via pg_cron — see the cron.schedule '
  'call below. Run manually with: SELECT * FROM shopeepay_expire_unpaid_rentals();';

-- ---------------------------------------------------------------------
-- 2. Schedule via pg_cron (idempotent)
-- ---------------------------------------------------------------------
-- pg_cron is enabled on Supabase by default. If the extension is not
-- installed yet, this block fails fast — operators should enable it
-- via the Supabase dashboard before applying this migration.

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    -- Unschedule any existing job with the same name so re-applying
    -- this migration doesn't create duplicates.
    PERFORM cron.unschedule('shopeepay-expire-unpaid-rentals')
    WHERE EXISTS (
      SELECT 1 FROM cron.job WHERE jobname = 'shopeepay-expire-unpaid-rentals'
    );

    PERFORM cron.schedule(
      'shopeepay-expire-unpaid-rentals',
      '* * * * *',  -- every minute
      $cron$ SELECT public.shopeepay_expire_unpaid_rentals(); $cron$
    );
  ELSE
    RAISE NOTICE 'pg_cron extension is not installed. Enable it in the '
                 'Supabase dashboard (Database > Extensions) and re-run '
                 'this migration to schedule the cleanup job.';
  END IF;
END
$$;
