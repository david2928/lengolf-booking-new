# LENGOLF Application Post-Migration Update Plan

## Executive Summary

After the CRM migration to the `backoffice` schema in the main LENGOLF Supabase project (bisimqmtxjsptehhqpeg), the application needs comprehensive updates to remove dependency on the external CRM Supabase instance. This involves updating **18+ files**, removing **CRM environment variables**, and redirecting all CRM queries to the new `backoffice` schema.

---

## 🔍 Current State Analysis

### Current CRM Infrastructure:
- **Separate CRM Supabase Project**: `dujqvigihnlfnvmcdrko.supabase.co`
- **Environment Variables**: 
  - `NEXT_PUBLIC_CRM_SUPABASE_URL`
  - `NEXT_PUBLIC_CRM_SUPABASE_KEY`
- **CRM Client**: `utils/supabase/crm.ts` with singleton pattern
- **Tables Being Accessed**:
  - `customers` (~1,908 rows)
  - `packages` (renamed to `crm_packages`, ~312 rows)
  - `package_types` (~13 rows)
  - `package_usage` (~1,162 rows)
  - `bookings` (~1,521 rows)
  - `allowed_users` (~7 rows)

### Key Integration Points:
1. **VIP Profile Management** - Customer data resolution
2. **Package Management** - Package sync and retrieval
3. **Customer Matching** - Profile-to-CRM linking
4. **Sync Scripts** - Automated data synchronization
5. **GitHub Actions** - CI/CD workflows

---

## 📋 DETAILED MIGRATION TASKS

### PHASE 1: Core Infrastructure Updates

#### TASK 1: Deprecate CRM Client (`utils/supabase/crm.ts`)
**Priority**: Critical  
**Effort**: 2 hours  
**Files**: 1

**Actions:**
```typescript
// utils/supabase/crm.ts - DEPRECATE THIS FILE
// Add deprecation notice and redirect to main client

import { createServerClient } from './server';

/**
 * @deprecated This function is deprecated. 
 * CRM data has been migrated to the main Supabase instance under the 'backoffice' schema.
 * Use createServerClient() instead and query backoffice.* tables.
 */
export function createCrmClient() {
  console.warn('createCrmClient() is deprecated. Use createServerClient() for backoffice schema queries.');
  return createServerClient();
}
```

#### TASK 2: Update Environment Configuration
**Priority**: Critical  
**Effort**: 1 hour  
**Files**: 3

**Actions:**
1. **Remove from production `.env`**:
   ```bash
   # Remove these lines:
   # NEXT_PUBLIC_CRM_SUPABASE_URL=https://dujqvigihnlfnvmcdrko.supabase.co
   # NEXT_PUBLIC_CRM_SUPABASE_KEY=...
   ```

2. **Update GitHub Actions** (`.github/workflows/daily-sync.yml`):
   ```yaml
   # Remove CRM environment variables from both sync jobs
   - name: Run customer matching sync
     env:
       NEXT_PUBLIC_SUPABASE_URL: ${{ secrets.NEXT_PUBLIC_SUPABASE_URL }}
       NEXT_PUBLIC_SUPABASE_ANON_KEY: ${{ secrets.NEXT_PUBLIC_SUPABASE_ANON_KEY }}
       # REMOVE: NEXT_PUBLIC_CRM_SUPABASE_URL and NEXT_PUBLIC_CRM_SUPABASE_KEY
   ```

3. **Update Documentation** (`docs/PACKAGE_SYNC_SETUP.md`):
   ```markdown
   # Update environment variables section to remove CRM references
   ```

---

### PHASE 2: Core Application Files

#### TASK 3: Update Customer Matching Logic (`utils/customer-matching.ts`)
**Priority**: High  
**Effort**: 3 hours  
**Files**: 1

**Key Changes:**
```typescript
// Line 1: Remove CRM import
// OLD: import { createCrmClient } from './supabase/crm';
// NEW: // Remove this import

// Line 333: Update customers table query
// OLD: const { data: customers, error } = await crmSupabase.from('customers')
// NEW: const { data: customers, error } = await supabaseAdminClient.from('backoffice.customers')

// Update all other CRM client references to use supabaseAdminClient
// and prefix all table names with 'backoffice.'
```

#### TASK 4: Update CRM Packages Utility (`utils/supabase/crm-packages.ts`)
**Priority**: High  
**Effort**: 4 hours  
**Files**: 1

