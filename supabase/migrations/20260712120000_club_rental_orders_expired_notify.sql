-- Expired-order LINE notification support (booking-new).
--
-- The minute pg_cron job `shopeepay-expire-unpaid-rentals` cancels unpaid
-- course orders silently — the `Expired` composer state in
-- lib/club-rental/lineMessage.ts had no caller. This migration:
--   1. adds `expired_at` (stamped ONLY by the expiry function, so staff
--      cancels / refunds can never masquerade as an expiry) and
--      `expired_notify_sent_at` (claim-then-send marker for the notify cron)
--      to club_rental_orders;
--   2. re-creates shopeepay_expire_unpaid_rentals() with the header-cancel
--      UPDATE additionally stamping expired_at = NOW().
--
-- A separate pg_cron job (`club-rental-expired-notify-1min`, net.http_get +
-- Bearer CRON_API_KEY, same auth as the existing booking.len.golf jobs)
-- calls GET /api/cron/club-rental-expired-notify which claims rows
-- (expired_at IS NOT NULL AND expired_notify_sent_at IS NULL AND is_test IS
-- NOT TRUE) and sends one staff LINE ping per expired order.

ALTER TABLE public.club_rental_orders
  ADD COLUMN IF NOT EXISTS expired_at timestamptz,
  ADD COLUMN IF NOT EXISTS expired_notify_sent_at timestamptz;

COMMENT ON COLUMN public.club_rental_orders.expired_at IS
  'Stamped by shopeepay_expire_unpaid_rentals() when the unpaid order was auto-cancelled. NULL for staff cancels/refunds.';
COMMENT ON COLUMN public.club_rental_orders.expired_notify_sent_at IS
  'Claim-then-send marker for the expired-order staff LINE notification cron.';

-- Same body as the live function (verified via pg_get_functiondef 2026-07-12)
-- with ONE addition: the header-cancel UPDATE stamps expired_at.
CREATE OR REPLACE FUNCTION public.shopeepay_expire_unpaid_rentals()
 RETURNS TABLE(cancelled_count integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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

  -- Order-model reconciliation (booking-new website order flow, Phase 1):
  -- cancel the parent header once all of an order's lines are cancelled, so
  -- club_rental_orders never drifts to a stale 'reserved'/'pending' state.
  -- expired_at feeds the staff LINE notify cron (claim-then-send); it is
  -- stamped ONLY here, so it precisely identifies cron-expired orders.
  UPDATE public.club_rental_orders o
     SET status = 'cancelled',
         payment_status = 'failed',
         expires_at = NULL,
         expired_at = NOW(),
         updated_at = NOW()
   WHERE o.id IN (
           SELECT DISTINCT order_id
             FROM public.club_rentals
            WHERE status = 'cancelled'
              AND rental_type = 'course'
              AND order_id IS NOT NULL
              AND updated_at >= NOW() - INTERVAL '1 minute'
         )
     AND o.status <> 'cancelled'
     AND NOT EXISTS (
           SELECT 1
             FROM public.club_rentals l
            WHERE l.order_id = o.id
              AND l.status <> 'cancelled'
         );

  RETURN QUERY SELECT v_count;
END;
$function$;
