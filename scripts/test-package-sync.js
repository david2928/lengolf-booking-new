#!/usr/bin/env node

/**
 * Test script to manually trigger package sync for a specific user
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing required environment variables');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function testPackageSync() {
  console.log('🔍 Looking for a user with VIP customer data to test sync...');

  try {
    // Find a user with VIP customer data and stable_hash_id
    const { data: vipUsers, error: vipError } = await supabase
      .from('profiles')
      .select(`
        id,
        display_name,
        vip_customer_data:vip_customer_data_id (
          stable_hash_id
        )
      `)
      .not('vip_customer_data_id', 'is', null)
      .limit(1);

    if (vipError) {
      throw new Error(`Error fetching VIP users: ${vipError.message}`);
    }

    if (!vipUsers || vipUsers.length === 0) {
      console.log('❌ No VIP users found with customer data');
      return;
    }

    const testUser = vipUsers[0];
    const stableHashId = testUser.vip_customer_data?.stable_hash_id;

    if (!stableHashId) {
      console.log('❌ Test user has no stable_hash_id');
      return;
    }

    console.log(`✅ Found test user: ${testUser.display_name} (${testUser.id})`);
    console.log(`📋 Stable Hash ID: ${stableHashId}`);

    // Check current packages for this user
    const { data: currentPackages, error: currentError } = await supabase
      .from('crm_packages')
      .select('id, package_name, package_display_name, total_hours, remaining_hours')
      .eq('stable_hash_id', stableHashId);

    if (currentError) {
      console.error('Error fetching current packages:', currentError);
    } else {
      console.log(`📦 Current packages count: ${currentPackages.length}`);
      currentPackages.forEach((pkg, idx) => {
        console.log(`   ${idx + 1}. ${pkg.package_display_name || pkg.package_name || 'Unknown'} (${pkg.total_hours}h total, ${pkg.remaining_hours}h remaining)`);
      });
    }

    // Import and run the sync function
    console.log('🔄 Running package sync...');
    
    // Since we're using CommonJS, we need to dynamically import the ES module
    const { syncPackagesForProfile } = await import('../utils/supabase/crm-packages.js');
    
    await syncPackagesForProfile(testUser.id);

    console.log('✅ Sync completed! Checking updated packages...');

    // Check packages after sync
    const { data: updatedPackages, error: updatedError } = await supabase
      .from('crm_packages')
      .select('id, package_name, package_display_name, total_hours, remaining_hours, updated_at')
      .eq('stable_hash_id', stableHashId);

    if (updatedError) {
      console.error('Error fetching updated packages:', updatedError);
    } else {
      console.log(`📦 Updated packages count: ${updatedPackages.length}`);
      updatedPackages.forEach((pkg, idx) => {
        console.log(`   ${idx + 1}. ${pkg.package_display_name || pkg.package_name || 'Unknown'} (${pkg.total_hours}h total, ${pkg.remaining_hours}h remaining) - Updated: ${pkg.updated_at}`);
      });
    }

  } catch (error) {
    console.error('❌ Test failed:', error);
    process.exit(1);
  }
}

// Run the test
testPackageSync(); 