#!/usr/bin/env node

/**
 * Comprehensive Customer Mapping Fix Script - V2 Architecture Only
 * 
 * This script fixes all broken customer mappings discovered during the investigation:
 * - 90% of old mappings point to non-existent customers
 * - Migrates all profiles to use V2 architecture only
 * - Removes dependence on stale cached data
 */

const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

// Load environment variables
require('dotenv').config();

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing required environment variables');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

// Import V2 customer matching functions
const { getOrCreateCrmMappingV2 } = require('../utils/customer-matching');

// Logging setup
const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
const logFile = path.join(__dirname, '..', 'logs', `customer-mapping-v2-migration-${timestamp}.log`);

function log(message) {
  const logMessage = `[${new Date().toISOString()}] ${message}`;
  console.log(logMessage);
  fs.appendFileSync(logFile, logMessage + '\n');
}

async function getProblematicProfiles() {
  log('🔍 Identifying profiles with broken customer mappings...');
  
  // Get all profiles that have broken old mappings or no mappings at all
  const { data: profiles, error } = await supabase
    .from('profiles')
    .select(`
      id, 
      display_name, 
      email, 
      phone_number,
      stable_hash_id
    `)
    .order('created_at', { ascending: false });

  if (error) {
    throw new Error(`Failed to fetch profiles: ${error.message}`);
  }

  log(`📊 Found ${profiles.length} total profiles`);

  // Check which ones need fixing
  const problematicProfiles = [];
  
  for (const profile of profiles) {
    // Check if they have a V2 link
    const { data: v2Link } = await supabase
      .from('crm_profile_links')
      .select('stable_hash_id')
      .eq('profile_id', profile.id)
      .single();
    
    if (v2Link) {
      // Check if the V2 link points to a real customer
      const { data: customer } = await supabase
        .schema('backoffice')
        .from('customers')
        .select('id, customer_name')
        .eq('stable_hash_id', v2Link.stable_hash_id)
        .single();
      
      if (customer) {
        continue; // This profile is properly linked
      }
    }

    // Check old mapping
    const { data: oldMapping } = await supabase
      .from('crm_customer_mapping')
      .select('stable_hash_id, is_matched, crm_customer_data')
      .eq('profile_id', profile.id)
      .single();

    let status = 'no_mapping';
    let oldCustomerExists = false;
    
    if (oldMapping?.is_matched && oldMapping.stable_hash_id) {
      const { data: oldCustomer } = await supabase
        .schema('backoffice')
        .from('customers')
        .select('id')
        .eq('stable_hash_id', oldMapping.stable_hash_id)
        .single();
      
      oldCustomerExists = !!oldCustomer;
      status = oldCustomerExists ? 'old_mapping_valid' : 'old_mapping_broken';
    }

    if (status !== 'old_mapping_valid') {
      problematicProfiles.push({
        ...profile,
        status,
        hasPhone: !!(profile.phone_number),
        oldStableHashId: oldMapping?.stable_hash_id || null
      });
    }
  }

  log(`🚨 Found ${problematicProfiles.length} profiles needing fixes`);
  log(`📈 Distribution:`);
  
  const statusCounts = problematicProfiles.reduce((acc, p) => {
    acc[p.status] = (acc[p.status] || 0) + 1;
    return acc;
  }, {});
  
  Object.entries(statusCounts).forEach(([status, count]) => {
    log(`   ${status}: ${count}`);
  });

  return problematicProfiles;
}

async function fixProfile(profile) {
  log(`🔧 Fixing profile: ${profile.display_name} (${profile.id})`);
  
  try {
    // Use V2 architecture to attempt matching
    const result = await getOrCreateCrmMappingV2(profile.id, {
      source: 'v2_migration',
      phoneNumberToMatch: profile.phone_number,
      forceRefresh: true
    });

    if (result) {
      log(`✅ Successfully matched: Customer ${result.crmCustomerId}, Confidence: ${result.confidence}`);
      
      // Update profile stable_hash_id
      await supabase
        .from('profiles')
        .update({ stable_hash_id: result.stableHashId })
        .eq('id', profile.id);

      return {
        success: true,
        result: {
          crmCustomerId: result.crmCustomerId,
          stableHashId: result.stableHashId,
          confidence: result.confidence,
          isNewMatch: result.isNewMatch
        }
      };
    } else {
      log(`⚠️  No match found for profile ${profile.display_name}`);
      return {
        success: false,
        reason: 'no_match_found'
      };
    }
  } catch (error) {
    log(`❌ Error fixing profile ${profile.id}: ${error.message}`);
    return {
      success: false,
      reason: 'error',
      error: error.message
    };
  }
}

