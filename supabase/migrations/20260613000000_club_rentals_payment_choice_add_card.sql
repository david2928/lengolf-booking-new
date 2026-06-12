-- Widen club_rentals.payment_method_chosen for the Opn Payments cutover.
--
-- New value: 'online_card' — the customer paid (or chose to pay) by card
-- through the Opn inline checkout at /payment/checkout. The existing
-- 'online_shopeepay' value stays valid for the parallel-run window
-- (historic rows + the still-in-tree ShopeePay flow) and is removed only
-- at ShopeePay decommission, in its own migration.
--
-- Keep in lockstep with VALID_PAYMENT_CHOICES in
-- app/api/clubs/reserve/route.ts and the payment_method_chosen literal in
-- app/[locale]/course-rental/page.tsx (rule documented on the original
-- constraint migration 20260526120000: allowlist + CHECK change in the
-- same PR).
--
-- DROP + ADD is wrapped in a DO block and re-runnable: the constraint is
-- recreated with the widened domain regardless of which version (or
-- neither) currently exists.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.constraint_column_usage
    WHERE table_schema = 'public'
      AND table_name = 'club_rentals'
      AND constraint_name = 'club_rentals_payment_method_chosen_check'
  ) THEN
    ALTER TABLE public.club_rentals
      DROP CONSTRAINT club_rentals_payment_method_chosen_check;
  END IF;

  ALTER TABLE public.club_rentals
    ADD CONSTRAINT club_rentals_payment_method_chosen_check
      CHECK (
        payment_method_chosen IS NULL
        OR payment_method_chosen IN ('online_card', 'online_shopeepay', 'cash_at_pickup')
      );
END
$$;

COMMENT ON COLUMN public.club_rentals.payment_method_chosen IS
  'Customer-selected payment method at booking time. '
  'Domain: ''online_card'' (Opn inline card checkout) | '
  '''online_shopeepay'' (legacy ShopeePay prepay flow, parallel-run window) | '
  '''cash_at_pickup'' (settle on arrival) | NULL (legacy rows + indoor rentals). '
  'Drives the LINE staff message and the email "what happens next" copy. '
  'Distinct from payment_transactions.payment_method which captures the '
  'gateway-reported channel actually used.';
