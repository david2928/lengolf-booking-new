# Customer Re-linking Scripts

This directory contains scripts to fix the `stable_hash_id` inconsistencies discovered in the customer mapping system. The issue was that many customer mappings were pointing to `stable_hash_id` values that don't exist in the source of truth (`backoffice.customers` table).

## Problem Summary

- **Root Cause**: Customer matching architecture V2 migration left stale `stable_hash_id` mappings
- **Impact**: 246+ customers with incorrect mappings, causing bookings to show "Normal Bay Rate" instead of their packages
- **Solution**: Re-run customer matching logic for all users using the source of truth

## Scripts Overview

### 1. `comprehensive-customer-relink.js`
**Purpose**: Re-runs customer matching logic for all users to rebuild correct links from scratch.

**Features**:
- Uses the same matching logic as the production system
- Processes users in batches to avoid overwhelming the database
- Supports dry-run mode to preview changes
- Creates backups before making changes
- Comprehensive progress tracking and statistics

**Usage**:
```bash
# Dry run to see what would be changed
node scripts/comprehensive-customer-relink.js --dry-run

# Run with default settings (batch size 50)
node scripts/comprehensive-customer-relink.js

# Run with custom batch size
node scripts/comprehensive-customer-relink.js --batch-size=25

# Force mode: clear existing mappings and rebuild from scratch
node scripts/comprehensive-customer-relink.js --force

# Start from a specific profile ID (useful for resuming)
node scripts/comprehensive-customer-relink.js --start-from=uuid-here
```

### 2. `fix-booking-stable-hash-ids.js`
**Purpose**: Updates existing bookings to use correct `stable_hash_id` values and fixes package detection.

**Features**:
- Updates bookings with correct `stable_hash_id` from fixed customer mappings
- Recalculates `booking_type` and `package_name` based on available packages
- Processes bookings since a specified date
- Batch processing with progress tracking

**Usage**:
```bash
# Dry run to see what bookings would be updated
node scripts/fix-booking-stable-hash-ids.js --dry-run

# Fix bookings since May 1, 2025 (default)
node scripts/fix-booking-stable-hash-ids.js

# Fix bookings since a specific date
node scripts/fix-booking-stable-hash-ids.js --since=2025-06-01

# Custom batch size
node scripts/fix-booking-stable-hash-ids.js --batch-size=50
```

## Recommended Execution Order

1. **First**: Run the customer re-linking script in dry-run mode to assess the scope:
   ```bash
   node scripts/comprehensive-customer-relink.js --dry-run
   ```

2. **Second**: Execute the customer re-linking script to fix the mappings:
   ```bash
   node scripts/comprehensive-customer-relink.js
   ```

3. **Third**: Fix the existing bookings to use correct stable_hash_ids:
   ```bash
   node scripts/fix-booking-stable-hash-ids.js --dry-run
   node scripts/fix-booking-stable-hash-ids.js
   ```

## Safety Features

### Dry Run Mode
Both scripts support `--dry-run` mode that shows exactly what would be changed without making any modifications. Always run this first to understand the impact.

### Automatic Backups
The customer re-linking script automatically creates backups of the `crm_customer_mapping` table before making changes (when using `--force` mode).

### Graceful Interruption
Both scripts handle `Ctrl+C` gracefully, showing partial statistics before exiting.

### Batch Processing
Processing is done in batches to avoid overwhelming the database and allow for monitoring progress.

### Timeout Protection
Each profile/booking has a timeout to prevent the script from hanging on problematic records.

## Monitoring Progress

Both scripts provide real-time progress updates including:
- Number of records processed
- Success/failure rates
- Processing speed (records per second)
- Estimated time to completion
- Detailed statistics at the end

## Expected Results

### Customer Re-linking Script
- **Total Profiles**: ~749 profiles in the system
- **Expected Matches**: ~60-70% of profiles (based on available data quality)
- **Processing Time**: ~5-10 minutes for all profiles
- **Updates**: Will fix the 246+ customers with incorrect mappings

### Booking Fix Script
- **Bookings Since May 2025**: ~500+ bookings
- **Expected Updates**: Bookings from customers with fixed mappings
- **Package Detection**: Will correctly identify packages for customers with active packages
- **Processing Time**: ~2-3 minutes for recent bookings

## Verification

After running the scripts, you can verify the fixes:

```sql
-- Check for remaining inconsistent mappings
SELECT COUNT(*) as remaining_inconsistent_customers
FROM crm_customer_mapping ccm
LEFT JOIN backoffice.customers bc ON ccm.stable_hash_id = bc.stable_hash_id
WHERE bc.stable_hash_id IS NULL 
  AND ccm.is_matched = true;

-- Check a specific booking that was previously showing "Normal Bay Rate"
SELECT id, name, date, booking_type, package_name, stable_hash_id
FROM bookings 
WHERE id = 'BK25061338G7';

-- Check package detection for a customer
SELECT * FROM backoffice.get_packages_by_hash_id('0cd9433836a7a4613c0d73735037aa45');
```

## Troubleshooting

### Script Fails to Start
- Ensure `.env` file has correct `SUPABASE_SERVICE_ROLE_KEY`
- Check that Node.js dependencies are installed: `npm install`

### High Error Rate
- Check database connectivity
- Verify the `backoffice.customers` table is accessible
- Review error messages for specific issues

### Slow Performance
- Reduce batch size: `--batch-size=25`
- Check database load and network connectivity
- Consider running during off-peak hours

### Partial Completion
- Use `--start-from=uuid` to resume from where it left off
- Check the partial statistics shown on interruption

## Manual Verification Examples

The scripts have already been tested on several customers:

1. **Glenn Kluse** (BK25061338G7): Fixed from incorrect hash to correct "Early Bird +" package
2. **David Geiermann**: Fixed 23+ bookings, now shows correct package usage
3. **Stuart Balfour**: Fixed mapping (package expired but mapping correct)
4. **Mark Davies & Andrew McGinn**: Fixed mappings

These manual fixes demonstrate the effectiveness of the automated approach. 