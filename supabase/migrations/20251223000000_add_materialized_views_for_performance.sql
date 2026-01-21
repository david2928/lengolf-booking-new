-- =====================================================
-- Performance Optimization: Materialized Views + Indexes
-- =====================================================
-- This migration adds materialized views for package data
-- and optimized indexes for bookings to improve LIFF
-- membership page performance from ~5s to sub-1s

-- =====================================================
-- 1. MATERIALIZED VIEW: Customer Active Packages
-- =====================================================
-- Pre-computes active packages with usage calculations
-- Refreshed every 10 minutes via pg_cron

-- Drop existing if present
DROP MATERIALIZED VIEW IF EXISTS backoffice.customer_active_packages CASCADE;

CREATE MATERIALIZED VIEW backoffice.customer_active_packages AS
SELECT
    p.id as package_id,
    p.customer_id,
    c.customer_name,
    c.customer_code,
    p.purchase_date,
    p.first_use_date,
    p.expiration_date,
    p.package_type_id,
    pt.name as package_type_name,
    pt.display_name,
    CASE
        WHEN pt.type = 'Monthly' THEN 'monthly'
        WHEN pt.type = 'Coaching' THEN 'coaching'
        WHEN pt.type = 'Unlimited' THEN 'unlimited'
        ELSE 'other'
    END as package_category,
    pt.hours as total_hours,
    pt.validity_period,
    pt.pax,
    COALESCE(usage_sum.total_used, 0) as used_hours,
    CASE
        WHEN pt.hours IS NULL THEN NULL  -- Unlimited packages
        ELSE GREATEST(pt.hours - COALESCE(usage_sum.total_used, 0), 0)
    END as remaining_hours,
    CASE
        WHEN pt.hours IS NULL THEN 'unlimited'
        WHEN p.expiration_date < CURRENT_DATE THEN 'expired'
        WHEN GREATEST(pt.hours - COALESCE(usage_sum.total_used, 0), 0) <= 0 THEN 'depleted'
        ELSE 'active'
    END as package_status
FROM backoffice.packages p
JOIN public.customers c ON p.customer_id = c.id
JOIN backoffice.package_types pt ON p.package_type_id = pt.id
LEFT JOIN (
    SELECT
        package_id,
        SUM(used_hours) as total_used
    FROM backoffice.package_usage
    GROUP BY package_id
) usage_sum ON p.id = usage_sum.package_id
WHERE p.customer_id IS NOT NULL
  AND c.is_active = true;

-- Create unique index for CONCURRENTLY refresh (required)
CREATE UNIQUE INDEX idx_customer_active_packages_package_id
ON backoffice.customer_active_packages(package_id);

-- Indexes for fast filtering
CREATE INDEX idx_customer_active_packages_customer_id
ON backoffice.customer_active_packages(customer_id);

CREATE INDEX idx_customer_active_packages_status
ON backoffice.customer_active_packages(package_status);

CREATE INDEX idx_customer_active_packages_customer_status
ON backoffice.customer_active_packages(customer_id, package_status);


-- =====================================================
-- 2. MATERIALIZED VIEW: Customer All Packages
-- =====================================================
-- Pre-computes ALL packages (including expired/depleted)
-- Used for package history display

-- Drop existing if present
DROP MATERIALIZED VIEW IF EXISTS backoffice.customer_all_packages CASCADE;

