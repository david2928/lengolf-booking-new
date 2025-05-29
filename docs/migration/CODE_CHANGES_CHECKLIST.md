# Code Changes Checklist - Staging to Production Table Migration
*LENGOLF VIP Feature Production Migration*

## Overview

This document lists **ALL** code files that need to be updated to change staging table references to production table references during the VIP feature migration.

## Table Reference Changes Required

```bash
# Search & Replace Operations Needed:
profiles_vip_staging → profiles
bookings_vip_staging → bookings  
crm_customer_mapping_vip_staging → crm_customer_mapping
crm_packages_vip_staging → crm_packages
```

## API Route Files

### VIP API Endpoints

#### 1. `/app/api/vip/status/route.ts`
- **Changes Required:**
  - `profiles_vip_staging` → `profiles` (2 occurrences)
  - `crm_customer_mapping_vip_staging` → `crm_customer_mapping` (2 occurrences)
- **Lines:** 54, 60, 77, 84, 182, 195

#### 2. `/app/api/vip/profile/route.ts`
- **Changes Required:**
  - `profiles_vip_staging` → `profiles` (8 occurrences)
  - `crm_customer_mapping_vip_staging` → `crm_customer_mapping` (2 occurrences)
- **Lines:** 49, 147, 153, 251, 267, 300, 304, 342, 344, 396, 400, 404

#### 3. `/app/api/vip/link-account/route.ts`
- **Changes Required:**
  - `profiles_vip_staging` → `profiles` (4 occurrences)
  - `bookings_vip_staging` → `bookings` (1 occurrence)
- **Lines:** 70, 101, 105, 149, 162, 232

#### 4. `/app/api/vip/packages/route.ts`
- **Changes Required:**
  - `profiles_vip_staging` → `profiles` (1 occurrence)
  - `crm_customer_mapping_vip_staging` → `crm_customer_mapping` (1 occurrence)
  - `crm_packages_vip_staging` → `crm_packages` (2 occurrences)
- **Lines:** 89, 110, 132, 160

#### 5. `/app/api/vip/bookings/route.ts`
- **Changes Required:**
  - `profiles_vip_staging` → `profiles` (1 occurrence)
  - `bookings_vip_staging` → `bookings` (2 occurrences)
  - `crm_customer_mapping_vip_staging` → `crm_customer_mapping` (1 occurrence)
- **Lines:** 77, 100, 113, 133

#### 6. `/app/api/vip/bookings/[bookingId]/modify/route.ts`
- **Changes Required:**
  - `bookings_vip_staging` → `bookings` (2 occurrences)
  - `profiles_vip_staging` → `profiles` (2 references in comments/joins)
- **Lines:** 97, 143, 148, 159, 187, 188

#### 7. `/app/api/vip/bookings/[bookingId]/cancel/route.ts`
- **Changes Required:**
  - `bookings_vip_staging` → `bookings` (2 occurrences)
  - `profiles_vip_staging` → `profiles` (8 references in comments/joins)
- **Lines:** 78, 81, 120, 125, 130, 139, 140, 144, 164, 168, 182, 183, 185, 214, 238

### Booking API Endpoints

#### 8. `/app/api/bookings/create/route.ts`
- **Changes Required:**
  - `profiles_vip_staging` → `profiles` (2 occurrences)
  - `bookings_vip_staging` → `bookings` (3 occurrences)
  - `crm_customer_mapping_vip_staging` → `crm_customer_mapping` (1 occurrence)
  - `crm_packages_vip_staging` → `crm_packages` (1 occurrence)
- **Lines:** 77, 425, 515, 528, 562, 651, 809, 915

### Authentication

#### 9. `/app/api/auth/options.ts`
- **Changes Required:**
  - `profiles_vip_staging` → `profiles` (6 occurrences)
- **Lines:** 128, 136, 159, 200, 224, 241

## Frontend Components

### Booking Components

#### 10. `/app/(features)/bookings/components/booking/steps/BookingDetails.tsx`
- **Changes Required:**
  - `profiles_vip_staging` → `profiles` (3 occurrences)
  - `crm_customer_mapping_vip_staging` → `crm_customer_mapping` (2 occurrences)
- **Lines:** 294, 306, 425, 427, 433, 453, 456, 462, 467, 490

#### 11. `/app/(features)/bookings/confirmation/page.tsx`
- **Changes Required:**
  - `bookings_vip_staging` → `bookings` (1 occurrence)
- **Lines:** 46

## Utility Functions

