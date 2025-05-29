#!/usr/bin/env node

/**
 * Debug script to manually sync packages for a specific user
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const crmUrl = process.env.NEXT_PUBLIC_CRM_SUPABASE_URL;
const crmKey = process.env.NEXT_PUBLIC_CRM_SUPABASE_KEY;

if (!supabaseUrl || !supabaseServiceKey || !crmUrl || !crmKey) {
  console.error('Missing required environment variables');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);
const crmSupabase = createClient(crmUrl, crmKey);

async function syncUserPackages() {
  const userId = '2f3cf053-af38-437f-8909-f02647b15bda';
  const stableHashId = '519cefd56a0595cd29e6a0ec1e0a6296';
  
  console.log(`🔍 Debugging package sync for user: ${userId}`);
  console.log(`📋 Stable Hash ID: ${stableHashId}`);

  try {
    // First, verify the profile data
    console.log('1️⃣ Checking profile data...');
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select(`
        id,
        display_name,
        vip_customer_data_id,
        vip_customer_data:vip_customer_data_id (
          stable_hash_id
        )
      `)
      .eq('id', userId)
      .single();

    if (profileError) {
      console.error('❌ Profile error:', profileError);
      return;
    }

    console.log('✅ Profile data:', profile);

    // Get CRM packages using the stable_hash_id
    console.log('2️⃣ Fetching CRM packages...');
    const { data: crmPackages, error: crmError } = await crmSupabase
      .rpc('get_packages_by_hash_id', { p_stable_hash_id: stableHashId });

    if (crmError) {
      console.error('❌ CRM error:', crmError);
      return;
    }

    console.log(`✅ Found ${crmPackages?.length || 0} CRM packages`);
    if (crmPackages && crmPackages.length > 0) {
      console.log('📦 First package sample:', JSON.stringify(crmPackages[0], null, 2));
    }

    // Check current packages in production
    console.log('3️⃣ Checking current production packages...');
    const { data: currentPackages, error: currentError } = await supabase
      .from('crm_packages')
      .select('*')
      .eq('stable_hash_id', stableHashId);

    if (currentError) {
      console.error('❌ Current packages error:', currentError);
      return;
    }

    console.log(`📦 Current production packages: ${currentPackages?.length || 0}`);

    // Sync packages if we have CRM data
    if (crmPackages && crmPackages.length > 0) {
      console.log('4️⃣ Syncing packages...');
      
      // Filter valid packages
      const validPackages = crmPackages.filter((pkg) => {
        const expirationDate = pkg.expiration_date ? new Date(pkg.expiration_date) : null;
        return expirationDate && expirationDate > new Date();
      });

      console.log(`🔍 Valid packages (not expired): ${validPackages.length}`);

      if (validPackages.length > 0) {
        // Delete existing packages first
        const { error: deleteError } = await supabase
          .from('crm_packages')
          .delete()
          .eq('stable_hash_id', stableHashId);

        if (deleteError) {
          console.error('❌ Delete error:', deleteError);
          return;
        }

        console.log('🗑️ Deleted existing packages');

        // Prepare new packages
        const packagesToInsert = validPackages.map((pkg) => ({
          crm_package_id: String(pkg.id),
          stable_hash_id: stableHashId,
          customer_name: pkg.customer_name || '',
          
          // Rich package information - try multiple field patterns
          package_name: pkg.package_name_from_def || pkg.package_name || null,
          package_display_name: pkg.package_display_name_from_def || pkg.package_display_name || null,
          package_type_name: pkg.package_type_from_def || pkg.package_type_name || null,
          package_category: pkg.package_type_from_def || pkg.package_category || null,
          total_hours: pkg.package_total_hours_from_def !== undefined ? pkg.package_total_hours_from_def : pkg.total_hours,
          pax: pkg.package_pax_from_def !== undefined ? pkg.package_pax_from_def : pkg.pax,
          validity_period_definition: pkg.package_validity_period_from_def || pkg.validity_period_definition || null,
          
          first_use_date: pkg.first_use_date || null,
          expiration_date: pkg.expiration_date || null,
          purchase_date: pkg.created_at_for_purchase_date || pkg.purchase_date || null,
          
          remaining_hours: pkg.calculated_remaining_hours !== undefined ? pkg.calculated_remaining_hours : pkg.remaining_hours,
          used_hours: pkg.calculated_used_hours !== undefined ? pkg.calculated_used_hours : pkg.used_hours,
          
          updated_at: new Date().toISOString(),
          created_at: new Date().toISOString()
        }));

        console.log('📝 Packages to insert:', JSON.stringify(packagesToInsert, null, 2));

        // Insert new packages
        const { error: insertError } = await supabase
          .from('crm_packages')
          .insert(packagesToInsert);

        if (insertError) {
          console.error('❌ Insert error:', insertError);
          return;
        }

        console.log(`✅ Successfully inserted ${packagesToInsert.length} packages`);

        // Verify the result
        const { data: verifyPackages, error: verifyError } = await supabase
          .from('crm_packages')
          .select('id, package_name, package_display_name, package_type_name, total_hours, remaining_hours')
          .eq('stable_hash_id', stableHashId);

        if (verifyError) {
          console.error('❌ Verify error:', verifyError);
          return;
        }

        console.log('🔍 Final verification:');
        verifyPackages.forEach((pkg, idx) => {
          console.log(`   ${idx + 1}. ${pkg.package_display_name || pkg.package_name || 'Unknown'} (${pkg.total_hours}h total, ${pkg.remaining_hours}h remaining)`);
        });
      } else {
        console.log('ℹ️  No valid packages to sync (all expired)');
      }
    } else {
      console.log('ℹ️  No CRM packages found');
    }

  } catch (error) {
    console.error('❌ Script failed:', error);
    process.exit(1);
  }
}

// Run the sync
syncUserPackages(); 