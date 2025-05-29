#!/usr/bin/env node

/**
 * Migration script to copy rich package data from crm_packages_vip_staging to crm_packages
 * This is a one-time fix to populate missing rich data in production
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

async function migrateRichPackageData() {
  console.log('🚀 Starting migration of rich package data from staging to production...');

  try {
    // Get all records from staging table with rich data
    const { data: stagingPackages, error: stagingError } = await supabase
      .from('crm_packages_vip_staging')
      .select('*');

    if (stagingError) {
      throw new Error(`Error fetching staging packages: ${stagingError.message}`);
    }

    console.log(`📦 Found ${stagingPackages.length} packages in staging table`);

    // Get all records from production table
    const { data: productionPackages, error: productionError } = await supabase
      .from('crm_packages')
      .select('id, stable_hash_id, crm_package_id');

    if (productionError) {
      throw new Error(`Error fetching production packages: ${productionError.message}`);
    }

    console.log(`📦 Found ${productionPackages.length} packages in production table`);

    // Create a map for faster lookups
    const productionMap = new Map();
    productionPackages.forEach(pkg => {
      const key = `${pkg.stable_hash_id}-${pkg.crm_package_id}`;
      productionMap.set(key, pkg.id);
    });

    const updatePromises = [];
    let matchedCount = 0;
    let skippedCount = 0;

    // Match staging packages to production packages and prepare updates
    for (const stagingPkg of stagingPackages) {
      const key = `${stagingPkg.stable_hash_id}-${stagingPkg.crm_package_id}`;
      const productionId = productionMap.get(key);

      if (productionId) {
        matchedCount++;
        
        // Prepare update with rich data from staging
        const updateData = {
          package_name: stagingPkg.package_name,
          package_display_name: stagingPkg.package_display_name,
          package_type_name: stagingPkg.package_type_name,
          package_category: stagingPkg.package_category,
          total_hours: stagingPkg.total_hours,
          pax: stagingPkg.pax,
          validity_period_definition: stagingPkg.validity_period_definition,
          purchase_date: stagingPkg.purchase_date,
          used_hours: stagingPkg.used_hours,
          updated_at: new Date().toISOString()
        };

        updatePromises.push(
          supabase
            .from('crm_packages')
            .update(updateData)
            .eq('id', productionId)
        );
      } else {
        skippedCount++;
        console.log(`⚠️  No matching production record for staging package: ${stagingPkg.id} (${key})`);
      }
    }

    console.log(`✅ Matched ${matchedCount} packages, ${skippedCount} skipped`);

    if (updatePromises.length > 0) {
      console.log('📝 Executing updates...');
      
      // Execute updates in batches to avoid overwhelming the database
      const batchSize = 10;
      for (let i = 0; i < updatePromises.length; i += batchSize) {
        const batch = updatePromises.slice(i, i + batchSize);
        const results = await Promise.allSettled(batch);
        
        const successful = results.filter(r => r.status === 'fulfilled').length;
        const failed = results.filter(r => r.status === 'rejected').length;
        
        console.log(`📊 Batch ${Math.floor(i/batchSize) + 1}: ${successful} successful, ${failed} failed`);
        
        if (failed > 0) {
          const errors = results
            .filter(r => r.status === 'rejected')
            .map(r => r.reason);
          console.error('❌ Batch errors:', errors);
        }
      }
      
      console.log('✅ Migration completed!');
    } else {
      console.log('ℹ️  No updates needed - no matching records found');
    }

    // Verify the migration
    console.log('🔍 Verifying migration...');
    const { data: verifyData, error: verifyError } = await supabase
      .from('crm_packages')
      .select('COUNT(*) as total, COUNT(package_name) as has_package_name, COUNT(package_display_name) as has_display_name, COUNT(total_hours) as has_total_hours')
      .single();

    if (verifyError) {
      console.error('❌ Verification failed:', verifyError);
    } else {
      console.log('📊 Verification results:', verifyData);
    }

  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  }
}

// Run the migration
migrateRichPackageData(); 