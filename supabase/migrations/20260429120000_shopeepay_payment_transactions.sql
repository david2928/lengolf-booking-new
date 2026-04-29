-- ShopeePay payment integration for course club rentals.
--
-- Scope: course rentals only (rental_type='course'). Indoor bay club
-- rentals continue to be paid manually at the venue and never read or
-- write the new payment columns in v1.
--
-- This migration adds:
--   1. payment_transactions table — full audit trail of every gateway
--      interaction. Amounts are stored in satang (THB x 100) per
--      ShopeePay's CwS Checkout API.
--   2. New columns on club_rentals: payment_status,
--      payment_transaction_id, expires_at.
--
-- The club_rentals.status column is INTENTIONALLY UNCHANGED. Status
-- still flows reserved -> picked_up -> returned -> cancelled. Payment
-- state lives in its own column to keep the lifecycle and the cash
-- collection state orthogonal.
--
-- expires_at is populated only for course rentals where the customer
-- chose card (online prepay) AND/OR delivery_requested=true. The
-- shopeepay-cleanup cron auto-cancels rows whose expires_at is past
-- and whose payment_status is still 'unpaid'.

-- ---------------------------------------------------------------------
-- 1. payment_transactions
-- ---------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.payment_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Link back to the rental. booking_id is reserved for the (deferred)
  -- indoor-bay-payments phase.
  club_rental_id UUID REFERENCES public.club_rentals(id) ON DELETE SET NULL,
  booking_id TEXT,

  -- Gateway identity.
  gateway TEXT NOT NULL DEFAULT 'shopeepay',
  payment_reference_id TEXT NOT NULL UNIQUE,
  request_id TEXT NOT NULL,
  transaction_sn TEXT,

  -- Money (satang = THB * 100, mirrors ShopeePay's contract).
  amount INTEGER NOT NULL,
  currency TEXT NOT NULL DEFAULT 'THB',
  refunded_amount INTEGER NOT NULL DEFAULT 0,

  -- State machine. Mirrors ShopeePay's terminal states (status=3 ->
  -- success), surfaced as text for app-level readability.
  status TEXT NOT NULL DEFAULT 'pending',
    -- pending     : order created, awaiting customer action
    -- redirected  : customer was sent to ShopeePay (best-effort marker)
    -- success     : webhook OR /transaction/check confirmed status=3
    -- failed      : ShopeePay returned a terminal failure
    -- refunded    : full refund (phase 2)
    -- partially_refunded : partial refund (phase 2)

  -- Channel info populated from webhook payload.
  payment_channel INTEGER,
  payment_method TEXT,
  user_id_hash TEXT,

  -- URLs for debugging / staff handoff.
  redirect_url TEXT,
  return_url TEXT,
  platform_type TEXT,

  -- Audit. Storing the raw webhook body protects us if ShopeePay
  -- changes payload shape; we keep the source of truth verbatim.
  raw_create_response JSONB,
  raw_webhook_payload JSONB,
  error_code INTEGER,
  error_message TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  paid_at TIMESTAMPTZ,
  refunded_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_payment_txn_rental
  ON public.payment_transactions (club_rental_id);
CREATE INDEX IF NOT EXISTS idx_payment_txn_ref
  ON public.payment_transactions (payment_reference_id);
CREATE INDEX IF NOT EXISTS idx_payment_txn_sn
  ON public.payment_transactions (transaction_sn)
  WHERE transaction_sn IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_payment_txn_status
  ON public.payment_transactions (status);

-- updated_at trigger — match existing public.club_rentals trigger style.
CREATE OR REPLACE FUNCTION public.payment_transactions_set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS payment_transactions_updated_at
  ON public.payment_transactions;

CREATE TRIGGER payment_transactions_updated_at
  BEFORE UPDATE ON public.payment_transactions
  FOR EACH ROW EXECUTE FUNCTION public.payment_transactions_set_updated_at();

-- RLS: lock down. Only service_role (server-side createServerClient)
-- ever touches this table. The browser anon client must never see
-- transaction_sn / payment_reference_id since those are credentials
-- to query ShopeePay status.
ALTER TABLE public.payment_transactions ENABLE ROW LEVEL SECURITY;

-- No SELECT/INSERT/UPDATE/DELETE policies — service_role bypasses RLS
-- so server routes work; anon and authenticated roles get no access.

-- ---------------------------------------------------------------------
-- 2. club_rentals.payment_status, payment_transaction_id, expires_at
-- ---------------------------------------------------------------------

ALTER TABLE public.club_rentals
  ADD COLUMN IF NOT EXISTS payment_status TEXT NOT NULL DEFAULT 'unpaid',
  ADD COLUMN IF NOT EXISTS payment_transaction_id UUID
    REFERENCES public.payment_transactions(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ;

-- payment_status takes the same domain as payment_transactions.status,
-- but plus 'unpaid' for the default-unpaid state. Indoor rentals get
-- 'unpaid' on every insert and never change it (no cron, no UI surface).
COMMENT ON COLUMN public.club_rentals.payment_status IS
  'Payment lifecycle for course rentals only. Domain: '
  'unpaid | pending | paid | failed | refunded | partially_refunded. '
  'Indoor rentals leave this at the default ''unpaid'' and ignore it.';

COMMENT ON COLUMN public.club_rentals.expires_at IS
  'Reservation expiry for unpaid course rentals. Set on insert when '
  'paid online flow is required (delivery, or self-pickup with online '
  'pay chosen). Cleared when payment_status flips to ''paid''. The '
  'shopeepay-cleanup cron sets status=''cancelled'' on rows where '
  'expires_at < NOW() AND payment_status != ''paid''.';

-- Partial index supports the cron's hot path — cheap to scan unpaid
-- rentals with an expiry set, while leaving non-online-pay reservations
-- (where expires_at IS NULL) out of the index entirely.
CREATE INDEX IF NOT EXISTS idx_club_rentals_unpaid_expires
  ON public.club_rentals (expires_at)
  WHERE payment_status != 'paid' AND expires_at IS NOT NULL;
