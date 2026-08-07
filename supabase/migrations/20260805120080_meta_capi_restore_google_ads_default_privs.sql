-- Revert an out-of-scope change. Migration 20260805120010 revoked the PII grant
-- on the two new Meta CAPI objects (in scope, correct) but ALSO did:
--   ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
--     REVOKE SELECT ON TABLES FROM google_ads_readonly;
-- That changes grant behaviour for EVERY future table in public and affects a
-- different system (lengolf-ads-etl). It does not belong in a Meta CAPI change:
-- the trap springs later, when someone adds a table the ads ETL needs and gets
-- "permission denied" with the cause buried in an unrelated migration.
--
-- The object-level revokes stay -- those were the actual PII fix.
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  GRANT SELECT ON TABLES TO google_ads_readonly;
