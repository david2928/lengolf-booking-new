# RLS Migration & Production Deployment Plan
*LENGOLF VIP Feature Production Migration - Production Tables Only*

## Executive Summary

This document provides the specific migration plan to move LENGOLF VIP features from staging tables (with RLS) to production tables (without RLS). This migration is based **entirely on production data** with no staging data synchronization required.

**Migration Branches:**
- **Source:** `vip` branch (staging table references)
- **Target:** `main` branch (production table references)
- **Deployment:** Vercel production environment

## Current Staging Table RLS Policies

### 1. profiles_vip_staging
```sql
-- Current staging policy (will be applied to production profiles)
CREATE POLICY "Allow individual user access" ON public.profiles_vip_staging
FOR ALL
USING (auth.uid() = id)
WITH CHECK (auth.uid() = id);

CREATE POLICY "Allow service role full access" ON public.profiles_vip_staging
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);
```

### 2. bookings_vip_staging
```sql
-- Current staging policy (will be applied to production bookings)
CREATE POLICY "Allow individual user access to bookings" ON public.bookings_vip_staging
FOR ALL
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Allow service role full access" ON public.bookings_vip_staging
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);
```

### 3. crm_customer_mapping_vip_staging
```sql
-- Current staging policy (will be applied to production crm_customer_mapping)
CREATE POLICY "Allow individual read access to own mapping" ON public.crm_customer_mapping_vip_staging
FOR SELECT
USING (auth.uid() = profile_id);

CREATE POLICY "Allow service role full access" ON public.crm_customer_mapping_vip_staging
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);
```

### 4. crm_packages_vip_staging
```sql
-- Current staging policy (will be applied to production crm_packages)
CREATE POLICY "Allow linked user read access to packages via stable_hash_id" ON public.crm_packages_vip_staging
FOR SELECT
USING (
  EXISTS (
    SELECT 1
    FROM public.profiles_vip_staging p
    JOIN public.vip_customer_data vcd ON p.vip_customer_data_id = vcd.id
    WHERE p.id = auth.uid()
      AND vcd.stable_hash_id IS NOT NULL
      AND vcd.stable_hash_id = public.crm_packages_vip_staging.stable_hash_id
  ) OR EXISTS (
    SELECT 1
    FROM public.crm_customer_mapping_vip_staging ccm
    WHERE ccm.profile_id = auth.uid()
      AND ccm.is_matched = true
      AND ccm.stable_hash_id IS NOT NULL
      AND ccm.stable_hash_id = public.crm_packages_vip_staging.stable_hash_id
  )
);

CREATE POLICY "Allow service role full access" ON public.crm_packages_vip_staging
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);
```

### 5. vip_customer_data (Already Production)
```sql
-- Current production policy (needs update to reference production profiles)
CREATE POLICY "Allow individual user CRUD on linked vip_customer_data" ON public.vip_customer_data
FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM public.profiles_vip_staging pvs
    WHERE pvs.id = auth.uid() 
    AND pvs.vip_customer_data_id = public.vip_customer_data.id
  )
);

CREATE POLICY "Allow service role full access" ON public.vip_customer_data
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);
```

## Required Production Table Policies

### Changes Required for Migration

#### 1. profiles → Enable RLS with Same Policy
```sql
-- NEW: Enable RLS and apply same policy as staging
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles FORCE ROW LEVEL SECURITY;

CREATE POLICY "Allow individual user access" ON public.profiles
FOR ALL
USING (auth.uid() = id)
WITH CHECK (auth.uid() = id);

CREATE POLICY "Allow service role full access" ON public.profiles
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);
```

#### 2. bookings → Enable RLS with Same Policy
```sql
-- NEW: Enable RLS and apply same policy as staging
ALTER TABLE public.bookings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bookings FORCE ROW LEVEL SECURITY;

CREATE POLICY "Allow individual user access to bookings" ON public.bookings
FOR ALL
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Allow service role full access" ON public.bookings
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);
```

#### 3. crm_customer_mapping → Enable RLS with Same Policy
```sql
-- NEW: Enable RLS and apply same policy as staging
ALTER TABLE public.crm_customer_mapping ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_customer_mapping FORCE ROW LEVEL SECURITY;

CREATE POLICY "Allow individual read access to own mapping" ON public.crm_customer_mapping
FOR SELECT
USING (auth.uid() = profile_id);

CREATE POLICY "Allow service role full access" ON public.crm_customer_mapping
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);
```

#### 4. crm_packages → Enable RLS with Same Policy
```sql
-- NEW: Enable RLS and apply same policy as staging
ALTER TABLE public.crm_packages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_packages FORCE ROW LEVEL SECURITY;

CREATE POLICY "Allow linked user read access to packages via stable_hash_id" ON public.crm_packages
FOR SELECT
USING (
  EXISTS (
    SELECT 1
    FROM public.profiles p  -- CHANGED: now references production profiles
    JOIN public.vip_customer_data vcd ON p.vip_customer_data_id = vcd.id
    WHERE p.id = auth.uid()
      AND vcd.stable_hash_id IS NOT NULL
      AND vcd.stable_hash_id = public.crm_packages.stable_hash_id
  ) OR EXISTS (
    SELECT 1
    FROM public.crm_customer_mapping ccm  -- CHANGED: now references production mapping
    WHERE ccm.profile_id = auth.uid()
      AND ccm.is_matched = true
      AND ccm.stable_hash_id IS NOT NULL
      AND ccm.stable_hash_id = public.crm_packages.stable_hash_id
  )
);

CREATE POLICY "Allow service role full access" ON public.crm_packages
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);
```

