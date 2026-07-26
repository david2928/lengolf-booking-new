-- The weekday off-peak Buy 1 Get 1 (owner-confirmed 2026-07-26).
--
-- Monday to Thursday, sessions STARTING before 16:00 Bangkok time: one free
-- hour on the bay rate. Same mechanics as the existing B1G1 — the free hour is
-- `min(free_hours, duration - 1)`, priced at the TAIL of the booking so it
-- prorates across the 14:00 and 17:00 rate boundaries. 16:00 is deliberately
-- NOT one of those boundaries; it is an ordinary clock time and the condition
-- evaluator compares it as one.
--
-- =====================================================================
-- INSERTED INACTIVE. DO NOT SET is_active = true UNTIL THE INTEGRATION
-- BRANCH HAS REACHED main AND IS DEPLOYED.
-- =====================================================================
--
-- This is not caution, it is arithmetic. Production currently runs `main`,
-- whose `lib/cost-calculator.ts` (verified against origin/main) differs from
-- this branch in two ways that compound:
--
--   1. It reads ONE condition key, `promo.conditions?.new_customer_only`, and
--      ignores everything else in the jsonb. `days_of_week` and
--      `start_time_before` below would not be read at all, so the offer would
--      apply to every customer, on every day, at every hour.
--   2. Its promotion loop pushes a discount for EVERY match with no
--      single-winner selection, so this row would STACK on the new-customer
--      B1G1 rather than compete with it.
--
-- `/api/promotions/applicable` filters only on `is_active` + `auto_apply`, so
-- an active row is fetched by prod the moment it is written. Together those
-- turn a ฿1,500 two-hour booking into a ฿0 quote for a new customer. The row
-- is inert only because `is_active = false` — activating it is a POST-DEPLOY
-- step, gated on this branch reaching main.
--
-- The id is chosen, not generated. Ties in the flow's offer selection break on
-- the LOWEST promotion id, and this row is worth exactly the same as the
-- new-customer B1G1 for a new customer booking Mon-Thu before 16:00 (both
-- waive one hour off the same tail). Sorting ABOVE '54c08739...' makes the
-- existing new-customer row keep winning those ties, which keeps the free-hour
-- expiry text and the `b1g1_new_customer` credit grant attached to the
-- promotion that has always carried them. The customer is unaffected either
-- way: one free hour, never two.
--
-- `valid_from` / `valid_until` mirror the paired POS discount's window exactly
-- (2026-07-01 00:00:00 through 2026-08-31 23:59:59 Bangkok, stored UTC).
-- NOTE: nothing currently READS those columns for auto-apply promotions —
-- `/api/promotions/applicable` filters on `is_active` and `auto_apply` only.
-- They are recorded here so the row documents its own window, but they do not
-- switch the offer off. Deactivating at the end of the window is a manual
-- `is_active = false`.
--
-- `is_customer_facing = false` keeps this out of the LIFF promotions carousel,
-- which selects on `is_active` + `is_customer_facing`. Running the auto-apply
-- discount and publishing a promo card are two separate decisions, and this row
-- carries no image_url, badge or terms to render as one.

insert into public.promotions (
  id,
  title_en,
  title_th,
  description_en,
  description_th,
  promotion_type,
  free_hours,
  applies_to,
  auto_apply,
  conditions,
  valid_from,
  valid_until,
  pos_discount_id,
  is_active,
  is_customer_facing,
  display_order
) values (
  'b7e6f4a2-3c19-4d5e-8a7b-2f9c1d0e6a34',
  'Weekday Buy 1 Get 1 Free',
  'ซื้อ 1 แถม 1 วันธรรมดา',
  'One free hour on the bay rate, Monday to Thursday, for sessions starting before 16:00.',
  'ฟรี 1 ชั่วโมงสำหรับค่าเบย์ วันจันทร์ถึงวันพฤหัสบดี สำหรับการเล่นที่เริ่มก่อน 16:00 น.',
  'bogo',
  1,
  'bay_rate',
  true,
  -- Read by lib/promotion-conditions.ts. Both keys are on its supported list;
  -- any key NOT on that list denies the promotion outright, so a typo here
  -- switches the offer off rather than handing it to everyone.
  --   days_of_week      the booking's day must be one of these
  --   start_time_before the booking must START earlier than this time
  -- Both are evaluated against the BOOKING's date and start time, never the
  -- time the customer happens to be browsing.
  '{"days_of_week": ["mon", "tue", "wed", "thu"], "start_time_before": "16:00"}'::jsonb,
  '2026-06-30 17:00:00+00',
  '2026-08-31 16:59:59+00',
  '64a085d2-64a8-4a12-9c5f-0317203ed750',
  false,
  false,
  2
)
-- The id is fixed, not generated, so a replay of this file against a database
-- that already holds the row would abort the whole `supabase db push` on a
-- primary-key violation — including every migration queued behind it. The row
-- is a seed, not a schema change: it either exists with these values or it does
-- not exist at all, so "already there" is success, not a conflict.
--
-- DO NOTHING rather than DO UPDATE deliberately. Production's copy of this row
-- is the live definition of a customer-facing offer, and its `is_active` in
-- particular is toggled by hand at campaign start and end. A DO UPDATE here
-- would silently re-deactivate a running promotion on the next unrelated push.
on conflict (id) do nothing;