#### 12. `/utils/customer-matching.ts`
- **Changes Required:**
  - `crm_customer_mapping_vip_staging` → `crm_customer_mapping` (9 occurrences)
- **Lines:** 434, 448, 513, 567, 628, 662, 682, 703, 716

#### 13. `/utils/supabase/crm-packages.ts`
- **Changes Required:**
  - `crm_customer_mapping_vip_staging` → `crm_customer_mapping` (4 occurrences)
  - `crm_packages_vip_staging` → `crm_packages` (4 occurrences)
- **Lines:** 77, 80, 88, 99, 250, 253, 261, 299, 321, 330, 355, 367

## Scripts

#### 14. `/scripts/debug-crm-mapping.js`
- **Changes Required:**
  - `bookings_vip_staging` → `bookings` (1 occurrence)
  - `crm_customer_mapping_vip_staging` → `crm_customer_mapping` (1 occurrence)
- **Lines:** 59, 61, 88

#### 15. `/scripts/sync-packages-staging.js`
- **Changes Required:**
  - `crm_customer_mapping_vip_staging` → `crm_customer_mapping` (1 occurrence)
  - `crm_packages_vip_staging` → `crm_packages` (7 occurrences)
- **Lines:** 76, 120, 127, 184, 203, 215, 230, 251, 262

## Service Files

#### 16. `/lib/lineNotifyService.ts`
- **Changes Required:**
  - Update comments referencing staging tables:
  - `profiles_vip_staging` → `profiles` (4 comment references)
  - `bookings_vip_staging` → `bookings` (9 comment references)
- **Lines:** 34-45, 169

## Migration Summary by File Count

- **API Routes:** 9 files
- **Frontend Components:** 2 files  
- **Utility Functions:** 2 files
- **Scripts:** 2 files
- **Service Files:** 1 file (comments only)

**Total Files to Update:** 16 files

## Automated Search & Replace Commands

### Using VS Code
```bash
# Search for: profiles_vip_staging
# Replace with: profiles

# Search for: bookings_vip_staging  
# Replace with: bookings

# Search for: crm_customer_mapping_vip_staging
# Replace with: crm_customer_mapping

# Search for: crm_packages_vip_staging
# Replace with: crm_packages
```

### Using sed (Unix/Linux)
```bash
# Backup all files first
find . -name "*.ts" -o -name "*.tsx" -o -name "*.js" | xargs -I {} cp {} {}.backup

# Replace all staging table references
find . -name "*.ts" -o -name "*.tsx" -o -name "*.js" | xargs sed -i 's/profiles_vip_staging/profiles/g'
find . -name "*.ts" -o -name "*.tsx" -o -name "*.js" | xargs sed -i 's/bookings_vip_staging/bookings/g' 
find . -name "*.ts" -o -name "*.tsx" -o -name "*.js" | xargs sed -i 's/crm_customer_mapping_vip_staging/crm_customer_mapping/g'
find . -name "*.ts" -o -name "*.tsx" -o -name "*.js" | xargs sed -i 's/crm_packages_vip_staging/crm_packages/g'
```

## Critical Testing After Changes

### 1. Authentication Flow
- [ ] Test user login/logout functionality
- [ ] Verify session management works correctly
- [ ] Check NextAuth callbacks with production profiles table

### 2. VIP API Endpoints
- [ ] Test VIP status detection
- [ ] Verify profile data retrieval and updates
- [ ] Check account linking functionality
- [ ] Test booking operations (view, modify, cancel)
- [ ] Verify package data retrieval

### 3. Booking System Integration
- [ ] Test booking creation from main booking system
- [ ] Verify booking confirmation page loads correctly
- [ ] Check that VIP users see their bookings properly

### 4. CRM Integration
- [ ] Test customer matching logic
- [ ] Verify package synchronization
- [ ] Check CRM data mapping functionality

## Post-Migration Cleanup

After successful migration and testing:

1. **Remove staging table references from documentation**
2. **Update any remaining comments or README files**
3. **Remove backup files created during migration**
4. **Update environment-specific configuration if needed**

## Rollback Plan

If issues are discovered after deployment:

```bash
# Restore from backups (if using sed approach)
find . -name "*.backup" | while read backup; do
    original="${backup%.backup}"
    mv "$backup" "$original"
done

# Or revert specific files manually using version control
git checkout HEAD~1 -- [specific file paths]
```

---

**⚠️ CRITICAL:** All files listed above MUST be updated before production deployment. Missing any of these changes will result in database errors when RLS is enabled on production tables.

**✅ VERIFICATION:** After making all changes, search the entire codebase for `_vip_staging` to ensure no references remain. 