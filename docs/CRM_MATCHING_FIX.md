# CRM Matching Fix Documentation

## Problem Description

**Issue**: Booking ID 'BK25060665LK' and potentially other bookings were not getting matched to CRM customer profiles, resulting in `stable_hash_id: null` in booking records.

**Root Cause**: The booking creation API was only using the profile's phone number for CRM matching, ignoring the booking's phone number when they differed.

**Specific Case**:
- **Profile phone**: `+66924315407` (Thailand number)
- **Booking phone**: `+14086854636` (US number)
- **CRM customer phone**: `14086854636` (US number, matches booking)
- **Result**: No CRM match found because profile phone didn't match CRM

## Solution Implemented

### 1. Code Changes

#### Updated `app/api/bookings/create/route.ts`
- Modified the CRM matching logic to pass the **booking phone number** to the matching function
- Added logging to track when booking phone number is used for matching

**Before**:
```typescript
return await getOrCreateCrmMapping(userId, { source: 'booking' });
```

**After**:
```typescript
return await getOrCreateCrmMapping(userId, { 
  source: 'booking',
  phoneNumberToMatch: phone_number  // Use booking phone for matching
});
```

#### Updated `utils/customer-matching.ts`
- Extended `getOrCreateCrmMapping` function to accept `phoneNumberToMatch` parameter
- Enhanced logging to show when booking phone number is being used
- Updated TypeScript interfaces to support the new parameter

### 2. Retroactive Fix Script

Created `scripts/fix-booking-crm-matching.js` to fix existing bookings that weren't properly matched.

**What the script does**:
1. Fetches the specific booking details
2. Searches CRM customers using the booking phone number
3. Finds the best matching customer using phone + name matching
4. Creates/updates the CRM customer mapping
5. Updates the booking with the correct `stable_hash_id`
6. Updates the profile with the `stable_hash_id`

## How to Use

### For Future Bookings
The fix is automatic - new bookings will now use the booking phone number for CRM matching when the profile phone number doesn't match.

### For Existing Bookings

#### Run the Fix Script
```bash
# Set environment variables
export SUPABASE_SERVICE_ROLE_KEY="your_service_role_key"
export NEXT_PUBLIC_CRM_SUPABASE_KEY="your_crm_key"

# Run the fix for specific booking
node scripts/fix-booking-crm-matching.js
```

#### Modify for Different Bookings
Edit the `BOOKING_ID` constant in the script:
```javascript
const BOOKING_ID = 'BK25060665LK'; // Change this to target different booking
```

### Find Other Affected Bookings
```sql
-- Find bookings with null stable_hash_id that might need fixing
SELECT id, user_id, name, phone_number, email, date, created_at 
FROM bookings 
WHERE stable_hash_id IS NULL 
ORDER BY created_at DESC;
```

## Technical Details

### Matching Logic Priority
1. **Existing CRM mapping**: If profile already has a CRM mapping, use it
2. **Booking phone matching**: If no mapping exists, try matching using booking phone number
3. **Profile phone fallback**: If booking phone doesn't match, fall back to profile phone
4. **Placeholder creation**: If no match found, create placeholder mapping

### Phone Number Matching
- Normalizes phone numbers by removing non-digit characters
- Handles international format differences (with/without + and country codes)
- Uses similarity scoring with exact matches getting highest priority

### Confidence Scoring
- Phone exact match: 0.7 points
- Name exact match: 0.5 points
- Threshold for automatic matching: 0.85
- Boost applied for high-quality phone matches near threshold

## Testing

### Verify the Fix Works
1. Create a test booking with a phone number different from the profile
2. Check that the booking gets a `stable_hash_id` if a matching CRM customer exists
3. Verify the CRM mapping is created correctly

### Test the Fix Script
1. Run the script on the known problematic booking `BK25060665LK`
2. Verify the booking now has `stable_hash_id: "2a5c2c9f04c40903b7c2247023551b59"`
3. Check that the CRM mapping was created with `is_matched: true`

## Expected Results

### For BK25060665LK specifically:
- **Booking stable_hash_id**: `"2a5c2c9f04c40903b7c2247023551b59"`
- **CRM Customer ID**: `12225660`
- **Match confidence**: `1.5` (phone exact match + name match)
- **Match method**: `"manual_booking_phone_fix"`

### For future bookings:
- Automatic CRM matching using booking phone number
- Reduced number of bookings with `stable_hash_id: null`
- Better customer data consistency across the system

## Monitoring

Check these metrics to validate the fix is working:
1. **Reduced null stable_hash_ids**: Fewer bookings without CRM links
2. **Increased match rates**: More successful CRM mappings during booking creation
3. **Better package detection**: More bookings should get proper package information

## Rollback Plan

If issues occur, the changes can be reverted by:
1. Reverting the `phoneNumberToMatch` parameter additions
2. Restoring the original `getOrCreateCrmMapping` call in booking creation
3. Running a script to remove any mappings created with `match_method: "manual_booking_phone_fix"` 