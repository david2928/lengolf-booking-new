-- public.meta_capi_pending exposes raw booking_email, customer_email, phone and
-- customer_name. The companion migration 20260805120000 revoked anon and
-- authenticated but not google_ads_readonly, which had picked up SELECT from
-- DEFAULT PRIVILEGES on the public schema -- a PII surface nobody chose.
--
-- That role exists for the Google Ads ETL and has no business reading customer
-- contact details. Caught during the Task 8 review; the lesson is that
-- REVOKE ... FROM anon, authenticated is NOT sufficient on this database,
-- because default privileges hand SELECT to other roles too. Any future view in
-- public that carries PII needs the same treatment.

REVOKE ALL ON public.meta_capi_pending FROM google_ads_readonly;
REVOKE ALL ON marketing.meta_capi_uploads FROM google_ads_readonly;

-- Stop future objects in public from defaulting SELECT to this role.
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE SELECT ON TABLES FROM google_ads_readonly;
