#!/usr/bin/env node
const path = require('path');
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

console.log('=== Starting Package Sync Script (STAGING) ===');

// Get credentials from environment variables or use defaults
const CREDENTIALS = {
  // Booking Supabase
  SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://bisimqmtxjsptehhqpeg.supabase.co',
  SUPABASE_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJpc2ltcW10eGpzcHRlaGhxcGVnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MzgzOTY5MzEsImV4cCI6MjA1Mzk3MjkzMX0.NZ_mEOOoaKEG1p9LBXkULWwSIr-rWmCbksVZq3OzSYE',
  
  // CRM Supabase
  CRM_SUPABASE_URL: process.env.NEXT_PUBLIC_CRM_SUPABASE_URL || 'https://dujqvigihnlfnvmcdrko.supabase.co',
  CRM_SUPABASE_KEY: process.env.NEXT_PUBLIC_CRM_SUPABASE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImR1anF2aWdpaG5sZm52bWNkcmtvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MzM3NTQyNDYsImV4cCI6MjA0OTMzMDI0Nn0.N-KIgE6_nfAY9LarJgFYFjBvjQ6awVgDmUtsBbNzhZM'
};

// Parse command line arguments
const args = process.argv.slice(2).reduce((acc, arg) => {
  if (arg.startsWith('--')) {
    const [key, value] = arg.substring(2).split('=');
    acc[key] = value || true;
  }
  return acc;
}, {});

// Configuration with defaults and command line overrides
const CONFIG = {
  batchSize: parseInt(args.batchSize || 20, 10),
  debugMode: (process.env.DEBUG_MODE === 'true') || args.debug === 'true',
  profileId: args.profileId || null,
  stableHashId: args.stableHashId || null
};

/**
 * Helper function to log message to console
 */
function log(message, type = 'info', obj = null) {
  const timestamp = new Date().toISOString();
  let logMessage = `[${timestamp}] [${type}] ${message}`;
  
  console.log(logMessage);
  
  // If we have an object to log, pretty print it
  if (obj) {
    const objStr = typeof obj === 'string' ? obj : JSON.stringify(obj, null, 2);
    console.log(objStr);
  }
}

/**
 * Create a client for the CRM database
 */
function createCrmClient() {
  console.log('Creating CRM Supabase client...');
  return createClient(CREDENTIALS.CRM_SUPABASE_URL, CREDENTIALS.CRM_SUPABASE_KEY);
}

/**
 * Create a client for the main booking database
 */
function createMainClient() {
  console.log('Creating Booking Supabase client...');
  return createClient(CREDENTIALS.SUPABASE_URL, CREDENTIALS.SUPABASE_KEY);
}

/**
 * Fetch all stable_hash_id values from both staging mapping and vip_customer_data tables
 */
async function fetchMappingsWithStableHashId() {
  log('Fetching stable_hash_id values from STAGING tables (both mapping and vip_customer_data)...');
  const supabase = createMainClient();
  
  // Get stable_hash_id values from crm_customer_mapping_vip_staging
  let mappingQuery = supabase
    .from('crm_customer_mapping_vip_staging')
    .select('profile_id, stable_hash_id')
    .eq('is_matched', true)
    .not('stable_hash_id', 'is', null);
  
  // Get stable_hash_id values from vip_customer_data (via profiles_vip_staging)
  let vipDataQuery = supabase
    .from('profiles_vip_staging')
    .select(`
      id,
      vip_customer_data!inner(stable_hash_id)
    `)
    .not('vip_customer_data.stable_hash_id', 'is', null);
  
  // Add filters if provided
  if (CONFIG.profileId) {
    mappingQuery = mappingQuery.eq('profile_id', CONFIG.profileId);
    vipDataQuery = vipDataQuery.eq('id', CONFIG.profileId);
    log(`Filtering for specific profile: ${CONFIG.profileId}`);
  }
  
  if (CONFIG.stableHashId) {
    mappingQuery = mappingQuery.eq('stable_hash_id', CONFIG.stableHashId);
    vipDataQuery = vipDataQuery.eq('vip_customer_data.stable_hash_id', CONFIG.stableHashId);
    log(`Filtering for specific stable hash ID: ${CONFIG.stableHashId}`);
  }
  
  const [mappingResult, vipDataResult] = await Promise.all([
    mappingQuery,
    vipDataQuery
  ]);
  
  if (mappingResult.error) {
    log(`Error fetching CRM mappings: ${mappingResult.error.message}`, 'error');
  }
  
  if (vipDataResult.error) {
    log(`Error fetching VIP data mappings: ${vipDataResult.error.message}`, 'error');
  }
  
  // Combine results and deduplicate by stable_hash_id
  const allMappings = [];
  const seenHashes = new Set();
  
  // Add mappings from crm_customer_mapping_vip_staging
  (mappingResult.data || []).forEach(mapping => {
    if (!seenHashes.has(mapping.stable_hash_id)) {
      allMappings.push({
        id: `mapping_${mapping.profile_id}`,
        profile_id: mapping.profile_id,
        stable_hash_id: mapping.stable_hash_id,
        source: 'crm_customer_mapping_vip_staging'
      });
      seenHashes.add(mapping.stable_hash_id);
    }
  });
  
  // Add mappings from vip_customer_data
  (vipDataResult.data || []).forEach(profile => {
    const stableHashId = profile.vip_customer_data.stable_hash_id;
    if (!seenHashes.has(stableHashId)) {
      allMappings.push({
        id: `vip_data_${profile.id}`,
        profile_id: profile.id,
        stable_hash_id: stableHashId,
        source: 'vip_customer_data'
      });
      seenHashes.add(stableHashId);
    }
  });
  
  log(`Found ${allMappings.length} unique stable_hash_id values in staging (${mappingResult.data?.length || 0} from mapping, ${vipDataResult.data?.length || 0} from vip_customer_data)`);
  if (CONFIG.debugMode && allMappings.length > 0) {
    log('Sample mappings:', 'debug', allMappings.slice(0, 3));
  }
  
  return allMappings;
}

