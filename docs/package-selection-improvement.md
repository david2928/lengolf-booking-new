# Package Selection Logic Improvement

## Problem Statement

Previously, the booking creation system had a simplistic package selection logic that caused issues when customers had multiple packages (including expired or depleted ones). The system would often select an incorrect package because it:

1. Only filtered by `status = 'active'` which isn't reliable
2. Picked the first package found without considering package quality or expiration
3. Didn't account for package depletion (remaining hours = 0)
4. Didn't prioritize packages with more remaining hours or later expiration dates

## Solution

Updated the `getPackageInfo` function in `app/api/bookings/create/route.ts` to use the same sophisticated package selection logic already implemented in the VIP API (`app/api/vip/packages/route.ts`).

### New Package Selection Criteria

The improved logic now:

1. **Filters Active Packages**: Only considers packages that are:
   - Not expired (expiration_date > current date)
   - Not depleted (remaining_hours > 0 OR remaining_hours is null/undefined for unlimited packages)
   - Not coaching packages (filters out coaching from booking selection)

2. **Smart Prioritization**: Sorts packages by:
   - **Primary**: Remaining hours (more hours = higher priority)
   - **Secondary**: Expiration date (later expiration = higher priority for ties)
   - **Special**: Unlimited packages (remaining_hours = null) are treated as highest priority

3. **Robust Selection**: Handles edge cases like:
   - Mixed expired, active, and depleted packages
   - Unlimited packages vs. limited hour packages
   - Multiple packages with same hours but different expiration dates

### Code Changes

**Before:**
```javascript
const { data: packages, error: packagesError } = await supabase
  .from('crm_packages')
  .select('*')
  .eq('stable_hash_id', stableHashId)
  .eq('status', 'active'); // ❌ Unreliable status field

if (packages && packages.length > 0) {
  const nonCoachingPackages = packages.filter((pkg: any) => 
    !pkg.package_type_name?.toLowerCase().includes('coaching')
  );
  
  if (nonCoachingPackages.length > 0) {
    const activePackage = nonCoachingPackages[0]; // ❌ Just picks first
    // ...
  }
}
```

**After:**
```javascript
const { data: packages, error: packagesError } = await supabase
  .from('crm_packages')
  .select('*')
  .eq('stable_hash_id', stableHashId); // ✅ Get all packages

const now = new Date();

// ✅ Filter for truly active packages
const activePackages = packages.filter((pkg: any) => {
  // Skip coaching packages
  if (pkg.package_type_name?.toLowerCase().includes('coaching') || 
      pkg.package_category?.toLowerCase().includes('coaching')) {
    return false;
  }
  
  // Check if package is not expired
  const expirationDate = new Date(pkg.expiration_date || '');
  const isNotExpired = expirationDate > now;
  
  // Check if package has remaining capacity
  const hasRemainingCapacity = pkg.remaining_hours === undefined || 
                              pkg.remaining_hours === null || 
                              pkg.remaining_hours > 0;
  
  return isNotExpired && hasRemainingCapacity;
});

// ✅ Sort to pick the best package
const sortedPackages = activePackages.sort((a: any, b: any) => {
  // Prioritize by remaining hours (more hours first)
  const aRemainingHours = a.remaining_hours ?? Infinity;
  const bRemainingHours = b.remaining_hours ?? Infinity;
  
  if (aRemainingHours !== bRemainingHours) {
    return bRemainingHours - aRemainingHours;
  }
  
  // Then by later expiration date
  const aExpiration = new Date(a.expiration_date || '1970-01-01').getTime();
  const bExpiration = new Date(b.expiration_date || '1970-01-01').getTime();
  
  return bExpiration - aExpiration;
});

const selectedPackage = sortedPackages[0]; // ✅ Best package selected
```

## Testing Scenarios

The logic was validated against these scenarios:

1. **Multiple Active Packages**: Correctly selects package with most remaining hours
2. **Same Hours, Different Expiration**: Correctly selects package with later expiration
3. **Mixed Package States**: Correctly filters out expired/depleted packages and selects only active ones
4. **Unlimited Packages**: Correctly prioritizes unlimited packages over limited ones

## Impact

This improvement ensures that:

- Customers with multiple packages will have the most appropriate package selected for their bookings
- Package utilization is optimized (uses packages with more remaining time first)
- Expired and depleted packages are properly ignored
- Coaching packages don't interfere with practice booking package selection
- The system behavior is consistent between VIP interface and regular booking flow

## Files Modified

- `app/api/bookings/create/route.ts` - Updated `getPackageInfo()` function
- `docs/package-selection-improvement.md` - This documentation

## Related Features

This improvement aligns the booking creation logic with the existing VIP package categorization logic found in:
- `app/api/vip/packages/route.ts` - VIP package filtering and categorization
- `components/vip/PackagesList.tsx` - VIP package display logic 