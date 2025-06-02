#!/usr/bin/env node
const path = require('path');
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

console.log('=== Starting Package Sync Script ===');

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

// Output directory for logs and results
const OUTPUT_DIR = path.join(__dirname, '..', 'logs');
if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

// Log file for the sync process
const LOG_FILE = path.join(OUTPUT_DIR, `package-sync-${new Date().toISOString().replace(/:/g, '-')}.log`);
const logStream = fs.createWriteStream(LOG_FILE, { flags: 'a' });

/**
 * Helper function to log message to console and file
 */
function log(message, type = 'info', obj = null) {
  const timestamp = new Date().toISOString();
  let logMessage = `[${timestamp}] [${type}] ${message}`;
  
  console.log(logMessage);
  logStream.write(logMessage + '\n');
  
  // If we have an object to log, pretty print it
  if (obj) {
    const objStr = typeof obj === 'string' ? obj : JSON.stringify(obj, null, 2);
    console.log(objStr);
    logStream.write(objStr + '\n');
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
 * Fetch all CRM customer mappings that have stable_hash_id
 */
async function fetchMappingsWithStableHashId() {
  log('Fetching CRM customer mappings with stable_hash_id...');
  const supabase = createMainClient();
  
  // Build the query - only get mappings with stable_hash_id
  let query = supabase
    .from('crm_customer_mapping')
    .select('*')
    .eq('is_matched', true)
    .not('stable_hash_id', 'is', null);
  
  // Add filter for specific profile if provided
  if (CONFIG.profileId) {
    query = query.eq('profile_id', CONFIG.profileId);
    log(`Filtering for specific profile: ${CONFIG.profileId}`);
  }
  
  // Add filter for specific stable hash ID if provided
  if (CONFIG.stableHashId) {
    query = query.eq('stable_hash_id', CONFIG.stableHashId);
    log(`Filtering for specific stable hash ID: ${CONFIG.stableHashId}`);
  }
  
  const { data, error } = await query;
  
  if (error) {
    log(`Error fetching CRM mappings: ${error.message}`, 'error');
    throw error;
  }
  
  log(`Found ${data.length} CRM customer mappings with stable_hash_id`);
  return data;
}

/**
 * Fetch packages for a customer using stable_hash_id from the CRM database
 * using the database function that has been fixed
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
    return packages;
  } catch (e) {
    log(`Exception using database function: ${e.message}`, 'error');
    return [];
  }
}

/**
 * Check if the crm_packages table needs migration and perform it if necessary
 */
async function migrateProfilePackagesTable() {
  log('Checking if crm_packages table needs schema migration...');
  const supabase = createMainClient();
  
  try {
    // First, check if the table exists at all
    const { data: tableExists, error: tableError } = await supabase
      .rpc('execute_sql', { 
        sql: `SELECT EXISTS (
          SELECT FROM information_schema.tables 
          WHERE table_schema = 'public' 
          AND table_name = 'crm_packages'
        )` 
      });
    
    if (tableError) {
      log(`Error checking if table exists: ${tableError.message}`, 'warn');
      return false;
    }
    
    // If table doesn't exist, no migration needed (it will be created with correct schema)
    if (!tableExists || !tableExists.length || !tableExists[0].exists) {
      log('Table crm_packages does not exist yet, it will be created with the correct schema.');
      return false;
    }
    
    // Check if foreign key constraints already exist
    const { data: hasForeignKey, error: fkError } = await supabase
      .rpc('execute_sql', { 
        sql: `SELECT EXISTS (
          SELECT FROM information_schema.table_constraints
          WHERE constraint_name = 'fk_crm_packages_stable_hash_id'
          AND table_name = 'crm_packages'
        )` 
      });
    
    if (fkError) {
      log(`Error checking foreign key constraint: ${fkError.message}`, 'warn');
    } else if (hasForeignKey && hasForeignKey.length && hasForeignKey[0].exists) {
      log('Foreign key constraint already exists, no migration needed.');
      return false;
    }
    
    log('Table needs migration to update constraints...', 'warn');
    
    // Add the foreign key constraint
    const { error: alterError } = await supabase
      .rpc('execute_sql', { 
        sql: `
          ALTER TABLE crm_packages
          ADD CONSTRAINT fk_crm_packages_stable_hash_id
          FOREIGN KEY (stable_hash_id)
          REFERENCES crm_customer_mapping(stable_hash_id)
        ` 
      });
    
    if (alterError) {
      log(`Error adding foreign key constraint: ${alterError.message}`, 'error');
      return false;
    }
    
    log('Foreign key constraint added successfully');
    return true;
  } catch (e) {
    log(`Exception during migration check: ${e.message}`, 'error');
    return false;
  }
}

/**
 * Sync packages to the booking database's crm_packages table
 * using stable_hash_id as the relationship key
 */
async function syncPackagesToBookingDb(packages, mapping) {
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
      .from('crm_packages')
      .select('id')
      .eq('stable_hash_id', mapping.stable_hash_id);
    
    if (countError) {
      log(`Error counting existing packages: ${countError.message}`, 'error');
      errors++;
    } else {
      const countToDelete = existingPackages?.length || 0;
      
      // Step 2: Delete existing packages
      const { error: deleteError } = await supabase
        .from('crm_packages')
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
      // Map all available fields from pkg (source) to target crm_packages schema
      stable_hash_id: mapping.stable_hash_id,
      crm_package_id: pkg.crm_package_id || pkg.id, // Assuming pkg.id is the CRM package's unique ID
      customer_name: pkg.customer_name || '',
      
      // Rich package information from CRM - prioritize _from_def fields
      package_name: pkg.package_name_from_def || pkg.package_name || null,
      package_display_name: pkg.package_display_name_from_def || pkg.package_display_name || null,
      package_type_name: pkg.package_type_from_def || pkg.package_type_name || null,
      package_category: pkg.package_type_from_def || pkg.package_category || null,
      total_hours: pkg.package_total_hours_from_def !== undefined ? pkg.package_total_hours_from_def : null,
      pax: pkg.package_pax_from_def !== undefined ? pkg.package_pax_from_def : null,
      validity_period_definition: pkg.package_validity_period_from_def || null,
      
      first_use_date: pkg.first_use_date || null,
      expiration_date: pkg.expiration_date || null,
      purchase_date: pkg.created_at_for_purchase_date || null, // Mapped from created_at_for_purchase_date
      
      remaining_hours: pkg.calculated_remaining_hours !== undefined ? pkg.calculated_remaining_hours : null, // Corrected source field
      used_hours: pkg.calculated_used_hours !== undefined ? pkg.calculated_used_hours : null,
      
      // created_at and updated_at for the crm_packages row itself (audit timestamps)
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    }));
    
    if (packagesToInsert.length > 0) {
      const { error: insertError } = await supabase
        .from('crm_packages')
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
    log(`Exception in syncPackagesToBookingDb: ${e.message}`, 'error');
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
    
    // Check if the table needs migration and perform it if needed
    await migrateProfilePackagesTable();
    
    // Get all mappings with stable_hash_id
    const mappings = await fetchMappingsWithStableHashId();
    
    if (mappings.length === 0) {
      log('No mappings with stable_hash_id found. Run sync-customer-matching.js first to create mappings.', 'warn');
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
        
        // Sync packages to booking database
        if (packages.length > 0) {
          const { added, updated, deleted, errors } = await syncPackagesToBookingDb(packages, mapping);
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
    logStream.end();
    process.exit(1);
  } finally {
    logStream.end();
  }
}

// Run the main function
main().catch(error => {
  log(`Unhandled error: ${error.message}`, 'error');
  logStream.end();
  process.exit(1);
}); 