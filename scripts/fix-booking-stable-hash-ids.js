#!/usr/bin/env node

/**
 * Fix Booking Stable Hash IDs Script
 * 
 * This script updates existing bookings to use the correct stable_hash_id
 * from the updated customer mappings. It also updates booking_type and 
 * package_name based on available packages.
 * 
 * Usage: node scripts/fix-booking-stable-hash-ids.js [options]
 * 
 * Options:
 *   --dry-run: Show what would be changed without making changes
 *   --batch-size=N: Process N bookings at a time (default: 100)
 *   --since=YYYY-MM-DD: Only process bookings created since this date
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

// Configuration
const CONFIG = {
  batchSize: parseInt(process.argv.find(arg => arg.startsWith('--batch-size='))?.split('=')[1]) || 100,
  dryRun: process.argv.includes('--dry-run'),
  since: process.argv.find(arg => arg.startsWith('--since='))?.split('=')[1] || '2025-05-01'
};

// Initialize Supabase client with service role
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false
    }
  }
);

// Statistics tracking
const stats = {
  totalBookings: 0,
  processed: 0,
  updated: 0,
  packageUpdated: 0,
  errors: 0,
  skipped: 0,
  startTime: Date.now()
};

async function getPackageInfo(stableHashId) {
  if (!stableHashId) return { bookingType: 'Normal Bay Rate', packageName: null };
  
  try {
    const { data: packages, error } = await supabase
      .schema('backoffice')
      .rpc('get_packages_by_hash_id', { p_stable_hash_id: stableHashId });
    
    if (error || !packages || packages.length === 0) {
      return { bookingType: 'Normal Bay Rate', packageName: null };
    }
    
    const now = new Date();
    
    // Filter for active, non-coaching packages
    const activePackages = packages.filter(pkg => {
      if (pkg.package_type_from_def?.toLowerCase().includes('coaching') || 
          pkg.package_name_from_def?.toLowerCase().includes('coaching')) {
        return false;
      }
      
      const expirationDate = new Date(pkg.expiration_date || '');
      const isNotExpired = expirationDate > now;
      const hasRemainingCapacity = pkg.calculated_remaining_hours === undefined || 
                                  pkg.calculated_remaining_hours === null || 
                                  pkg.calculated_remaining_hours > 0;
      
      return isNotExpired && hasRemainingCapacity;
    });
    
    if (activePackages.length > 0) {
      // Sort by remaining hours and expiration date
      const sortedPackages = activePackages.sort((a, b) => {
        const aRemainingHours = a.calculated_remaining_hours ?? Infinity;
        const bRemainingHours = b.calculated_remaining_hours ?? Infinity;
        
        if (aRemainingHours !== bRemainingHours) {
          return bRemainingHours - aRemainingHours;
        }
        
        const aExpiration = new Date(a.expiration_date || '1970-01-01').getTime();
        const bExpiration = new Date(b.expiration_date || '1970-01-01').getTime();
        
        return bExpiration - aExpiration;
      });
      
      const selectedPackage = sortedPackages[0];
      const packageName = selectedPackage.package_display_name_from_def || 
                         selectedPackage.package_name_from_def || 
                         'Package';
      
      return { bookingType: 'Package', packageName };
    }
    
    return { bookingType: 'Normal Bay Rate', packageName: null };
  } catch (error) {
    console.error('Error getting package info:', error);
    return { bookingType: 'Normal Bay Rate', packageName: null };
  }
}

async function processBooking(booking, correctMappings) {
  try {
    const userId = booking.user_id;
    const correctMapping = correctMappings.get(userId);
    
    if (!correctMapping) {
      console.log(`  ⏭️  Skipping booking ${booking.id} - no mapping found for user ${userId}`);
      stats.skipped++;
      return;
    }
    
    const correctStableHashId = correctMapping.stable_hash_id;
    const needsStableHashUpdate = booking.stable_hash_id !== correctStableHashId;
    
    // Get package info for the correct stable_hash_id
    const { bookingType, packageName } = await getPackageInfo(correctStableHashId);
    const needsPackageUpdate = booking.booking_type !== bookingType || booking.package_name !== packageName;
    
    if (!needsStableHashUpdate && !needsPackageUpdate) {
      console.log(`  ✓ Booking ${booking.id} already correct`);
      stats.processed++;
      return;
    }
    
    console.log(`\n📝 Booking ${booking.id} (${booking.name} - ${booking.date})`);
    
    if (needsStableHashUpdate) {
      console.log(`  🔄 Stable Hash: ${booking.stable_hash_id} → ${correctStableHashId}`);
    }
    
    if (needsPackageUpdate) {
      console.log(`  📦 Package: ${booking.booking_type || 'null'}/${booking.package_name || 'null'} → ${bookingType}/${packageName || 'null'}`);
    }
    
    if (!CONFIG.dryRun) {
      const updateData = {};
      
      if (needsStableHashUpdate) {
        updateData.stable_hash_id = correctStableHashId;
      }
      
      if (needsPackageUpdate) {
        updateData.booking_type = bookingType;
        updateData.package_name = packageName;
      }
      
      updateData.updated_at = new Date().toISOString();
      
      const { error } = await supabase
        .from('bookings')
        .update(updateData)
        .eq('id', booking.id);
      
      if (error) {
        console.error(`  ❌ Error updating booking ${booking.id}: ${error.message}`);
        stats.errors++;
        return;
      }
      
      console.log(`  ✅ Updated successfully`);
    } else {
      console.log(`  🔍 Would update (dry run)`);
    }
    
    stats.updated++;
    if (needsPackageUpdate) {
      stats.packageUpdated++;
    }
    stats.processed++;
    
  } catch (error) {
    console.error(`  ❌ Error processing booking ${booking.id}: ${error.message}`);
    stats.errors++;
  }
}

async function main() {
  console.log('🚀 Starting Booking Stable Hash ID Fix Script');
  console.log(`📊 Configuration:`, CONFIG);
  
  if (CONFIG.dryRun) {
    console.log('🔍 DRY RUN MODE - No changes will be made');
  }
  
  try {
    // Get all current correct mappings
    console.log('\n📋 Fetching current customer mappings...');
    const { data: mappings, error: mappingsError } = await supabase
      .from('crm_customer_mapping')
      .select('profile_id, stable_hash_id, crm_customer_id')
      .eq('is_matched', true);
    
    if (mappingsError) {
      throw new Error(`Failed to fetch mappings: ${mappingsError.message}`);
    }
    
    // Create a map for quick lookup
    const correctMappings = new Map();
    mappings.forEach(mapping => {
      correctMappings.set(mapping.profile_id, mapping);
    });
    
    console.log(`✅ Loaded ${mappings.length} customer mappings`);
    
    // Fetch bookings that need fixing
    console.log(`\n📚 Fetching bookings since ${CONFIG.since}...`);
    const { data: bookings, error: bookingsError } = await supabase
      .from('bookings')
      .select('id, user_id, name, date, stable_hash_id, booking_type, package_name, created_at')
      .gte('created_at', CONFIG.since)
      .order('created_at', { ascending: false });
    
    if (bookingsError) {
      throw new Error(`Failed to fetch bookings: ${bookingsError.message}`);
    }
    
    stats.totalBookings = bookings.length;
    console.log(`✅ Loaded ${bookings.length} bookings to check`);
    
    // Process bookings in batches
    console.log(`\n🔄 Processing bookings in batches of ${CONFIG.batchSize}...`);
    
    for (let i = 0; i < bookings.length; i += CONFIG.batchSize) {
      const batch = bookings.slice(i, i + CONFIG.batchSize);
      const batchNum = Math.floor(i / CONFIG.batchSize) + 1;
      const totalBatches = Math.ceil(bookings.length / CONFIG.batchSize);
      
      console.log(`\n📦 Processing batch ${batchNum}/${totalBatches} (bookings ${i + 1}-${Math.min(i + CONFIG.batchSize, bookings.length)})`);
      
      // Process batch sequentially to avoid overwhelming the database
      for (const booking of batch) {
        await processBooking(booking, correctMappings);
      }
      
      // Progress update
      const progress = ((i + CONFIG.batchSize) / bookings.length * 100).toFixed(1);
      const elapsed = (Date.now() - stats.startTime) / 1000;
      const rate = stats.processed / elapsed;
      const eta = (bookings.length - stats.processed) / rate;
      
      console.log(`📊 Progress: ${progress}% | Processed: ${stats.processed} | Updated: ${stats.updated} | Rate: ${rate.toFixed(1)}/s | ETA: ${Math.round(eta)}s`);
      
      // Small delay between batches
      if (i + CONFIG.batchSize < bookings.length) {
        await new Promise(resolve => setTimeout(resolve, 50));
      }
    }
    
    // Final statistics
    const totalTime = (Date.now() - stats.startTime) / 1000;
    
    console.log('\n🎉 Booking Fix Complete!');
    console.log('📊 Final Statistics:');
    console.log(`  Total Bookings: ${stats.totalBookings}`);
    console.log(`  Processed: ${stats.processed}`);
    console.log(`  Updated: ${stats.updated} (${(stats.updated / stats.processed * 100).toFixed(1)}%)`);
    console.log(`  Package Info Updated: ${stats.packageUpdated}`);
    console.log(`  Skipped: ${stats.skipped}`);
    console.log(`  Errors: ${stats.errors}`);
    console.log(`  Total Time: ${totalTime.toFixed(1)}s`);
    console.log(`  Average Rate: ${(stats.processed / totalTime).toFixed(1)} bookings/second`);
    
    if (CONFIG.dryRun) {
      console.log('\n🔍 This was a DRY RUN - no changes were made');
      console.log('   Run without --dry-run to apply changes');
    }
    
  } catch (error) {
    console.error('\n❌ Script failed:', error.message);
    process.exit(1);
  }
}

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('\n⏹️  Script interrupted by user');
  console.log('📊 Partial Statistics:');
  console.log(`  Processed: ${stats.processed}/${stats.totalBookings}`);
  console.log(`  Updated: ${stats.updated}`);
  console.log(`  Errors: ${stats.errors}`);
  process.exit(0);
});

// Run the script
main().catch(error => {
  console.error('❌ Unhandled error:', error);
  process.exit(1);
}); 