**Key Changes:**
```typescript
// Line 1: Remove CRM import
// OLD: import { createCrmClient } from './crm';
// NEW: // Remove this import

// Lines 98, 332, 343, 355, 467, 503: Update table references
// OLD: .from('crm_packages')
// NEW: .from('backoffice.crm_packages')

// Lines 153, 283, 453: Update RPC calls
// OLD: await crmSupabase.rpc('get_packages_by_hash_id', ...)
// NEW: await supabase.rpc('backoffice.get_packages_by_hash_id', ...)

// Replace all createCrmClient() calls with createServerClient()
```

#### TASK 5: Update VIP Profile API (`app/api/vip/profile/route.ts`)
**Priority**: High  
**Effort**: 2 hours  
**Files**: 1

**Key Changes:**
```typescript
// Line 3: Remove CRM import
// OLD: import { createCrmClient } from '@/utils/supabase/crm';
// NEW: // Remove this import

// Line 44: Remove CRM client creation
// OLD: const crmSupabase = createCrmClient();
// NEW: // Use supabaseUserClient for all queries

// Lines 125, 159, 173: Update customers table queries
// OLD: await crmSupabase.from('customers')
// NEW: await supabaseUserClient.from('backoffice.customers')
```

---

### PHASE 3: API Endpoints

#### TASK 6: Update VIP Packages API (`app/api/vip/packages/route.ts`)
**Priority**: Medium  
**Effort**: 1 hour  
**Files**: 1

**Key Changes:**
```typescript
// Lines 132, 160: Update table references
// OLD: .from('crm_packages')
// NEW: .from('backoffice.crm_packages')
```

#### TASK 7: Update Bookings API (`app/api/bookings/create/route.ts`)
**Priority**: Medium  
**Effort**: 1 hour  
**Files**: 1

**Key Changes:**
```typescript
// Line 78: Update table reference
// OLD: .from('crm_packages')
// NEW: .from('backoffice.crm_packages')
```

---

### PHASE 4: Scripts and Automation

#### TASK 8: Update Sync Scripts
**Priority**: High  
**Effort**: 6 hours  
**Files**: 8

**Scripts to Update:**

1. **`scripts/sync-customer-matching.js`**
   ```javascript
   // Remove CRM credentials section (lines 43-44)
   // Update createCrmClient() function to use main Supabase
   // Update line 107: .from('customers') → .from('backoffice.customers')
   ```

2. **`scripts/sync-packages-staging.js`**
   ```javascript
   // Remove CRM credentials (lines 14-15)
   // Update line 165: .rpc('get_packages_by_hash_id') → .rpc('backoffice.get_packages_by_hash_id')
   // Update all table references to backoffice schema
   ```

3. **`scripts/sync-user-packages.js`**
   ```javascript
   // Remove crmUrl and crmKey variables (lines 11-12)
   // Update line 55: RPC call to use backoffice schema
   // Update all CRM references
   ```

4. **`scripts/debug-crm-mapping.js`**
   ```javascript
   // Update line 133: .from('customers') → .from('backoffice.customers')
   ```

5. **`scripts/test-package-sync.js`**
   ```javascript
   // Update all CRM table references to backoffice schema
   ```

6. **`scripts/migrate-crm-packages-rich-data.js`**
   ```javascript
   // Update CRM package references to backoffice schema
   ```

7. **`scripts/sync-user-packages.js`**
   ```javascript
   // Update all package-related queries to backoffice schema
   ```

8. **Remove/Archive CRM-specific scripts:**
   - `scripts/add_packages_hash_trigger.sql`
   - `scripts/add-stable-hash-id.sql`
   - `scripts/direct_update_package_hash.sql`
   - `scripts/crm_update_procedure.sql`

#### TASK 9: Update Database Functions
**Priority**: High  
**Effort**: 2 hours  
**Files**: RPC functions

**Actions:**
- Verify `backoffice.get_packages_by_hash_id` function exists in target schema
- Update all RPC calls to use `backoffice.` prefix
- Test function compatibility with existing data structure

---

### PHASE 5: Testing and Validation

#### TASK 10: Update Type Definitions
**Priority**: Medium  
**Effort**: 1 hour  
**Files**: 1

**Actions:**
```typescript
// types/supabase.ts - Update to reflect new schema structure
// Ensure CrmCustomerMapping type reflects backoffice tables
// Update any CRM-specific types to match migrated schema
```

#### TASK 11: Comprehensive Testing
**Priority**: Critical  
**Effort**: 8 hours  
**Files**: All updated files

**Test Cases:**
1. **VIP Profile Management**
   - Profile creation and updates
   - Customer data resolution
   - Phone number resolution priority

2. **Package Management**
   - Package sync functionality
   - Package retrieval for VIP users
   - Package expiration filtering

3. **Customer Matching**
   - Automatic profile-to-customer matching
   - Manual phone number linking
   - Confidence scoring

4. **Sync Scripts**
   - Customer matching sync
   - Package sync operations
   - Error handling and logging