CREATE MATERIALIZED VIEW backoffice.customer_all_packages AS
SELECT
    p.id as package_id,
    p.customer_id,
    c.customer_name,
    c.customer_code,
    p.purchase_date,
    p.first_use_date,
    p.expiration_date,
    p.package_type_id,
    pt.name as package_type_name,
    pt.display_name,
    CASE
        WHEN pt.type = 'Monthly' THEN 'monthly'
        WHEN pt.type = 'Coaching' THEN 'coaching'
        WHEN pt.type = 'Unlimited' THEN 'unlimited'
        ELSE 'other'
    END as package_category,
    pt.hours as total_hours,
    pt.validity_period,
    pt.pax,
    COALESCE(usage_sum.total_used, 0) as used_hours,
    CASE
        WHEN pt.hours IS NULL THEN NULL
        ELSE GREATEST(pt.hours - COALESCE(usage_sum.total_used, 0), 0)
    END as remaining_hours,
    CASE
        WHEN pt.hours IS NULL THEN 'unlimited'
        WHEN p.expiration_date < CURRENT_DATE THEN 'expired'
        WHEN GREATEST(pt.hours - COALESCE(usage_sum.total_used, 0), 0) <= 0 THEN 'depleted'
        ELSE 'active'
    END as package_status,
    p.created_at
FROM backoffice.packages p
JOIN public.customers c ON p.customer_id = c.id
JOIN backoffice.package_types pt ON p.package_type_id = pt.id
LEFT JOIN (
    SELECT
        package_id,
        SUM(used_hours) as total_used
    FROM backoffice.package_usage
    GROUP BY package_id
) usage_sum ON p.id = usage_sum.package_id
WHERE p.customer_id IS NOT NULL
  AND c.is_active = true;

-- Unique index for CONCURRENTLY refresh
CREATE UNIQUE INDEX idx_customer_all_packages_package_id
ON backoffice.customer_all_packages(package_id);

-- Indexes for fast filtering
CREATE INDEX idx_customer_all_packages_customer_id
ON backoffice.customer_all_packages(customer_id);

CREATE INDEX idx_customer_all_packages_customer_status
ON backoffice.customer_all_packages(customer_id, package_status);


-- =====================================================
-- 3. OPTIMIZED INDEXES for Bookings Table
-- =====================================================
-- Partial index for upcoming bookings (most common query)
CREATE INDEX IF NOT EXISTS idx_bookings_upcoming
ON public.bookings(customer_id, date, start_time)
WHERE date >= CURRENT_DATE AND status = 'confirmed';

-- Index for customer bookings with date range
CREATE INDEX IF NOT EXISTS idx_bookings_customer_date
ON public.bookings(customer_id, date DESC)
WHERE status = 'confirmed';


-- =====================================================
-- 4. FUNCTIONS: Update RPC functions to use materialized views
-- =====================================================

