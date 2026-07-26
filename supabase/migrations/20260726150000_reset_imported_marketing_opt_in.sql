-- Reset bulk-imported marketing_opt_in to false — the list starts 2026-07-26.
--
-- CONTEXT: customers.marketing_opt_in showed 2,348 of 4,873 true, but cohort
-- analysis (2026-07-26) proved 100% of them are artifacts of the July 2025 CRM
-- consolidation import: 2,264 = the ENTIRE Jul-2025 import cohort (100% of it),
-- 84 = the Aug-2025 import tail, and zero trues on any customer created
-- Sep 2025 onward. Not one row was a voluntary signup — the consent feature's
-- writes were additionally broken Apr 26 – Jul 26 2026 (see
-- 20260426120000_add_marketing_opt_in_audit_columns.sql, applied late).
--
-- PR #18 explicitly deferred these rows ("Retroactive consent prompts for
-- existing silent-default customers — out of scope"). Decision by David
-- 2026-07-26: start from zero rather than carry silent-default "consent" the
-- PDPA can't defend. Any future re-consent campaign works from the POS/CRM
-- relationship, not from this flag.
--
-- GUARD: `marketing_opt_in_source IS NULL` = rows never touched by the consent
-- system. Genuine post-fix signups always carry a source (guest_signup |
-- booking_form | preference_center | vip_profile), so re-applying this
-- migration can never clobber real consent. Idempotent by the same predicate.
--
-- Audit trail: the reset itself is stamped source='import_reset' so the flip
-- is attributable in any later PDPA audit (who/when/why: this migration).

UPDATE public.customers
SET marketing_opt_in            = false,
    marketing_opt_in_changed_at = now(),
    marketing_opt_in_source     = 'import_reset'
WHERE marketing_opt_in = true
  AND marketing_opt_in_source IS NULL;

COMMENT ON COLUMN public.customers.marketing_opt_in_source IS
  'Surface that recorded the last marketing_opt_in change. Expected values: guest_signup | booking_form | preference_center | vip_profile | import_reset (one-time 2026-07-26 zeroing of the Jul/Aug-2025 CRM-import bulk trues). NULL = never touched by the consent system.';
