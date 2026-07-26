-- An unlimited package was never marked expired, so 67 customers were quoted ฿0.
--
-- `package_status` short-circuited on the unlimited arm before it ever looked at
-- the expiry date:
--
--     CASE
--         WHEN pt.hours IS NULL THEN 'unlimited'            <-- returns here
--         WHEN p.expiration_date < CURRENT_DATE THEN 'expired'
--         ...
--
-- `pt.hours IS NULL` is how an unlimited package type is recognised (Diamond,
-- Diamond+, Early Bird +). Those three types have no hour allowance, so the
-- first arm always matched and the expiry arm was unreachable for them. An
-- hours-based package expired correctly; an unlimited one never did.
--
-- Why it cost money: `utils/customer-service.ts` filters to
-- `package_status IN ('active','unlimited')` and the booking flow's cost
-- calculator zeroes the bay line for anyone who passes. Measured on
-- 2026-07-26: 143 package rows across 79 customers sat past their expiry
-- still reporting 'unlimited', the oldest expired 2024-09-01. 67 of those
-- customers held no other valid package, so the flow quoted them ฿0 while
-- staff charged the full rate at the bay. In this codebase the quote is a
-- promise, which makes that a broken promise 67 times over.
--
-- The fix is to test expiry FIRST. An expired package is expired whatever its
-- type.
--
-- Ordering notes, so nobody "tidies" this back:
--   * expired must stay above depleted. That was already the case for
--     hours-based packages and this preserves it: a package that is both out of
--     hours and out of time reads 'expired'.
--   * a NULL `expiration_date` still falls through to the unlimited arm exactly
--     as before, because `NULL < CURRENT_DATE` is NULL, not true. Two rows are
--     in that state today and neither changes.
--
-- Blast radius, verified before applying: only rows with `pt.hours IS NULL`
-- change status, which is exactly the three unlimited types. No coaching or
-- monthly package type has NULL hours, so `public.get_customers_with_coaching_hours`
-- is untouched. Nothing else in the database reads these matviews: the only
-- consumers are `public.get_customer_packages`,
-- `public.get_customers_with_coaching_hours` and
-- `backoffice.refresh_package_materialized_views`, and no view depends on them.
--
-- Downstream, the 143 rows keep being RETURNED by `get_customer_packages` (its
-- filter admits 'expired'), they just stop counting as entitlement. The booking
-- flow drops them; the VIP portal moves them from Active to Past. Both are the
-- correct reading.
--
-- These are MATERIALIZED views, so this is DROP + CREATE rather than CREATE OR
-- REPLACE, and the indexes and grants are restored explicitly below. The unique
-- index on package_id is load-bearing: `refresh_package_materialized_views`
-- refreshes CONCURRENTLY, which Postgres rejects without one.
--
-- Note for whoever touches this next: CURRENT_DATE inside a materialized view is
-- frozen at refresh time, and refresh here is event-driven (triggers on
-- backoffice.packages and backoffice.package_usage), not scheduled. Drift
-- measured zero on 2026-07-26 because package writes are frequent, but a quiet
-- day means a package expiring that day keeps its old status until the next
-- write. If that ever matters, the answer is a scheduled refresh, not moving
-- the date logic back out of here.

DROP MATERIALIZED VIEW IF EXISTS backoffice.customer_active_packages;

CREATE MATERIALIZED VIEW backoffice.customer_active_packages AS
SELECT p.id AS package_id,
    p.customer_id,
    c.customer_name,
    c.customer_code,
    p.purchase_date,
    p.first_use_date,
    p.expiration_date,
    p.package_type_id,
    pt.name AS package_type_name,
    pt.display_name,
        CASE
            WHEN pt.type = 'Monthly'::backoffice.package_type THEN 'monthly'::text
            WHEN pt.type = 'Coaching'::backoffice.package_type THEN 'coaching'::text
            WHEN pt.type = 'Unlimited'::backoffice.package_type THEN 'unlimited'::text
            ELSE 'other'::text
        END AS package_category,
    pt.hours AS total_hours,
    pt.validity_period,
    pt.pax,
    COALESCE(usage_sum.total_used, 0::numeric) AS used_hours,
        CASE
            WHEN pt.hours IS NULL THEN NULL::numeric
            ELSE GREATEST(pt.hours - COALESCE(usage_sum.total_used, 0::numeric), 0::numeric)
        END AS remaining_hours,
        CASE
            -- Expiry first. Everything below assumes the package is still valid.
            WHEN p.expiration_date < CURRENT_DATE THEN 'expired'::text
            WHEN pt.hours IS NULL THEN 'unlimited'::text
            WHEN GREATEST(pt.hours - COALESCE(usage_sum.total_used, 0::numeric), 0::numeric) <= 0::numeric THEN 'depleted'::text
            ELSE 'active'::text
        END AS package_status
   FROM backoffice.packages p
     JOIN customers c ON p.customer_id = c.id
     JOIN backoffice.package_types pt ON p.package_type_id = pt.id
     LEFT JOIN ( SELECT package_usage.package_id,
            sum(package_usage.used_hours) AS total_used
           FROM backoffice.package_usage
          GROUP BY package_usage.package_id) usage_sum ON p.id = usage_sum.package_id
  WHERE p.customer_id IS NOT NULL AND c.is_active = true;