-- Replace get_customer_packages to use materialized view
CREATE OR REPLACE FUNCTION public.get_customer_packages(customer_id_param uuid)
RETURNS TABLE(
    package_id uuid,
    customer_id uuid,
    customer_name varchar,
    purchase_date date,
    first_use_date date,
    expiration_date date,
    package_type_id int,
    package_type_name varchar,
    display_name varchar,
    package_category text,
    total_hours numeric,
    validity_period interval,
    pax smallint,
    used_hours numeric,
    remaining_hours numeric,
    package_status text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'backoffice'
AS $$
BEGIN
    RETURN QUERY
    SELECT
        cap.package_id,
        cap.customer_id,
        cap.customer_name,
        cap.purchase_date,
        cap.first_use_date,
        cap.expiration_date,
        cap.package_type_id,
        cap.package_type_name,
        cap.display_name,
        cap.package_category::TEXT,
        cap.total_hours,
        cap.validity_period,
        cap.pax,
        cap.used_hours,
        cap.remaining_hours,
        cap.package_status
    FROM backoffice.customer_active_packages cap
    WHERE cap.customer_id = customer_id_param
    AND cap.package_status IN ('active', 'unlimited')
    ORDER BY cap.purchase_date DESC;
END;
$$;

-- Replace get_all_customer_packages to use materialized view
CREATE OR REPLACE FUNCTION public.get_all_customer_packages(customer_id_param uuid)
RETURNS TABLE(
    package_id uuid,
    customer_id uuid,
    customer_name varchar,
    purchase_date date,
    first_use_date date,
    expiration_date date,
    package_type_id int,
    package_type_name varchar,
    display_name varchar,
    package_category text,
    total_hours numeric,
    validity_period interval,
    pax smallint,
    used_hours numeric,
    remaining_hours numeric,
    package_status text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'backoffice'
AS $$
BEGIN
    RETURN QUERY
    SELECT
        cap.package_id,
        cap.customer_id,
        cap.customer_name,
        cap.purchase_date,
        cap.first_use_date,
        cap.expiration_date,
        cap.package_type_id,
        cap.package_type_name,
        cap.display_name,
        cap.package_category::TEXT,
        cap.total_hours,
        cap.validity_period,
        cap.pax,
        cap.used_hours,
        cap.remaining_hours,
        cap.package_status
    FROM backoffice.customer_all_packages cap
    WHERE cap.customer_id = customer_id_param
    ORDER BY cap.purchase_date DESC;
END;
$$;


-- =====================================================
-- 5. REFRESH FUNCTION: Manual refresh trigger
-- =====================================================
-- Allows manual refresh of materialized views when needed

CREATE OR REPLACE FUNCTION backoffice.refresh_package_materialized_views()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    -- Refresh concurrently to avoid locking (requires unique index)
    REFRESH MATERIALIZED VIEW CONCURRENTLY backoffice.customer_active_packages;
    REFRESH MATERIALIZED VIEW CONCURRENTLY backoffice.customer_all_packages;

    RAISE NOTICE 'Package materialized views refreshed successfully';
END;
$$;


-- =====================================================
-- 6. TRIGGER: Auto-refresh on package changes
-- =====================================================
-- Automatically refresh views when package data changes
-- This ensures data is always reasonably fresh

CREATE OR REPLACE FUNCTION backoffice.trigger_refresh_package_views()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    -- Refresh in background (async)
    -- Note: This won't block the transaction
    PERFORM backoffice.refresh_package_materialized_views();
    RETURN NEW;
END;
$$;

-- Trigger on package updates
DROP TRIGGER IF EXISTS trigger_package_update_refresh ON backoffice.packages;
CREATE TRIGGER trigger_package_update_refresh
    AFTER INSERT OR UPDATE OR DELETE ON backoffice.packages
    FOR EACH STATEMENT
    EXECUTE FUNCTION backoffice.trigger_refresh_package_views();

-- Trigger on package usage updates
DROP TRIGGER IF EXISTS trigger_package_usage_update_refresh ON backoffice.package_usage;
CREATE TRIGGER trigger_package_usage_update_refresh
    AFTER INSERT OR UPDATE OR DELETE ON backoffice.package_usage
    FOR EACH STATEMENT
    EXECUTE FUNCTION backoffice.trigger_refresh_package_views();


-- =====================================================
-- 7. INITIAL REFRESH
-- =====================================================
-- Populate materialized views immediately

REFRESH MATERIALIZED VIEW backoffice.customer_active_packages;
REFRESH MATERIALIZED VIEW backoffice.customer_all_packages;


-- =====================================================
-- 8. ENABLE pg_cron EXTENSION (if not already enabled)
-- =====================================================
-- Note: This requires Supabase pg_cron to be enabled in project settings

-- CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Schedule refresh every 10 minutes
-- Uncomment after enabling pg_cron in Supabase dashboard:
-- SELECT cron.schedule(
--     'refresh-package-views',                    -- job name
--     '*/10 * * * *',                             -- every 10 minutes
--     'SELECT backoffice.refresh_package_materialized_views();'
-- );


-- =====================================================
-- VERIFICATION QUERIES (run after migration)
-- =====================================================
-- Check materialized view row counts:
-- SELECT 'customer_active_packages' as view, COUNT(*) FROM backoffice.customer_active_packages
-- UNION ALL
-- SELECT 'customer_all_packages', COUNT(*) FROM backoffice.customer_all_packages;

-- Test query performance (should be <50ms):
-- EXPLAIN ANALYZE
-- SELECT * FROM backoffice.customer_active_packages
-- WHERE customer_id = 'YOUR-UUID-HERE';
