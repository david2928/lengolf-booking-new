-- B1G1 "free hour" credit: public wrappers over backoffice.credit_grants.
--
-- Why this exists: when a new customer books UNDER 2 hours, the quote tells
-- them "Book 2 hours to get 1 hour free! Or redeem your free hour within
-- 7 days" (lib/cost-calculator.ts) and the staff LINE note prints "(1 free hr
-- to redeem within 7 days, expires <date>)". Until now nothing recorded that
-- grant — the promise was made and dropped. Staff had no ledger to redeem
-- against. These two functions let /api/bookings/create write the grant and
-- let the booking flow read the balance back.
--
-- The 2-hour-or-longer path is untouched: there the free hour is consumed in
-- the booking itself and priced out of the bay rate, so there is nothing to
-- carry forward.
--
-- NOTHING about backoffice.credit_grants changes here — not its columns, not
-- its CHECKs, not its indexes. The table is shared with the lengolf-forms
-- backoffice app (which owns redemption via backoffice.redeem_credits) and it
-- was already designed for exactly this feature:
--
--   * reason = 'b1g1_new_customer' is already in the reason CHECK and has zero
--     rows — it was reserved for this.
--   * credit_grants_one_b1g1_per_customer, a UNIQUE index on
--     (customer_id, reason) WHERE reason = 'b1g1_new_customer', already
--     enforces one-grant-per-customer-ever. We lean on it for idempotency
--     rather than inventing a second mechanism: a retried booking-create
--     cannot double-grant, and the conflict is reported to the caller as
--     "already granted", not as an error.
--
-- source = 'campaign' is deliberate. The source CHECK allows only
-- manual | pos | campaign; 'manual' would be a lie (no staff member did this)
-- and 'pos' would be a lie (no transaction). Altering a CHECK on a table
-- shared with lengolf-forms just to add a 'booking_flow' label is not worth
-- the coordination — 'campaign' is the honest one of the three.

-- ---------------------------------------------------------------------------
-- Write path
-- ---------------------------------------------------------------------------
create or replace function public.grant_b1g1_new_customer_credit(
  p_customer_id uuid,
  p_quantity    numeric,
  p_expires_at  timestamptz,
  p_note        text default null,
  p_granted_by  text default 'booking-system:b1g1'
)
returns table (grant_id uuid, created boolean)
language plpgsql
security definer
set search_path to 'public', 'backoffice'
as $$
declare
  v_grant_id uuid;
begin
  insert into backoffice.credit_grants (
    customer_id,
    credit_type,
    quantity,
    expires_at,
    reason,
    note,
    source,
    granted_by
  )
  values (
    p_customer_id,
    'sim_hour',
    p_quantity,
    p_expires_at,
    'b1g1_new_customer',
    p_note,
    'campaign',
    p_granted_by
  )
  -- Arbiter is credit_grants_one_b1g1_per_customer. The WHERE clause is what
  -- makes the partial index inferrable; without it Postgres errors at runtime
  -- with "no unique or exclusion constraint matching the ON CONFLICT spec".
  on conflict (customer_id, reason) where reason = 'b1g1_new_customer'
  do nothing
  returning id into v_grant_id;

  if v_grant_id is not null then
    return query select v_grant_id, true;
    return;
  end if;

  -- Conflict: this customer already holds their one B1G1 grant. That is a
  -- success for the caller (booking-create retry, or a second sub-2h booking
  -- by the same new customer), so we return the existing grant rather than
  -- raising. Deliberately NOT topping up the quantity or pushing the expiry
  -- out — one free hour per customer, ever, is the whole point of the index.
  select g.id
    into v_grant_id
  from backoffice.credit_grants g
  where g.customer_id = p_customer_id
    and g.reason = 'b1g1_new_customer';

  return query select v_grant_id, false;
end;
$$;

comment on function public.grant_b1g1_new_customer_credit(uuid, numeric, timestamptz, text, text) is
  'Records the B1G1 new-customer free hour promised by a sub-2-hour booking quote. Idempotent via credit_grants_one_b1g1_per_customer: a repeat call returns the existing grant with created=false. Called by /api/bookings/create.';

-- ---------------------------------------------------------------------------
-- Read path
-- ---------------------------------------------------------------------------
-- Thin wrapper over backoffice.get_credit_balance. Nothing in this repo calls
-- .schema('backoffice') and both Supabase clients are pinned to `public`, so a
-- public SECURITY DEFINER wrapper is the established pattern here — see
-- public.get_customer_packages over backoffice.get_customer_packages.
--
-- The inner function is itself STABLE SECURITY DEFINER and already filters to
-- unexpired grants with remaining > 0, ordered soonest-expiry-first. This
-- wrapper adds no logic; it only moves the call into a schema the app can
-- reach.
create or replace function public.get_customer_credit_balance(
  p_customer_id uuid,
  p_credit_type text default 'sim_hour'
)
returns table (
  grant_id   uuid,
  remaining  numeric,
  expires_at timestamptz,
  reason     text
)
language sql
stable
security definer
set search_path to 'public', 'backoffice'
as $$
  select b.grant_id, b.remaining, b.expires_at, b.reason
  from backoffice.get_credit_balance(p_customer_id, p_credit_type) b;
$$;

comment on function public.get_customer_credit_balance(uuid, text) is
  'Public wrapper over backoffice.get_credit_balance. Per-grant remaining credits for a customer, unexpired only, soonest expiry first. Read-only: customers cannot self-redeem, staff redeem via lengolf-forms.';

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------
-- CREATE FUNCTION grants EXECUTE to PUBLIC by default, which on a Supabase
-- project means anon and authenticated too. Revoke, then grant only to
-- service_role — the role behind createAdminClient(), which is what every
-- server route in this repo uses. This mirrors public.get_customer_packages,
-- whose ACL is exactly {postgres=X, service_role=X}.
--
-- No anon/authenticated grant on the READ wrapper either, even though it looks
-- harmless: it would put a customer_id -> credit-balance oracle on the public
-- PostgREST surface, callable with any uuid, from the browser. The balance is
-- fetched by /api/user/credit-balance, which resolves customer_id from the
-- NextAuth session server-side, so the browser never needs the RPC.
revoke all on function public.grant_b1g1_new_customer_credit(uuid, numeric, timestamptz, text, text) from public;
revoke all on function public.get_customer_credit_balance(uuid, text) from public;

grant execute on function public.grant_b1g1_new_customer_credit(uuid, numeric, timestamptz, text, text) to service_role;
grant execute on function public.get_customer_credit_balance(uuid, text) to service_role;