CREATE UNIQUE INDEX idx_customer_active_packages_package_id
  ON backoffice.customer_active_packages USING btree (package_id);
CREATE INDEX idx_customer_active_packages_customer_id
  ON backoffice.customer_active_packages USING btree (customer_id);
CREATE INDEX idx_customer_active_packages_customer_status
  ON backoffice.customer_active_packages USING btree (customer_id, package_status);
CREATE INDEX idx_customer_active_packages_status
  ON backoffice.customer_active_packages USING btree (package_status);

GRANT SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON backoffice.customer_active_packages TO service_role;

-- Same bug, same fix. `customer_all_packages` is the same query plus
-- `created_at`; the two are kept in step deliberately, so a divergence in the
-- status CASE between them would be a bug in itself.
DROP MATERIALIZED VIEW IF EXISTS backoffice.customer_all_packages;

CREATE MATERIALIZED VIEW backoffice.customer_all_packages AS
SELECT p.id AS package_id,
    p.customer_id,
    c.customer_name,
    c.customer_code,
    p.purchase_date,
    p.first_use_date,
    p.expiration_date,
    p.package_type_id,
    pt.name AS package_type_name,
    pt.display_name,
        CASE
            WHEN pt.type = 'Monthly'::backoffice.package_type THEN 'monthly'::text
            WHEN pt.type = 'Coaching'::backoffice.package_type THEN 'coaching'::text
            WHEN pt.type = 'Unlimited'::backoffice.package_type THEN 'unlimited'::text
            ELSE 'other'::text
        END AS package_category,
    pt.hours AS total_hours,
    pt.validity_period,
    pt.pax,
    COALESCE(usage_sum.total_used, 0::numeric) AS used_hours,
        CASE
            WHEN pt.hours IS NULL THEN NULL::numeric
            ELSE GREATEST(pt.hours - COALESCE(usage_sum.total_used, 0::numeric), 0::numeric)
        END AS remaining_hours,
        CASE
            -- Expiry first. See customer_active_packages above.
            WHEN p.expiration_date < CURRENT_DATE THEN 'expired'::text
            WHEN pt.hours IS NULL THEN 'unlimited'::text
            WHEN GREATEST(pt.hours - COALESCE(usage_sum.total_used, 0::numeric), 0::numeric) <= 0::numeric THEN 'depleted'::text
            ELSE 'active'::text
        END AS package_status,
    p.created_at
   FROM backoffice.packages p
     JOIN customers c ON p.customer_id = c.id
     JOIN backoffice.package_types pt ON p.package_type_id = pt.id
     LEFT JOIN ( SELECT package_usage.package_id,
            sum(package_usage.used_hours) AS total_used
           FROM backoffice.package_usage
          GROUP BY package_usage.package_id) usage_sum ON p.id = usage_sum.package_id
  WHERE p.customer_id IS NOT NULL AND c.is_active = true;

CREATE UNIQUE INDEX idx_customer_all_packages_package_id
  ON backoffice.customer_all_packages USING btree (package_id);
CREATE INDEX idx_customer_all_packages_customer_id
  ON backoffice.customer_all_packages USING btree (customer_id);
CREATE INDEX idx_customer_all_packages_customer_status
  ON backoffice.customer_all_packages USING btree (customer_id, package_status);

GRANT SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON backoffice.customer_all_packages TO service_role;