/**
 * Fetch packages for a customer using stable_hash_id from the CRM database
 */
async function fetchPackagesByStableHashId(stableHashId) {
  log(`Fetching packages for stable_hash_id: ${stableHashId}`);
  const supabase = createCrmClient();
  
  try {
    // Call the fixed database function
    const { data: packages, error } = await supabase
      .rpc('get_packages_by_hash_id', { p_stable_hash_id: stableHashId });
    
    if (error) {
      log(`Error using database function: ${error.message}`, 'error');
      return [];
    }
    
    log(`Found ${packages.length} packages for stable_hash_id ${stableHashId}`);
    if (CONFIG.debugMode && packages.length > 0) {
      log('Raw CRM packages:', 'debug', packages);
    }
    return packages;
  } catch (e) {
    log(`Exception using database function: ${e.message}`, 'error');
    return [];
  }
}

/**
 * Sync packages to the booking database's crm_packages_vip_staging table
 */
async function syncPackagesToStagingDb(packages, mapping) {
  if (!packages || packages.length === 0) {
    log(`No packages to sync for mapping ${mapping.id}`);
    return { added: 0, updated: 0, deleted: 0, errors: 0 };
  }
  
  log(`Syncing ${packages.length} packages for stable_hash_id ${mapping.stable_hash_id}`);
  const supabase = createMainClient();
  
  let added = 0;
  let updated = 0;
  let deleted = 0;
  let errors = 0;
  
  try {
    // Step 1: First, get the count of existing packages
    const { data: existingPackages, error: countError } = await supabase
      .from('crm_packages_vip_staging')
      .select('id')
      .eq('stable_hash_id', mapping.stable_hash_id);
    
    if (countError) {
      log(`Error counting existing packages: ${countError.message}`, 'error');
      errors++;
    } else {
      const countToDelete = existingPackages?.length || 0;
      
      // Step 2: Delete existing packages
      const { error: deleteError } = await supabase
        .from('crm_packages_vip_staging')
        .delete()
        .eq('stable_hash_id', mapping.stable_hash_id);
      
      if (deleteError) {
        log(`Error deleting existing packages: ${deleteError.message}`, 'error');
        errors++;
      } else {
        deleted = countToDelete;
        log(`Deleted ${deleted} existing packages for stable_hash_id ${mapping.stable_hash_id}`);
      }
    }
    
    // Step 3: Insert all new packages
    const packagesToInsert = packages.map(pkg => ({
      // Map all available fields from pkg (source) to target crm_packages_vip_staging schema
      id: String(pkg.id),
      stable_hash_id: mapping.stable_hash_id,
      crm_package_id: pkg.crm_package_id || pkg.id, // Assuming pkg.id is the CRM package's unique ID
      customer_name: pkg.customer_name || '',
      
      package_name: pkg.package_name_from_def || null,
      package_display_name: pkg.package_display_name_from_def || null,
      package_type_name: pkg.package_type_from_def || null,
      package_category: pkg.package_type_from_def || null,
      total_hours: pkg.package_total_hours_from_def !== undefined ? pkg.package_total_hours_from_def : null,
      pax: pkg.package_pax_from_def !== undefined ? pkg.package_pax_from_def : null,
      validity_period_definition: pkg.package_validity_period_from_def || null,
      
      first_use_date: pkg.first_use_date || null,
      expiration_date: pkg.expiration_date || null,
      purchase_date: pkg.created_at_for_purchase_date || null, // Mapped from created_at_for_purchase_date
      
      remaining_hours: pkg.calculated_remaining_hours !== undefined ? pkg.calculated_remaining_hours : null, // Corrected source field
      used_hours: pkg.calculated_used_hours !== undefined ? pkg.calculated_used_hours : null,
      
      // created_at and updated_at for the crm_packages_vip_staging row itself (audit timestamps)
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    }));
    
    if (CONFIG.debugMode && packagesToInsert.length > 0) {
      log('Packages to insert:', 'debug', packagesToInsert);
    }
    
    if (packagesToInsert.length > 0) {
      const { error: insertError } = await supabase
        .from('crm_packages_vip_staging')
        .insert(packagesToInsert);
      
      if (insertError) {
        log(`Error inserting new packages: ${insertError.message}`, 'error');
        errors++;
      } else {
        added = packagesToInsert.length;
        log(`Added ${added} new packages for stable_hash_id ${mapping.stable_hash_id}`);
      }
    }
    
    return { added, updated, deleted, errors };
  } catch (e) {
    log(`Exception in syncPackagesToStagingDb: ${e.message}`, 'error');
    return { added, updated, deleted, errors: errors + 1 };
  }
}

