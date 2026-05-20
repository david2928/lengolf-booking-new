-- ShopeePay refund support — back-office (lengolf-forms) refund flow.
--
-- Each row in payment_refunds represents one refund attempt against a
-- payment_transactions row. ShopeePay enforces uniqueness on
-- refund_reference_id, so multiple partial refunds against the same
-- payment are tracked as separate rows.
--
-- Lifecycle:
--   1. lengolf-forms inserts a 'pending' row, then calls
--      ShopeePay /v3/merchant-host/refund/create.
--   2. ShopeePay's notify webhook (handled by THIS app's webhook
--      route) flips status -> 'success' / 'failed' and updates
--      payment_transactions.refunded_amount / status accordingly.
--
-- Money is stored in satang (THB * 100) as INTEGER, matching
-- payment_transactions.amount.

CREATE TABLE IF NOT EXISTS public.payment_refunds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Parent transaction. CASCADE on delete is intentional: if we ever
  -- archive a transaction, its refunds go with it (audit trail moves
  -- together).
  payment_transaction_id UUID NOT NULL
    REFERENCES public.payment_transactions(id) ON DELETE CASCADE,

  -- Merchant-side refund reference. Must be unique per attempt.
  -- We generate as `${payment_reference_id}-R<n>` where n increments
  -- per refund on the same parent transaction.
  refund_reference_id TEXT NOT NULL UNIQUE,

  -- Per-call idempotency key sent to ShopeePay. If our server crashes
  -- mid-call, retrying with the same request_id is safe.
  request_id TEXT NOT NULL,

  -- Money. Always positive — we never store negative refund amounts.
  amount INTEGER NOT NULL CHECK (amount > 0),

  -- Required reason for audit. Free-text, min 10 chars enforced both
  -- here and in the API for defense-in-depth.
  reason TEXT NOT NULL CHECK (length(reason) >= 10),

  -- State machine. Mirrors the payment_transactions.status idiom but
  -- the refund-specific subset (no 'redirected', no 'partially_refunded').
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'success', 'failed')),

  -- Audit: who initiated. Stored as email + display name (denormalized
  -- from session) rather than FK to backoffice.allowed_users so this
  -- table doesn't depend on a different schema's lifecycle.
  initiated_by_email TEXT NOT NULL,
  initiated_by_name TEXT,

  -- ShopeePay's serial number for this refund (set on the create
  -- response if returned synchronously, or from the notify payload).
  refund_sn TEXT,

  -- Audit. Storing raw create + notify payloads protects us if
  -- ShopeePay changes payload shape.
  raw_create_response JSONB,
  raw_webhook_payload JSONB,

  -- Failure detail (set when status='failed').
  error_code INTEGER,
  error_message TEXT,

  -- Email-send dedup gate, mirrors
  -- payment_transactions.confirmation_email_sent_at. The atomic-claim
  -- UPDATE in claimAndSendRefundEmail ensures only one caller sends
  -- the customer-facing refund notification.
  refund_email_sent_at TIMESTAMPTZ,

  initiated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  refunded_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Lookup paths.
CREATE INDEX IF NOT EXISTS idx_payment_refunds_txn
  ON public.payment_refunds (payment_transaction_id);
CREATE INDEX IF NOT EXISTS idx_payment_refunds_status
  ON public.payment_refunds (status);
CREATE INDEX IF NOT EXISTS idx_payment_refunds_initiated_at
  ON public.payment_refunds (initiated_at DESC);

-- updated_at trigger — same shape as payment_transactions.
CREATE OR REPLACE FUNCTION public.payment_refunds_set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS payment_refunds_updated_at
  ON public.payment_refunds;

CREATE TRIGGER payment_refunds_updated_at
  BEFORE UPDATE ON public.payment_refunds
  FOR EACH ROW EXECUTE FUNCTION public.payment_refunds_set_updated_at();

-- RLS: same lockdown as payment_transactions. Only service_role
-- (server-side) reads or writes this table. Anon and authenticated
-- get no access (no policies = no access).
ALTER TABLE public.payment_refunds ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.payment_refunds IS
  'ShopeePay refund attempts. One row per refund call. Multiple rows '
  'per payment_transaction for partial refunds. Service-role only — '
  'never expose to anon/authenticated.';
