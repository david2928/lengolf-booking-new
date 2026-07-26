-- Declare, per promotion, which POS discount pays for it.
--
-- The booking flow's quote is a promise: the customer reads a total, and the
-- money actually leaves through the POS, where a staff member picks a
-- `pos.discounts` row by hand. Which POS row corresponds to which flow
-- promotion has never been written down anywhere — it was human convention,
-- and it held because exactly one auto-apply promotion existed.
--
-- That stops holding with two. `lib/cost-calculator.ts` now selects a SINGLE
-- winning offer (offers never stack, owner rule 2026-07-25), so when two
-- auto-apply rows are both eligible the flow silently picks one. If staff
-- apply the other, the two sides disagree and nothing in either system
-- notices — the quote says one thing, the till does another, and the only
-- evidence is a customer arguing about a total.
--
-- `pos_discount_id` turns that convention into data. The staff LINE note built
-- in `app/api/bookings/create/route.ts` reads it off the WINNING promotion and
-- prints `[apply POS discount "<title>"]`, so the notification names the row to
-- select instead of relying on staff to remember the rule.
--
-- Nullable on purpose. NULL means "the pairing has not been confirmed", NOT
-- "no discount is needed" — the note simply carries no instruction, which is
-- exactly today's behaviour. Every existing row stays NULL here; see the
-- separate note on `54c08739` below.
--
-- No ON DELETE clause, so the default (NO ACTION) applies and deleting a
-- `pos.discounts` row that a promotion still points at FAILS. That is
-- deliberate: ON DELETE SET NULL would silently un-pair a live offer and
-- quietly return us to "staff remember the rule", which is the failure this
-- column exists to remove. A loud error is the correct outcome.

alter table public.promotions
  add column if not exists pos_discount_id uuid references pos.discounts(id);

comment on column public.promotions.pos_discount_id is
  'The pos.discounts row staff must apply at the till to honour this promotion. '
  'NULL means the pairing is unconfirmed, not that no POS discount is required. '
  'Named in the staff LINE note when this promotion wins the booking flow''s '
  'single-offer selection. '
  'No ON DELETE clause on purpose: deleting a pos.discounts row a promotion '
  'still points at should fail loudly rather than silently un-pair a live offer.';

-- DELIBERATELY NOT SET on the new-customer B1G1 (54c08739-bf14-4c95-9ced-6883d8a6ea7f).
--
-- The obvious candidate is the always-on POS row "Buy 1 Get 1"
-- (5ea97882-5a6a-42ea-b149-f377a6296d08, description "New Customers Only"),
-- and both are 100%-off-one-item so the money would come out identical. It is
-- still a financial mapping, and it is not being guessed into production
-- here — it needs owner confirmation first. Until then that promotion behaves
-- exactly as it does today: its staff note names the offer and no POS
-- instruction is appended.
