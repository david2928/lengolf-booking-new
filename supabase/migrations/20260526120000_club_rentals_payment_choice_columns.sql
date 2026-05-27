-- Customer-facing booking choices, surfaced from the form and stored as
-- their own columns. Previously the booking form was concatenating
-- "Payment: ..." and "Contact via: ..." prefix lines into the customer's
-- free-form `notes` column before saving — that blob then leaked into
-- the customer confirmation email's Notes section, which looks broken
-- (the customer doesn't need to be told what payment method they just
-- used or what contact channel they selected).
--
-- These columns were initially applied via Supabase MCP during
-- production-cred UAT (2026-05-24) to unblock testing; this migration
-- file backfills the repo so a fresh database (CI, branch-preview,
-- onboarding, restore-from-backup) gets the same schema. IF NOT EXISTS
-- makes it safe to re-apply against the already-modified prod DB.
--
-- Domain:
--   payment_method_chosen ∈ {online_shopeepay, cash_at_pickup, NULL (legacy)}
--   contact_preference    ∈ {line, email, whatsapp, NULL (legacy)}
--
-- CHECK constraints are belt-and-suspenders against bad inserts —
-- the route at app/api/clubs/reserve/route.ts already validates the
-- domain via VALID_PAYMENT_CHOICES + VALID_CONTACT_PREFS allowlists,
-- but a CHECK ensures a future caller (LIFF flow, backoffice, etc.)
-- can't silently land an unknown value. If we add new enum values,
-- update both the allowlist + the CHECK in the same PR.

ALTER TABLE public.club_rentals
  ADD COLUMN IF NOT EXISTS payment_method_chosen TEXT,
  ADD COLUMN IF NOT EXISTS contact_preference TEXT;

-- Conditional constraint adds — wrapped in DO blocks so re-running
-- against a DB that already has them is a no-op (ADD CONSTRAINT does
-- not support IF NOT EXISTS in PostgreSQL).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.constraint_column_usage
    WHERE table_schema = 'public'
      AND table_name = 'club_rentals'
      AND constraint_name = 'club_rentals_payment_method_chosen_check'
  ) THEN
    ALTER TABLE public.club_rentals
      ADD CONSTRAINT club_rentals_payment_method_chosen_check
        CHECK (
          payment_method_chosen IS NULL
          OR payment_method_chosen IN ('online_shopeepay', 'cash_at_pickup')
        );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.constraint_column_usage
    WHERE table_schema = 'public'
      AND table_name = 'club_rentals'
      AND constraint_name = 'club_rentals_contact_preference_check'
  ) THEN
    ALTER TABLE public.club_rentals
      ADD CONSTRAINT club_rentals_contact_preference_check
        CHECK (
          contact_preference IS NULL
          OR contact_preference IN ('line', 'email', 'whatsapp')
        );
  END IF;
END
$$;

COMMENT ON COLUMN public.club_rentals.payment_method_chosen IS
  'Customer-selected payment method at booking time. '
  'Domain: ''online_shopeepay'' (triggers ShopeePay prepay flow) | '
  '''cash_at_pickup'' (settle on arrival) | NULL (legacy rows + indoor rentals). '
  'Drives the LINE staff message and the email "what happens next" copy. '
  'Distinct from payment_transactions.payment_method which captures the '
  'gateway-reported channel actually used (e.g. card vs wallet vs SPayLater).';

COMMENT ON COLUMN public.club_rentals.contact_preference IS
  'Customer-selected contact channel. '
  'Domain: ''line'' | ''email'' | ''whatsapp'' | NULL (legacy rows). '
  'Threaded into the customer confirmation email''s "we''ll reach out via X" '
  'copy and surfaced to staff in the LINE notification. Stored once at '
  'booking time; not updated if the customer later prefers a different channel.';
