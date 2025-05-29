# Data Migration Analysis - Production RLS Enablement
*LENGOLF VIP Migration - Production Tables Only Migration*

## Current Database State Analysis

### Data Distribution Summary

#### Production Tables Status
```
Production profiles:     636 records (with marketing_preference column)
VIP Customer Data:       187 records (186 with stable_hash_id)
CRM Mappings:           236 records (100% matched and have stable_hash_id)
Bookings:               981 records (100% have user_id - RLS ready)
CRM Packages:           ~500+ records (production packages)
```

### Critical Findings

#### 1. Schema Differences Required
**Production `profiles` table needs:**
- ✅ Has `marketing_preference` column (boolean, NOT NULL) 
- ❌ Missing `vip_customer_data_id` column (UUID, nullable)

**Migration approach:**
- Add `vip_customer_data_id` column to production `profiles`
- Migrate marketing preferences from `profiles` to `vip_customer_data` 
- Default marketing consent to **FALSE** for new VIP records
- Remove `marketing_preference` column after migration complete

#### 2. Data Integrity Status
- **Bookings:** ✅ 100% have `user_id` populated (RLS ready)
- **CRM Mappings:** ✅ 100% have required fields (profile_id, stable_hash_id)
- **VIP Data:** ✅ 99.5% have stable_hash_id (186/187 records)

#### 3. Migration Requirements (Production Tables Only)
1. **Add `vip_customer_data_id` to production `profiles` table**
2. **Create VIP customer data for existing CRM-linked users (from production data)**
3. **Migrate marketing preferences to `vip_customer_data` with FALSE default**
4. **Remove `marketing_preference` from production `profiles` table**
5. **NO staging data sync required - all based on production**

## Detailed Migration SQL Scripts

### Phase 1: Schema Updates (Production Profiles Table)

#### 1.1: Add VIP Customer Data Column
```sql
-- Add vip_customer_data_id column to production profiles
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS vip_customer_data_id UUID REFERENCES public.vip_customer_data(id) ON DELETE SET NULL;

-- Add index for performance  
CREATE INDEX IF NOT EXISTS idx_profiles_vip_customer_data_id 
ON public.profiles(vip_customer_data_id);

-- Add comment for documentation
COMMENT ON COLUMN public.profiles.vip_customer_data_id IS 'Foreign key linking to the central VIP customer data record.';
```

#### 1.2: Create VIP Data for All Production Users with Marketing Preferences
```sql
-- Create VIP customer data records for users who have marketing preferences
-- Default marketing consent to FALSE unless explicitly true in production
INSERT INTO public.vip_customer_data (
    vip_display_name,
    vip_email,
    vip_marketing_preference,
    vip_phone_number
)
SELECT DISTINCT
    p.display_name,
    p.email,
    COALESCE(p.marketing_preference, false),  -- Default to FALSE, respect existing preferences
    p.phone_number
FROM public.profiles p
WHERE NOT EXISTS (
    SELECT 1 FROM public.vip_customer_data vcd 
    WHERE vcd.vip_email = p.email
)
AND p.email IS NOT NULL;  -- Only create for users with email addresses

-- Link profiles to newly created vip_customer_data (by email match)
UPDATE public.profiles p
SET vip_customer_data_id = vcd.id
FROM public.vip_customer_data vcd
WHERE p.vip_customer_data_id IS NULL
AND p.email IS NOT NULL 
AND vcd.vip_email = p.email;
```

#### 1.3: Create VIP Data for CRM-Linked Users (Production Data Only)
```sql
-- Create vip_customer_data records for users who have CRM mappings but no VIP data yet
-- Use production CRM mapping data only
INSERT INTO public.vip_customer_data (
    vip_display_name,
    vip_email,
    vip_phone_number,
    stable_hash_id,
    vip_marketing_preference
)
SELECT DISTINCT
    p.display_name,
    p.email,
    p.phone_number,
    ccm.stable_hash_id,
    false  -- Default marketing consent to FALSE for all new VIP records
FROM public.profiles p
JOIN public.crm_customer_mapping ccm ON ccm.profile_id = p.id
WHERE ccm.is_matched = true
AND ccm.stable_hash_id IS NOT NULL
AND p.vip_customer_data_id IS NULL
AND NOT EXISTS (
    SELECT 1 FROM public.vip_customer_data vcd 
    WHERE vcd.stable_hash_id = ccm.stable_hash_id
);

-- Link profiles to newly created vip_customer_data (by stable_hash_id match)
UPDATE public.profiles p
SET vip_customer_data_id = vcd.id
FROM public.vip_customer_data vcd
JOIN public.crm_customer_mapping ccm ON ccm.stable_hash_id = vcd.stable_hash_id
WHERE ccm.profile_id = p.id
AND ccm.is_matched = true
AND p.vip_customer_data_id IS NULL
AND vcd.stable_hash_id IS NOT NULL;
```