#### 5. customers → Enable RLS with Read-Only Policy
```sql
-- NEW: Enable RLS with read-only access for linked users
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customers FORCE ROW LEVEL SECURITY;

CREATE POLICY "Allow linked user read access via stable_hash_id" ON public.customers
FOR SELECT
USING (
  EXISTS (
    SELECT 1
    FROM public.profiles p  -- CHANGED: now references production profiles
    JOIN public.vip_customer_data vcd ON p.vip_customer_data_id = vcd.id
    WHERE p.id = auth.uid()
      AND vcd.stable_hash_id IS NOT NULL
      AND vcd.stable_hash_id = public.customers.stable_hash_id
  ) OR EXISTS (
    SELECT 1
    FROM public.crm_customer_mapping ccm  -- CHANGED: now references production mapping
    WHERE ccm.profile_id = auth.uid()
      AND ccm.is_matched = true
      AND ccm.stable_hash_id IS NOT NULL
      AND ccm.stable_hash_id = public.customers.stable_hash_id
  )
);

CREATE POLICY "Allow service role full access" ON public.customers
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);
```

#### 6. vip_customer_data → Update Existing Policy
```sql
-- UPDATE: Change existing policy to reference production profiles table
DROP POLICY "Allow individual user CRUD on linked vip_customer_data" ON public.vip_customer_data;

CREATE POLICY "Allow individual user CRUD on linked vip_customer_data" ON public.vip_customer_data
FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM public.profiles p  -- CHANGED from profiles_vip_staging
    WHERE p.id = auth.uid() 
    AND p.vip_customer_data_id = public.vip_customer_data.id
  )
);
```

## Data Migration Requirements (Production Tables Only)

### Migration Summary
**No staging data sync required.** All migration based on existing production data:

1. **Add `vip_customer_data_id` column to production `profiles` table**
2. **Create VIP customer data for all users (from production profiles data)**
3. **Migrate marketing preferences with FALSE default**
4. **Remove `marketing_preference` column from production profiles**

See `docs/migration/DATA_MIGRATION_ANALYSIS.md` for detailed SQL scripts.

## Streamlined Migration Day Plan

### Pre-Migration Setup (Day Before)

#### 1. Code Preparation
```bash
# Ensure vip branch is ready
git checkout vip
git pull origin vip

# Create migration branch from vip
git checkout -b vip-to-production-migration
```

#### 2. Environment Verification
- [ ] Verify Vercel production deployment configuration
- [ ] Confirm Supabase production database access
- [ ] Test rollback procedures on staging

### Migration Day Execution (2-3 Hour Window)

#### Phase 1: Database Migration (60 minutes)

**Step 1.1: Backup & Preparation (10 min)**
- [ ] Create full database backup
- [ ] Set maintenance mode message (optional)
- [ ] Confirm team on standby

**Step 1.2: Data Migration (25 min)**
Execute data migration SQL scripts (production tables only):
- [ ] Add vip_customer_data_id column to profiles
- [ ] Create VIP data for all users (marketing consent defaults to FALSE)
- [ ] Link profiles to VIP customer data
- [ ] Verify data integrity

```sql
-- Progress Check Query
SELECT 
    'profiles' as table_name,
    COUNT(*) as total_records,
    COUNT(vip_customer_data_id) as with_vip_data
FROM profiles
UNION ALL
SELECT 
    'vip_customer_data',
    COUNT(*),
    COUNT(CASE WHEN vip_marketing_preference = false THEN 1 END) as marketing_false_default
FROM vip_customer_data;
```

**Step 1.3: RLS Policy Application (20 min)**
- [ ] Enable RLS on profiles table
- [ ] Test user authentication (critical checkpoint)
- [ ] Enable RLS on bookings table  
- [ ] Test booking retrieval (critical checkpoint)
- [ ] Enable RLS on crm_customer_mapping table
- [ ] Enable RLS on crm_packages table
- [ ] Enable RLS on customers table
- [ ] Update vip_customer_data policy

**Step 1.4: Validation (5 min)**
- [ ] Test all RLS policies with test user
- [ ] Verify no unauthorized access possible
- [ ] Check database performance metrics

#### Phase 2: Application Deployment (30 minutes)