/**
 * Main function to run the package sync
 */
async function main() {
  try {
    // Log configuration
    log(`Starting package sync with configuration:`, 'info', {
      batchSize: CONFIG.batchSize,
      debugMode: CONFIG.debugMode,
      profileId: CONFIG.profileId || 'all',
      stableHashId: CONFIG.stableHashId || 'any'
    });
    
    // Get all mappings with stable_hash_id from staging tables
    const mappings = await fetchMappingsWithStableHashId();
    
    if (mappings.length === 0) {
      log('No mappings with stable_hash_id found in staging tables.', 'warn');
      return;
    }
    
    // Process in batches
    const BATCH_SIZE = CONFIG.batchSize;
    const batches = [];
    
    for (let i = 0; i < mappings.length; i += BATCH_SIZE) {
      batches.push(mappings.slice(i, i + BATCH_SIZE));
    }
    
    let totalPackages = 0;
    let totalAdded = 0;
    let totalUpdated = 0;
    let totalDeleted = 0;
    let totalErrors = 0;
    
    for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
      const batch = batches[batchIndex];
      log(`Processing batch ${batchIndex + 1} of ${batches.length}`);
      
      for (let j = 0; j < batch.length; j++) {
        const mapping = batch[j];
        log(`Processing mapping ${j + 1}/${batch.length} for stable_hash_id ${mapping.stable_hash_id}`);
        
        if (!mapping.stable_hash_id) {
          log(`Skipping mapping ${mapping.id} - no stable_hash_id present`, 'warn');
          continue;
        }
        
        // Get packages for this stable_hash_id from CRM
        const packages = await fetchPackagesByStableHashId(mapping.stable_hash_id);
        totalPackages += packages.length;
        
        // Sync packages to staging database
        if (packages.length > 0) {
          const { added, updated, deleted, errors } = await syncPackagesToStagingDb(packages, mapping);
          totalAdded += added;
          totalUpdated += updated;
          totalDeleted += deleted;
          totalErrors += errors;
          
          log(`Processed ${packages.length} packages for stable_hash_id ${mapping.stable_hash_id} (Added: ${added}, Deleted: ${deleted}, Errors: ${errors})`);
        } else {
          log(`No packages found for stable_hash_id ${mapping.stable_hash_id}`);
        }
      }
      
      // Add a small delay between batches to avoid rate limits
      if (batchIndex < batches.length - 1) {
        log(`Batch ${batchIndex + 1} complete. Taking a short break before processing the next batch...`);
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }
    
    // Log summary
    log('====== Package Sync Completed ======');
    log(`Total Mappings Processed: ${mappings.length}`);
    log(`Total Packages Found: ${totalPackages}`);
    log(`Total Packages Added: ${totalAdded}`);
    log(`Total Packages Deleted: ${totalDeleted}`);
    log(`Total Errors: ${totalErrors}`);
    
  } catch (error) {
    log(`Error in sync process: ${error.message}`, 'error');
    process.exit(1);
  }
}

// Run the main function
main().catch(error => {
  log(`Unhandled error: ${error.message}`, 'error');
  process.exit(1);
}); 