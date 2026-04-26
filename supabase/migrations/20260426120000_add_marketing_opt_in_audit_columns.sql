-- Marketing opt-in audit trail
-- Adds two columns to public.customers so we can track WHEN and WHERE
-- a customer's marketing_opt_in last changed. Required for PDPA compliance
-- audits and for diagnosing consent-source issues (e.g. accidental opt-ins).
--
-- No backfill: existing rows leave both new columns NULL until the next
-- explicit consent action touches the row.

ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS marketing_opt_in_changed_at timestamptz,
  ADD COLUMN IF NOT EXISTS marketing_opt_in_source text;

COMMENT ON COLUMN public.customers.marketing_opt_in_changed_at IS
  'Timestamp of the last marketing_opt_in change. NULL for rows never updated by the consent system.';

COMMENT ON COLUMN public.customers.marketing_opt_in_source IS
  'Surface that recorded the last marketing_opt_in change. Expected values: guest_signup | booking_form | preference_center | vip_profile.';
