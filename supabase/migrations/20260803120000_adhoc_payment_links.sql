-- Staff-issued ad-hoc ShopeePay payment links (deposits for private parties,
-- corporate events, custom quotes). Distinct from course-rental payments:
-- no rental, no order, no package.
--
-- Split of responsibility, mirroring the existing rental payment link:
--   lengolf-forms  : staff UI, inserts the payment_links row (the amount lives here)
--   this app       : mints the ShopeePay order, owns /p/<code>, owns the paid flip
-- ShopeePay knows exactly one notify URL, so the webhook stays here and grows a
-- branch rather than forking.
--
-- The amount is IMMUTABLE once a link is minted. To change it, cancel and create
-- a new link. That deliberately avoids the supersede-stale-payment machinery the
-- order-level rental link needs (booking-new re-prices per line and would
-- otherwise hand back a charge at the old amount).

CREATE TABLE IF NOT EXISTS public.payment_links (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- PL-YYYYMMDD-XXXX. Globally unique and disjoint from club_rentals.rental_code
  -- (CR-) and club_rental_orders.order_code (CRO-), so /p/<code> can dispatch on
  -- the prefix alone.
  link_code         TEXT NOT NULL UNIQUE,

  -- RESTRICT, not SET NULL (which is what club_rental_id uses): a paid link is a
  -- financial record and orphaning it is worse than blocking a customer delete.
  -- customer_name is a snapshot so the row stays readable after a rename.
  -- NOTE: a future customer-merge flow must UPDATE customer_id, not delete.
  customer_id       UUID NOT NULL REFERENCES public.customers(id) ON DELETE RESTRICT,
  customer_name     TEXT NOT NULL,

  description       TEXT NOT NULL,

  -- Satang (THB * 100), matching payment_transactions.amount. Immutable.
  amount            INTEGER NOT NULL,
  currency          TEXT NOT NULL DEFAULT 'THB',

  --   draft     : row created by forms, no gateway order yet
  --   pending   : gateway order minted, customer can pay
  --   paid      : webhook or /transaction/check confirmed
  --   cancelled : staff cancelled before payment
  --   expired   : validity lapsed unpaid (cron)
  --   failed    : gateway rejected, or never reached the gateway
  status            TEXT NOT NULL DEFAULT 'draft',

  expires_at        TIMESTAMPTZ,
  paid_at           TIMESTAMPTZ,
  cancelled_at      TIMESTAMPTZ,

  created_by        TEXT NOT NULL,   -- staff email (backoffice.allowed_users)
  cancelled_by      TEXT,

  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- payment_transactions ships with ZERO CHECK constraints. That is a
  -- pre-existing gap, not a precedent to copy: parity with a broken sibling is
  -- not a justification when the new code's risk profile is higher, and this
  -- table carries a staff-typed amount with no server-authoritative source.
  CONSTRAINT payment_links_status_chk CHECK (
    status IN ('draft','pending','paid','cancelled','expired','failed')
  ),
  -- THB 1 .. THB 200,000. Mirrors the API-layer bound so a service-role write
  -- that bypasses the route still cannot create an absurd charge.
  CONSTRAINT payment_links_amount_chk CHECK (amount BETWEEN 100 AND 20000000),
  CONSTRAINT payment_links_description_chk CHECK (char_length(description) BETWEEN 1 AND 200),
  CONSTRAINT payment_links_code_chk CHECK (link_code ~ '^PL-[0-9]{8}-[A-Z0-9]{4}$')
);

