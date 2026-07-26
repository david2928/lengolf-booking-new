-- B1G1 grant: a vanished conflict row must RAISE, not report success.
--
-- 20260725170608_b1g1_credit_grant_wrappers.sql is already applied to
-- production, so this is a `create or replace` on top of it rather than an edit
-- to the applied file. Nothing else about the function changes: same signature,
-- same insert, same idempotency via credit_grants_one_b1g1_per_customer, same
-- (grant_id, created) result shape.
--
-- The bug. On conflict the function looked the existing grant back up:
--
--     select g.id into v_grant_id
--     from backoffice.credit_grants g
--     where g.customer_id = p_customer_id and g.reason = 'b1g1_new_customer';
--
--     return query select v_grant_id, false;
--
-- `select ... into` in plpgsql does NOT raise on no rows — it leaves the
-- variable NULL. So if the conflicting row was gone by the time that SELECT ran
-- (deleted by staff, rolled back concurrently), the function returned
-- (null, false). `grantB1G1NewCustomerCredit` maps that to
-- `{ok: true, grantId: null, created: false}` and /api/bookings/create logs it
-- at console.log as "Already held". A grant that does not exist, reported as
-- normal traffic, at info level. The customer keeps the promise printed on
-- their staff note and there is nothing in the ledger to redeem.
--
-- (null, false) is not a state any caller can act on, so the honest answer is
-- an exception: the wrapper's error path already exists, already logs at error
-- level with the customer id and booking id, and already declines to fail the
-- booking over it.
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

  -- The insert conflicted, so a row existed a moment ago and does not now.
  -- Returning (null, false) here would report a dropped grant as ordinary
  -- "already held" traffic. Raise instead, so the caller's error path runs.
  if v_grant_id is null then
    raise exception
      'b1g1 grant conflicted for customer % but no b1g1_new_customer row could be read back',
      p_customer_id
      using errcode = 'no_data_found';
  end if;

  return query select v_grant_id, false;
end;
$$;

comment on function public.grant_b1g1_new_customer_credit(uuid, numeric, timestamptz, text, text) is
  'Records the B1G1 new-customer free hour promised by a sub-2-hour booking quote. Idempotent via credit_grants_one_b1g1_per_customer: a repeat call returns the existing grant with created=false. Raises if the conflicting grant cannot be read back, rather than reporting a dropped grant as success. Called by /api/bookings/create.';

-- CREATE OR REPLACE leaves ownership and permissions unchanged, so the ACL the
-- original migration set (service_role only, the role behind
-- createAdminClient()) already survives this. Restated anyway: it is idempotent,
-- it costs nothing, and it keeps the intended ACL next to the definition rather
-- than only in a file two migrations back. Note the deliberate absence of an
-- anon/authenticated grant — this function mints financial entitlement.
revoke all on function public.grant_b1g1_new_customer_credit(uuid, numeric, timestamptz, text, text) from public;
grant execute on function public.grant_b1g1_new_customer_credit(uuid, numeric, timestamptz, text, text) to service_role;
