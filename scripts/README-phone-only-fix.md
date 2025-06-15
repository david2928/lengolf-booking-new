# Phone-Only Customer Link Fix

This script fixes customer mappings using **only phone number matching** with high confidence thresholds. It focuses on ensuring future bookings work correctly rather than fixing historical data.

## Key Features

- **Phone-only matching**: Uses only phone numbers for customer matching
- **High confidence threshold**: Default 0.8 confidence minimum (configurable)
- **Future-focused**: Fixes mappings for future bookings, leaves historical data unchanged
- **Safe operation**: Dry-run mode, doesn't remove existing mappings
- **Progress tracking**: Real-time progress with ETA

## Usage

### Basic Usage
```bash
# Dry run to see what would be changed
node scripts/fix-customer-links-phone-only.js --dry-run

# Apply changes with default settings
node scripts/fix-customer-links-phone-only.js
```

### Advanced Options
```bash
# Higher confidence threshold (more strict)
node scripts/fix-customer-links-phone-only.js --confidence=0.9

# Smaller batch size for slower processing
node scripts/fix-customer-links-phone-only.js --batch-size=25

# Combined options
node scripts/fix-customer-links-phone-only.js --dry-run --confidence=0.85 --batch-size=30
```

## Configuration Options

| Option | Default | Description |
|--------|---------|-------------|
| `--dry-run` | false | Show changes without applying them |
| `--confidence=N` | 0.8 | Minimum confidence threshold (0.0-1.0) |
| `--batch-size=N` | 50 | Number of profiles to process per batch |

## How It Works

1. **Loads CRM customers** with phone numbers from `backoffice.customers`
2. **Loads user profiles** with phone numbers from `profiles`
3. **Phone matching only**: Compares normalized phone numbers
4. **High confidence filtering**: Only matches with confidence >= threshold
5. **Safe updates**: Updates `crm_customer_mapping` and `crm_profile_links`
6. **Preserves existing**: Doesn't remove existing mappings, only improves them

## Phone Matching Logic

- **Exact match**: 1.0 confidence
- **Very similar** (≥95% similarity): 0.9 confidence  
- **Similar** (≥90% similarity): 0.85 confidence
- **Partial match**: Calculated similarity score

Phone numbers are normalized by removing spaces, dashes, parentheses, and country codes.

## Safety Features

- **Dry-run mode**: Test before applying changes
- **Preserves existing mappings**: Won't delete current links
- **Graceful interruption**: Ctrl+C shows progress and exits cleanly
- **Error handling**: Continues processing even if individual profiles fail
- **Detailed logging**: Shows exactly what's being matched and why

## Expected Results

Based on the previous analysis, this script should:
- Process ~749 user profiles with phone numbers
- Match ~200-300 customers with high confidence
- Fix the customer mapping issues causing "Normal Bay Rate" problems
- Ensure future bookings automatically detect packages correctly

## Example Output

```
🚀 Starting Phone-Only Customer Link Fix
📊 Configuration: { batchSize: 50, dryRun: false, confidenceThreshold: 0.8 }
📞 Phone matching only with confidence >= 0.8

📋 Fetching CRM customers...
✅ Loaded 1,234 CRM customers with phone numbers

👥 Fetching user profiles with phone numbers...
✅ Loaded 749 user profiles with phone numbers

📦 Batch 1/15 (profiles 1-50)

Processing: Glenn Kluse (0812345678)
  ✅ Phone match: Glenn Kluse
  📞 Customer phone: 0812345678
  🔗 Stable hash: 0cd9433836a7a4613c0d73735037aa45
  📊 Confidence: 1.000 (exact_phone_match)
  🔄 Updating mapping (was: e3d5e074593733400be53f082214eb2a)
  ✅ Mapping saved successfully

📊 Progress: 6.7% | Processed: 50 | Matched: 23 | Rate: 12.5/s | ETA: 56s

🎉 Phone-Only Link Fix Complete!
📊 Final Statistics:
  Total Profiles: 749
  Processed: 749
  Matched: 287 (38.3%)
  Updated: 246
  Created: 41
  Skipped: 0
  Errors: 0
  Total Time: 60.2s
  Average Rate: 12.4 profiles/second
  Confidence Threshold: 0.8

✅ Future bookings will now use correct customer mappings
   Historical bookings were left unchanged as requested
```

## What This Fixes

After running this script:
- ✅ Future bookings will automatically detect customer packages
- ✅ VIP features will work correctly for matched customers  
- ✅ "Normal Bay Rate" issue will be resolved for new bookings
- ✅ Customer data consistency improved
- ❌ Historical bookings remain unchanged (as requested)

## Troubleshooting

**Low match rate**: Try lowering confidence threshold with `--confidence=0.7`

**Script too fast**: Use smaller batch size with `--batch-size=25`

**Want to test first**: Always use `--dry-run` for initial testing

**Need to stop**: Press Ctrl+C for graceful shutdown with progress report 