async function cleanupOldMappings() {
  log('🧹 Cleaning up old architecture data...');
  
  try {
    // We won't delete the old data yet, but we'll mark it as deprecated
    // This allows for rollback if needed
    
    log('ℹ️  Old crm_customer_mapping table preserved for rollback safety');
    log('ℹ️  Consider removing it after confirming V2 migration success');
    
    return { success: true };
  } catch (error) {
    log(`❌ Error during cleanup: ${error.message}`);
    return { success: false, error: error.message };
  }
}

async function generateReport(results) {
  log('\n📋 MIGRATION SUMMARY REPORT');
  log('='.repeat(50));
  
  const successful = results.filter(r => r.success);
  const failed = results.filter(r => !r.success);
  
  log(`Total profiles processed: ${results.length}`);
  log(`Successfully fixed: ${successful.length}`);
  log(`Failed to fix: ${failed.length}`);
  log(`Success rate: ${((successful.length / results.length) * 100).toFixed(1)}%`);
  
  if (failed.length > 0) {
    log('\n❌ FAILED PROFILES:');
    failed.forEach((result, index) => {
      log(`${index + 1}. ${result.profile.display_name} - ${result.reason}`);
    });
  }
  
  if (successful.length > 0) {
    log('\n✅ SUCCESSFUL MATCHES:');
    successful.slice(0, 10).forEach((result, index) => {
      log(`${index + 1}. ${result.profile.display_name} -> Customer ${result.result.crmCustomerId}`);
    });
    
    if (successful.length > 10) {
      log(`... and ${successful.length - 10} more`);
    }
  }
  
  // Distribution by confidence levels
  const confidenceDistribution = successful.reduce((acc, r) => {
    const confidence = r.result.confidence;
    if (confidence >= 0.9) acc.high++;
    else if (confidence >= 0.7) acc.medium++;
    else acc.low++;
    return acc;
  }, { high: 0, medium: 0, low: 0 });
  
  log('\n📊 CONFIDENCE DISTRIBUTION:');
  log(`High confidence (≥0.9): ${confidenceDistribution.high}`);
  log(`Medium confidence (0.7-0.9): ${confidenceDistribution.medium}`);
  log(`Low confidence (<0.7): ${confidenceDistribution.low}`);
  
  log('\n🎯 NEXT STEPS:');
  log('1. Verify booking notifications now show correct customer names');
  log('2. Test VIP features with migrated profiles');
  log('3. Monitor system for any remaining issues');
  log('4. Consider removing old architecture tables after validation');
  
  return {
    total: results.length,
    successful: successful.length,
    failed: failed.length,
    successRate: (successful.length / results.length) * 100,
    confidenceDistribution
  };
}

async function main() {
  try {
    log('🚀 Starting V2 Customer Mapping Migration');
    log(`📝 Log file: ${logFile}`);
    
    // Step 1: Identify problematic profiles
    const problematicProfiles = await getProblematicProfiles();
    
    if (problematicProfiles.length === 0) {
      log('✅ No profiles need fixing!');
      return;
    }
    
    // Step 2: Fix profiles in batches
    log(`\n🔄 Processing ${problematicProfiles.length} profiles...`);
    
    const results = [];
    const batchSize = 10;
    
    for (let i = 0; i < problematicProfiles.length; i += batchSize) {
      const batch = problematicProfiles.slice(i, i + batchSize);
      log(`\n📦 Processing batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(problematicProfiles.length / batchSize)}`);
      
      for (const profile of batch) {
        const result = await fixProfile(profile);
        results.push({ ...result, profile });
        
        // Small delay to avoid overwhelming the system
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      
      // Longer delay between batches
      if (i + batchSize < problematicProfiles.length) {
        log('⏸️  Pausing between batches...');
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }
    
    // Step 3: Cleanup (optional)
    await cleanupOldMappings();
    
    // Step 4: Generate report
    const report = await generateReport(results);
    
    log('\n🎉 Migration completed successfully!');
    
  } catch (error) {
    log(`💥 Migration failed: ${error.message}`);
    console.error(error);
    process.exit(1);
  }
}

// Run the migration
if (require.main === module) {
  main();
}

module.exports = { main }; 