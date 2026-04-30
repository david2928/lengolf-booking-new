-- ShopeePay payment integration — confirmation-email dedup column.
--
-- Both the webhook handler and the /api/payments/shopeepay/status
-- polling fallback can detect a successful payment. Modern UX requires
-- that the customer get the confirmation email regardless of which
-- path detects success first; doing so without this column would risk
-- double-sends.
--
-- Pattern: each helper claims the email send by issuing a conditional
-- UPDATE that only succeeds when confirmation_email_sent_at IS NULL,
-- then sends the email if the update returned a row. This is atomic at
-- the row level — the second caller's UPDATE returns no rows and skips.

ALTER TABLE public.payment_transactions
  ADD COLUMN IF NOT EXISTS confirmation_email_sent_at TIMESTAMPTZ;

COMMENT ON COLUMN public.payment_transactions.confirmation_email_sent_at IS
  'Set the moment the customer confirmation email send was claimed by '
  'either the webhook handler or the polling status route. Used as a '
  'dedup gate so polling-detected success can fire the email when the '
  'webhook is delayed, without risking a double-send when the webhook '
  'arrives later.';