#### 1.4: Update Existing VIP Data Marketing Preferences
```sql
-- Update existing VIP customer data to respect production marketing preferences
-- Only update if the VIP record doesn't already have a preference set
UPDATE public.vip_customer_data vcd
SET vip_marketing_preference = COALESCE(p.marketing_preference, false)
FROM public.profiles p
WHERE p.vip_customer_data_id = vcd.id
AND vcd.vip_marketing_preference IS NULL
AND p.marketing_preference IS NOT NULL;
```

#### 1.5: Create VIP Data for Remaining Users (Without CRM Links)
```sql
-- Create VIP data for users who don't have CRM mappings but should have VIP access
-- This ensures all users can access the VIP portal even if not CRM-linked
INSERT INTO public.vip_customer_data (
    vip_display_name,
    vip_email,
    vip_marketing_preference,
    vip_phone_number
)
SELECT DISTINCT
    p.display_name,
    p.email,
    false,  -- Default marketing consent to FALSE
    p.phone_number
FROM public.profiles p
WHERE p.vip_customer_data_id IS NULL
AND p.email IS NOT NULL
AND NOT EXISTS (
    SELECT 1 FROM public.vip_customer_data vcd 
    WHERE vcd.vip_email = p.email
);

-- Link these profiles to their VIP data
UPDATE public.profiles p
SET vip_customer_data_id = vcd.id
FROM public.vip_customer_data vcd
WHERE p.vip_customer_data_id IS NULL
AND p.email IS NOT NULL
AND vcd.vip_email = p.email
AND vcd.stable_hash_id IS NULL;  -- Only link non-CRM VIP records
```

#### 1.6: Remove Marketing Preference Column (After VIP Migration Complete)
```sql
-- Remove marketing_preference column from profiles (VIP data now holds this)
-- CAUTION: Run this ONLY after confirming all VIP data is properly linked
ALTER TABLE public.profiles DROP COLUMN IF EXISTS marketing_preference;
```

### Phase 2: Data Validation Queries

#### 2.1: Pre-Migration Validation
```sql
-- Check current state before migration
SELECT 
    'profiles' as table_name,
    COUNT(*) as total_records,
    COUNT(vip_customer_data_id) as with_vip_data,
    COUNT(marketing_preference) as with_marketing_pref,
    COUNT(CASE WHEN marketing_preference = true THEN 1 END) as marketing_true,
    COUNT(CASE WHEN marketing_preference = false THEN 1 END) as marketing_false
FROM profiles
UNION ALL
SELECT 
    'vip_customer_data',
    COUNT(*),
    COUNT(stable_hash_id),
    COUNT(vip_marketing_preference),
    COUNT(CASE WHEN vip_marketing_preference = true THEN 1 END),
    COUNT(CASE WHEN vip_marketing_preference = false THEN 1 END)
FROM vip_customer_data
UNION ALL
SELECT 
    'crm_customer_mapping',
    COUNT(*),
    COUNT(stable_hash_id),
    COUNT(CASE WHEN is_matched THEN 1 END),
    0,
    0
FROM crm_customer_mapping;
```

#### 2.2: Post-Migration Validation  
```sql
-- Validation queries after migration
SELECT 
    'Migration Validation' as check_type,
    COUNT(DISTINCT p.id) as total_profiles,
    COUNT(DISTINCT p.vip_customer_data_id) as linked_vip_data,
    COUNT(DISTINCT ccm.profile_id) as crm_linked_profiles,
    COUNT(DISTINCT vcd.id) as total_vip_records
FROM profiles p
LEFT JOIN vip_customer_data vcd ON p.vip_customer_data_id = vcd.id
LEFT JOIN crm_customer_mapping ccm ON ccm.profile_id = p.id;

-- Check for orphaned records
SELECT 
    'Orphaned VIP Data' as check_type,
    COUNT(*) as orphaned_count
FROM vip_customer_data vcd
WHERE NOT EXISTS (
    SELECT 1 FROM profiles p WHERE p.vip_customer_data_id = vcd.id
);

-- Check marketing preference migration with FALSE default validation
SELECT 
    'Marketing Preference Migration' as check_type,
    COUNT(*) as total_vip_records,
    COUNT(CASE WHEN vip_marketing_preference = true THEN 1 END) as marketing_true,
    COUNT(CASE WHEN vip_marketing_preference = false THEN 1 END) as marketing_false,
    COUNT(CASE WHEN vip_marketing_preference IS NULL THEN 1 END) as marketing_null
FROM vip_customer_data;

-- Verify all profiles have VIP customer data linked
SELECT 
    'Profile-VIP Linking' as check_type,
    COUNT(*) as total_profiles,
    COUNT(vip_customer_data_id) as profiles_with_vip_data,
    COUNT(*) - COUNT(vip_customer_data_id) as profiles_without_vip_data
FROM profiles;
```

