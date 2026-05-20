-- 20260520000000_add_opn_fields_to_payment_transactions.sql
-- Add Opn-Payments-specific columns to the existing payment_transactions
-- table. All columns are nullable / defaulted so existing ShopeePay rows
-- keep working unchanged. Idempotent -- safe to re-run.

ALTER TABLE public.payment_transactions
  ADD COLUMN IF NOT EXISTS gateway_charge_id TEXT,
  ADD COLUMN IF NOT EXISTS gateway_token_id TEXT,
  ADD COLUMN IF NOT EXISTS auth_code TEXT,
  ADD COLUMN IF NOT EXISTS failure_code TEXT,
  ADD COLUMN IF NOT EXISTS failure_message TEXT,
  ADD COLUMN IF NOT EXISTS card_brand TEXT,
  ADD COLUMN IF NOT EXISTS card_last4 TEXT,
  ADD COLUMN IF NOT EXISTS is_3ds BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS transaction_fee_rate NUMERIC(5,3),
  ADD COLUMN IF NOT EXISTS transaction_vat_rate NUMERIC(5,3);

-- Critical: webhook handler joins on gateway_charge_id every callback.
CREATE INDEX IF NOT EXISTS payment_transactions_gateway_charge_id_idx
  ON public.payment_transactions (gateway_charge_id);