CREATE INDEX IF NOT EXISTS idx_payment_links_status_created
  ON public.payment_links (status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_payment_links_customer
  ON public.payment_links (customer_id);

-- Cron hot path, mirroring idx_club_rentals_unpaid_expires.
CREATE INDEX IF NOT EXISTS idx_payment_links_pending_expires
  ON public.payment_links (expires_at)
  WHERE status = 'pending' AND expires_at IS NOT NULL;

-- updated_at trigger -- match existing public.payment_transactions trigger style.
CREATE OR REPLACE FUNCTION public.payment_links_set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS payment_links_updated_at ON public.payment_links;

CREATE TRIGGER payment_links_updated_at
  BEFORE UPDATE ON public.payment_links
  FOR EACH ROW EXECUTE FUNCTION public.payment_links_set_updated_at();

-- RLS: lock down, exactly like payment_transactions. No policies at all --
-- service_role bypasses RLS, and nothing else may ever read this table.
-- The explicit REVOKE is belt-and-braces against a future default-privilege change.
ALTER TABLE public.payment_links ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.payment_links FROM anon, authenticated;

-- Code generator, mirroring public.generate_rental_code() including its
-- retry-on-collision loop and search_path pinning.
CREATE OR REPLACE FUNCTION public.generate_payment_link_code()
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
DECLARE
  v_code TEXT;
  v_exists BOOLEAN;
BEGIN
  LOOP
    v_code := 'PL-' || to_char(now(), 'YYYYMMDD') || '-' || upper(substr(md5(random()::text), 1, 4));
    SELECT EXISTS(SELECT 1 FROM public.payment_links WHERE link_code = v_code) INTO v_exists;
    EXIT WHEN NOT v_exists;
  END LOOP;
  RETURN v_code;
END;
$function$;

-- ---------------------------------------------------------------------------
-- payment_transactions: attach the ad-hoc subject
-- ---------------------------------------------------------------------------

-- RESTRICT (unlike club_rental_id's SET NULL): links are never hard-deleted, and
-- a delete attempt against a link carrying charges should fail loudly.
ALTER TABLE public.payment_transactions
  ADD COLUMN IF NOT EXISTS payment_link_id UUID
    REFERENCES public.payment_links(id) ON DELETE RESTRICT;

CREATE INDEX IF NOT EXISTS idx_payment_txn_link
  ON public.payment_transactions (payment_link_id)
  WHERE payment_link_id IS NOT NULL;

-- BACKSTOP for the "one live charge per link" invariant. Application code
-- SELECTs before minting, but SELECT-then-INSERT is a TOCTOU trap under
-- concurrency; this index is the actual invariant. Catch 23505 -> HTTP 409.
--
-- SCOPE NOTE (this is the foot-gun CLAUDE.md calls out): the predicate covers
-- BOTH 'pending' AND 'redirected'. Every path that kills a live charge (staff
-- cancel, cron expiry) MUST filter on the same status set -- the same set
-- expireReservationPayment uses. Narrowing a killer to just 'pending' would
-- leave a 'redirected' row alive and collide on the next legitimate INSERT.
CREATE UNIQUE INDEX IF NOT EXISTS payment_txn_one_live_per_link_uidx
  ON public.payment_transactions (payment_link_id)
  WHERE payment_link_id IS NOT NULL AND status IN ('pending','redirected');

-- A transaction belongs to at most one subject. '<= 1' rather than '= 1'
-- because club_rental_id is ON DELETE SET NULL, so an audit row can legitimately
-- end up with neither. Verified against production: all 61 existing rows have
-- club_rental_id set, so num_nonnulls = 1 for every one of them.
ALTER TABLE public.payment_transactions
  DROP CONSTRAINT IF EXISTS payment_txn_single_subject_chk;

ALTER TABLE public.payment_transactions
  ADD CONSTRAINT payment_txn_single_subject_chk
  CHECK (num_nonnulls(club_rental_id, payment_link_id) <= 1);

COMMENT ON TABLE public.payment_links IS
  'Staff-issued ad-hoc ShopeePay payment links (event deposits, custom charges). '
  'Written by lengolf-forms; minted and marked paid by lengolf-booking-new.';

COMMENT ON COLUMN public.payment_transactions.payment_link_id IS
  'Set for staff-issued ad-hoc payment links (public.payment_links). Mutually '
  'exclusive with club_rental_id -- see payment_txn_single_subject_chk.';