#### 2.3: CRM Integration Validation
```sql
-- Verify CRM-linked users have proper VIP data with stable_hash_id
SELECT 
    'CRM-VIP Integration' as check_type,
    COUNT(DISTINCT ccm.profile_id) as crm_mapped_profiles,
    COUNT(DISTINCT CASE WHEN p.vip_customer_data_id IS NOT NULL THEN ccm.profile_id END) as crm_profiles_with_vip,
    COUNT(DISTINCT CASE WHEN vcd.stable_hash_id IS NOT NULL THEN ccm.profile_id END) as crm_profiles_with_stable_hash
FROM crm_customer_mapping ccm
JOIN profiles p ON ccm.profile_id = p.id
LEFT JOIN vip_customer_data vcd ON p.vip_customer_data_id = vcd.id
WHERE ccm.is_matched = true;
```

## Migration Rollback Scripts

### Emergency Data Rollback (If Needed)
```sql
-- Rollback marketing preferences to profiles table
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS marketing_preference BOOLEAN NOT NULL DEFAULT false;

-- Restore marketing preferences from VIP data
UPDATE public.profiles p
SET marketing_preference = COALESCE(vcd.vip_marketing_preference, false)
FROM public.vip_customer_data vcd
WHERE p.vip_customer_data_id = vcd.id;

-- Remove VIP links if needed
UPDATE public.profiles SET vip_customer_data_id = NULL;

-- Remove VIP customer data column
ALTER TABLE public.profiles DROP COLUMN vip_customer_data_id;
```

## Risk Assessment & Mitigation

### High Risk Areas

#### 1. Marketing Preference Data Loss
**Risk:** Marketing preferences could be lost during column removal
**Mitigation:** 
- Migrate ALL marketing preferences to VIP data before removing column
- Default to FALSE for all new records as specified
- Validate 100% migration success before column removal
- Keep rollback script ready

#### 2. VIP Customer Data Duplication  
**Risk:** Creating duplicate VIP customer records during migration
**Mitigation:**
- Use NOT EXISTS clauses in all INSERT statements
- Check by stable_hash_id and email before creating
- Run validation queries to detect duplicates

#### 3. Profile-VIP Data Linking Failures
**Risk:** Profiles not properly linked to VIP customer data
**Mitigation:**
- Multiple linking strategies (stable_hash_id for CRM users, email for others)
- Validation queries to confirm 100% linkage
- Create VIP data for ALL users to ensure VIP portal access

### Pre-Migration Checklist

#### Data Integrity Checks
- [ ] Verify all bookings have user_id (RLS requirement)
- [ ] Confirm all CRM mappings have stable_hash_id
- [ ] Validate no duplicate stable_hash_id in vip_customer_data
- [ ] Check for profiles without email addresses (edge case handling)

#### Backup Procedures
- [ ] Full database backup before starting migration
- [ ] Export current marketing_preference data separately
- [ ] Backup current vip_customer_data table state
- [ ] Document current row counts for all affected tables

#### Testing Requirements
- [ ] Test migration scripts on staging environment copy
- [ ] Validate all migration SQL on test data
- [ ] Confirm rollback procedures work correctly
- [ ] Test RLS policies with migrated data structure

## Estimated Migration Time

### Phase 1: Schema Updates (20-25 minutes)
- Add vip_customer_data_id column: 2 minutes
- Create VIP data for users with marketing preferences: 5 minutes  
- Create VIP data for CRM users: 5 minutes
- Update existing VIP data marketing preferences: 3 minutes
- Create VIP data for remaining users: 5 minutes
- Validation queries: 5 minutes

### Phase 2: Final Steps (5 minutes)
- Remove marketing_preference column: 2 minutes
- Final validation: 3 minutes

**Total Estimated Time: 25-30 minutes**

## Success Criteria

### Data Migration Success
- ✅ 100% of profiles have vip_customer_data_id populated
- ✅ 100% of marketing preferences migrated to vip_customer_data
- ✅ All new VIP records have marketing_preference = FALSE by default
- ✅ 100% of CRM-linked users have VIP customer data with stable_hash_id
- ✅ Zero orphaned vip_customer_data records
- ✅ All users can access VIP portal (even if not CRM-linked)

### Schema Migration Success  
- ✅ profiles table has vip_customer_data_id column
- ✅ profiles table no longer has marketing_preference column
- ✅ All foreign key constraints working correctly
- ✅ All indexes created successfully

### Performance Requirements
- ✅ Migration completes within 30 minutes maximum
- ✅ No blocking locks on production tables during migration
- ✅ Database performance maintained after migration

---

**CRITICAL:** This data migration is based entirely on production tables. Marketing consent defaults to FALSE for all new VIP customer data records. This migration must be completed BEFORE enabling RLS policies on production tables. 