---

## 🎯 IMPLEMENTATION ROADMAP

### Week 1: Core Infrastructure (Tasks 1-2)
- [ ] Deprecate CRM client
- [ ] Update environment configuration
- [ ] Remove CRM credentials

### Week 2: Application Logic (Tasks 3-5)
- [ ] Update customer matching
- [ ] Update CRM packages utility
- [ ] Update VIP profile API

### Week 3: APIs and Scripts (Tasks 6-9)
- [ ] Update remaining API endpoints
- [ ] Update all sync scripts
- [ ] Update database functions

### Week 4: Testing and Deployment (Tasks 10-11)
- [ ] Update type definitions
- [ ] Comprehensive testing
- [ ] Production deployment

---

## ⚠️ CRITICAL CONSIDERATIONS

### Data Migration Dependencies
1. **Verify Schema Completion**: Ensure all CRM tables are successfully migrated to `backoffice` schema
2. **Function Migration**: Confirm `get_packages_by_hash_id` RPC function exists in `backoffice` schema
3. **Data Integrity**: Validate row counts match between source and target

### Rollback Strategy
1. **Environment Variables**: Keep CRM credentials in secure backup
2. **Code Backup**: Tag current version before migration changes
3. **Database Backup**: Maintain CRM database access during transition period

### Performance Considerations
1. **Query Performance**: Test query performance with `backoffice.` schema prefix
2. **Connection Pooling**: Monitor connection usage after removing separate CRM client
3. **Index Optimization**: Ensure indexes are properly migrated

### Security Updates
1. **RLS Policies**: Verify backoffice tables have appropriate RLS policies
2. **Service Role**: Ensure service role has access to backoffice schema
3. **Environment Cleanup**: Remove CRM credentials from all environments

---

## 📊 MIGRATION IMPACT SUMMARY

| Category | Files Affected | Effort (Hours) | Risk Level |
|----------|----------------|----------------|------------|
| Core Infrastructure | 4 | 6 | High |
| Application Logic | 3 | 9 | High |
| API Endpoints | 2 | 2 | Medium |
| Scripts & Automation | 8 | 8 | Medium |
| Testing & Validation | 2 | 9 | High |
| **TOTAL** | **19** | **34** | **High** |

### Success Criteria:
- ✅ Zero CRM environment variable dependencies
- ✅ All queries redirect to backoffice schema
- ✅ All sync scripts function correctly
- ✅ VIP features maintain full functionality
- ✅ Performance benchmarks maintained
- ✅ Zero data loss or corruption

---

## 📁 FILES REQUIRING UPDATES

### Core Application Files
- `utils/supabase/crm.ts` - **DEPRECATE**
- `utils/customer-matching.ts` - Update table references
- `utils/supabase/crm-packages.ts` - Update all CRM queries
- `app/api/vip/profile/route.ts` - Remove CRM client usage
- `app/api/vip/packages/route.ts` - Update table references
- `app/api/bookings/create/route.ts` - Update package queries

### Scripts and Utilities
- `scripts/sync-customer-matching.js` - Remove CRM connection
- `scripts/sync-packages-staging.js` - Update to backoffice schema
- `scripts/sync-user-packages.js` - Update package sync logic
- `scripts/debug-crm-mapping.js` - Update table references
- `scripts/test-package-sync.js` - Update for new schema
- `scripts/migrate-crm-packages-rich-data.js` - Update references

### Configuration Files
- `.github/workflows/daily-sync.yml` - Remove CRM environment variables
- `docs/PACKAGE_SYNC_SETUP.md` - Update documentation
- `types/supabase.ts` - Update type definitions

### Environment Files
- `.env.local` - Remove CRM variables
- `.env.production` - Remove CRM variables

---

## 🚀 EXECUTION CHECKLIST

### Pre-Migration
- [ ] Backup current codebase (git tag)
- [ ] Document current CRM credentials (secure storage)
- [ ] Verify backoffice schema is complete
- [ ] Test backoffice RPC functions

### Migration Execution
- [ ] Phase 1: Core Infrastructure (Week 1)
- [ ] Phase 2: Application Logic (Week 2)  
- [ ] Phase 3: APIs and Scripts (Week 3)
- [ ] Phase 4: Testing and Validation (Week 4)

### Post-Migration
- [ ] Comprehensive testing in staging
- [ ] Performance benchmark validation
- [ ] Production deployment
- [ ] Monitor for 48 hours
- [ ] Cleanup old CRM credentials
- [ ] Update team documentation

---

**Document Version**: 1.0  
**Created**: January 2025  
**Last Updated**: January 2025  
**Prepared By**: AI Assistant  
**Reviewed By**: _Pending_ 