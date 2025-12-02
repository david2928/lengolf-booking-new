# LINE Customer Linking Issue

## Problem Summary
The Lucky Draw LIFF app shows "Member Access Required" even for customers who have been linked via the backoffice chat, because **two different tables** are used for LINE-to-customer linking.

## Current Architecture

### 1. Backoffice Chat Linking (lengolf-forms)
**File:** `app/api/line/users/[lineUserId]/link-customer/route.ts`

When staff links a LINE user to a customer from the chat interface, it updates:
- `line_users.customer_id` ✅
- `customers.customer_profiles` (JSONB with LINE data) ✅
- `profiles.customer_id` ❌ **NOT UPDATED**

### 2. Lucky Draw Check (lengolf-booking-new)
**File:** `app/liff/lucky-draw/page.tsx` (lines 107-127)

```javascript
const { data: profile } = await supabase
  .from('profiles')
  .select('customer_id')
  .eq('provider', 'line')
  .eq('provider_id', userId)  // LINE user ID
  .single();

if (!profile?.customer_id) {
  setViewState('not-linked');  // Shows "Member Access Required"
}
```

### 3. Booking Flow Linking (lengolf-booking-new)
**File:** `utils/customer-service.ts` (lines 116-126)

When user makes a booking, it updates:
- `profiles.customer_id` ✅

## The Gap
| Action | Updates `line_users.customer_id` | Updates `profiles.customer_id` |
|--------|----------------------------------|-------------------------------|
| Staff links via chat | ✅ Yes | ❌ No |
| User makes booking | ❌ No | ✅ Yes |
| User logs in via LINE | ❌ No | ❌ No (profile created, but no customer_id) |

## Solution Options

### Option A: Update backoffice API to also update `profiles` table
In `lengolf-forms/app/api/line/users/[lineUserId]/link-customer/route.ts`, add after line 102:

```javascript
// ALSO update profiles table for Lucky Draw compatibility
const { error: profilesLinkError } = await refacSupabaseAdmin
  .from('profiles')
  .update({ customer_id: customerId })
  .eq('provider', 'line')
  .eq('provider_id', lineUserId);

if (profilesLinkError) {
  console.error('Error updating profiles table:', profilesLinkError);
}
```

### Option B: Update Lucky Draw to also check `line_users` table
In `lengolf-booking-new/app/liff/lucky-draw/page.tsx`, modify `checkUserStatus` to fallback:

```javascript
// First try profiles table
let customerId = profile?.customer_id;

// Fallback: check line_users table
if (!customerId) {
  const { data: lineUser } = await supabase
    .from('line_users')
    .select('customer_id')
    .eq('line_user_id', userId)
    .single();

  customerId = lineUser?.customer_id;
}
```

### Recommended: Option A
Option A is cleaner - keep the `profiles` table as the single source of truth for the booking app, and update it from both places.

## Related Files
- `lengolf-forms/app/api/line/users/[lineUserId]/link-customer/route.ts` - Backoffice linking API
- `lengolf-forms/src/components/admin/line-chat/CustomerLinkModal.tsx` - Staff UI for linking
- `lengolf-booking-new/app/liff/lucky-draw/page.tsx` - Lucky Draw page that checks linking
- `lengolf-booking-new/utils/customer-service.ts` - Booking flow customer linking
- `lengolf-booking-new/app/api/auth/options.ts` - NextAuth config (creates profiles on LINE login)

## Test Case: Mind Y
- Phone: 0951562650
- LINE User ID: `U6b339c2b7614140c43fa07c7ea663ad3`
- Customer ID: `93baf58e-2d6d-47c1-bd7e-61501b36e51b`
- Had profile with `provider='line'` but `customer_id=null` (manually fixed)
