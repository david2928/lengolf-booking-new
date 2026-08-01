-- Payment-reminder support for the T+30min abandoned-payment nudge.
--
-- Online course-rental orders now get a 2-hour payment window (was 30 min);
-- a minute pg_cron job (`club-rental-payment-reminder-1min`, net.http_get +
-- Bearer CRON_API_KEY) calls GET /api/cron/club-rental-payment-reminder,
-- which claims orders still unpaid ~30 min after creation and sends ONE
-- customer reminder email (payment link) + ONE staff LINE ping.
ALTER TABLE public.club_rental_orders
  ADD COLUMN IF NOT EXISTS payment_reminder_sent_at timestamptz;

COMMENT ON COLUMN public.club_rental_orders.payment_reminder_sent_at IS
  'Claim-then-send marker for the T+30min unpaid-order reminder (customer email + staff LINE).';