**Step 2.1: Code Deployment Preparation (10 min)**
```bash
# Switch to main branch
git checkout main
git pull origin main

# Merge vip branch to main (production-ready code)
git merge vip-to-production-migration

# Execute table reference updates - see CODE_CHANGES_CHECKLIST.md for complete details
# 16 files need updates across:
# - 9 API route files
# - 2 frontend components  
# - 2 utility functions
# - 2 scripts
# - 1 service file (comments)

# Automated replacement (backup first):
find . -name "*.ts" -o -name "*.tsx" -o -name "*.js" | xargs -I {} cp {} {}.backup
find . -name "*.ts" -o -name "*.tsx" -o -name "*.js" | xargs sed -i 's/profiles_vip_staging/profiles/g'
find . -name "*.ts" -o -name "*.tsx" -o -name "*.js" | xargs sed -i 's/bookings_vip_staging/bookings/g' 
find . -name "*.ts" -o -name "*.tsx" -o -name "*.js" | xargs sed -i 's/crm_customer_mapping_vip_staging/crm_customer_mapping/g'
find . -name "*.ts" -o -name "*.tsx" -o -name "*.js" | xargs sed -i 's/crm_packages_vip_staging/crm_packages/g'

# Verify no staging references remain:
grep -r "_vip_staging" . --include="*.ts" --include="*.tsx" --include="*.js" || echo "✅ All staging references removed"
```

**Step 2.2: Deploy to Production (10 min)**
```bash
# Deploy to Vercel production
git push origin main

# Monitor deployment status
vercel --prod
```

**Step 2.3: Immediate Testing (10 min)**
- [ ] Test user login/logout
- [ ] Test booking creation
- [ ] Test VIP portal access
- [ ] Test profile updates

#### Phase 3: VIP Feature Testing (45 minutes)

**Step 3.1: VIP Authentication & Access (15 min)**
- [ ] Test VIP status detection for linked users
- [ ] Test VIP status detection for unlinked users
- [ ] Test account linking flow
- [ ] Test redirect flows

**Step 3.2: VIP Dashboard & Profile (15 min)**
- [ ] Test dashboard loading with real data
- [ ] Test profile editing and saving
- [ ] Test marketing preferences (should default to FALSE)
- [ ] Test tier information display

**Step 3.3: VIP Bookings & Packages (15 min)**
- [ ] Test booking history retrieval
- [ ] Test booking modification
- [ ] Test booking cancellation
- [ ] Test package information display

#### Phase 4: Final Validation (15 minutes)

**Step 4.1: End-to-End Testing (10 min)**
- [ ] Complete user journey: Login → VIP access → Profile edit → Booking modify
- [ ] Test with multiple user types (linked/unlinked)
- [ ] Verify notifications still work
- [ ] Check performance metrics

**Step 4.2: Cleanup & Monitoring (5 min)**
- [ ] Remove maintenance mode
- [ ] Enable production monitoring alerts
- [ ] Document any issues found
- [ ] Plan post-migration monitoring

### Progress Tracking Checklist

#### Critical Checkpoints (STOP if these fail)
- [ ] **CRITICAL 1:** User authentication works after profiles RLS
- [ ] **CRITICAL 2:** Booking creation works after bookings RLS  
- [ ] **CRITICAL 3:** VIP portal loads without errors
- [ ] **CRITICAL 4:** No unauthorized data access detected

#### Rollback Triggers
- **Immediate rollback if:**
  - [ ] User authentication fails
  - [ ] Booking creation/retrieval fails
  - [ ] API response times > 2 seconds consistently
  - [ ] Error rate > 1% on core functionality

#### Rollback Procedure
```sql
-- Emergency RLS disable (if needed)
ALTER TABLE profiles DISABLE ROW LEVEL SECURITY;
ALTER TABLE bookings DISABLE ROW LEVEL SECURITY;
ALTER TABLE crm_customer_mapping DISABLE ROW LEVEL SECURITY;
ALTER TABLE crm_packages DISABLE ROW LEVEL SECURITY;
ALTER TABLE customers DISABLE ROW LEVEL SECURITY;
```

```bash
# Emergency code rollback
vercel rollback
# or
git revert [deployment-commit]
git push origin main --force
```

### Post-Migration Monitoring (24 hours)

#### Immediate (0-2 hours)
- [ ] Monitor API response times
- [ ] Track authentication success rates
- [ ] Watch for error spikes
- [ ] Monitor VIP feature usage

#### Short-term (2-24 hours)  
- [ ] Analyze user behavior patterns
- [ ] Check performance baselines
- [ ] Monitor customer support tickets
- [ ] Validate data consistency

#### Success Metrics
- **Performance:** <500ms API response (95th percentile)
- **Reliability:** >99.9% authentication success rate
- **Security:** Zero unauthorized access attempts succeed
- **User Experience:** No increase in support tickets
- **Marketing Consent:** All new VIP records default to FALSE

### Required Team & Tools

#### Team Members Needed
- [ ] Backend developer (RLS policies & data migration)
- [ ] Frontend developer (code deployment & testing)
- [ ] DevOps engineer (Vercel deployment & monitoring)

#### Tools & Access Required  
- [ ] Supabase production database admin access
- [ ] Vercel production deployment access
- [ ] Git repository admin access
- [ ] Monitoring dashboard access

---

**CRITICAL:** This migration affects core authentication and data access. Marketing consent defaults to FALSE for all new VIP records. No staging data synchronization is required - all migration based on production data. Each checkpoint must pass before proceeding to the next step. 