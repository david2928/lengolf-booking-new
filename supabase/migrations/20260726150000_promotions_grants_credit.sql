-- Let a promotion declare whether winning it mints a free-hour credit.
--
-- `promotion_type = 'bogo'` used to be a synonym for one specific offer: the
-- new-customer Buy 1 Get 1 (54c08739-bf14-4c95-9ced-6883d8a6ea7f), which grants
-- a `b1g1_new_customer` credit redeemable within 7 days. Two code paths were
-- written against that synonym:
--
--   1. `lib/cost-calculator.ts` printed "Or redeem your free hour within 7 days"
--      on EVERY sub-2-hour bogo, customer-facing.
--   2. `app/api/bookings/create/route.ts` fired the credit grant on
--      `promotion_type === 'bogo' && free_hours`.
--
-- The weekday off-peak B1G1 (b7e6f4a2-3c19-4d5e-8a7b-2f9c1d0e6a34) is a second
-- `bogo` row and grants no credit. Under (1) a returning customer booking one
-- hour Mon-Thu would read a promise of a free hour that nothing ever creates,
-- and could not discover it was missing because the credit wallet is read-only.
-- Under (2) the grant only stays correct while the uuid tie-break happens to
-- keep the new-customer row winning every tie the two rows can enter; change
-- either row's `free_hours`, or deactivate the new-customer row at campaign
-- end, and the weekday promotion starts minting `b1g1_new_customer` credits.
--
-- Neither is a property of the TYPE, so neither belongs in a type check. This
-- column states the fact directly, per row, and both code paths now read it:
-- the calculator emits the redeem clause only when the winning promotion grants
-- a credit, and the route gates the grant on the same column.
--
-- Default FALSE, not null. A new promotion row minting credits by accident is
-- money leaving; a new row that forgets to declare it simply behaves like an
-- ordinary discount, which is visible and free to correct. Same "unknown means
-- no" posture as `lib/promotion-conditions.ts`.

alter table public.promotions
  add column if not exists grants_credit boolean not null default false;

comment on column public.promotions.grants_credit is
  'Winning this promotion mints a free-hour credit (backoffice.credit_grants, '
  'reason b1g1_new_customer) when the booking is too short to take the free '
  'hour in-session. Gates BOTH the customer-facing "redeem within 7 days" copy '
  'in lib/cost-calculator.ts and the grant itself in /api/bookings/create. '
  'FALSE means the offer is worth only what it discounts on this booking. '
  'Never infer this from promotion_type: two distinct bogo rows exist and only '
  'one of them grants.';

-- The new-customer B1G1 is the row both code paths were written for, so TRUE
-- here is what keeps its behaviour byte-identical to today: same copy, same
-- grant, same set of bookings.
update public.promotions
   set grants_credit = true
 where id = '54c08739-bf14-4c95-9ced-6883d8a6ea7f';

-- The weekday off-peak B1G1 grants nothing. Its free hour exists only inside a
-- booking of 2 hours or more; below that the offer is advice, not a debt. Stated
-- explicitly rather than left to the column default so the row reads as a
-- decision instead of an omission.
update public.promotions
   set grants_credit = false
 where id = 'b7e6f4a2-3c19-4d5e-8a7b-2f9c1d0e6a34';

-- Both rows must exist by now: 54c08739 predates this branch and b7e6f4a2 is
-- inserted by 20260726140100. A silent no-op here would leave the new-customer
-- B1G1 at the FALSE default, which drops the redeem clause and the credit grant
-- from a live offer without a single error anywhere. Fail the migration instead.
do $$
declare
  v_missing text;
begin
  select string_agg(id::text, ', ')
    into v_missing
    from (values
      ('54c08739-bf14-4c95-9ced-6883d8a6ea7f'::uuid),
      ('b7e6f4a2-3c19-4d5e-8a7b-2f9c1d0e6a34'::uuid)
    ) as expected(id)
   where not exists (select 1 from public.promotions p where p.id = expected.id);

  if v_missing is not null then
    raise exception
      'promotions.grants_credit was not set: promotion row(s) % are missing. '
      'Re-run 20260726140100_weekday_offpeak_bogo_promotion.sql, or restore the '
      'new-customer B1G1, before applying this migration.', v_missing;
  end if;
end
$$;
