#!/usr/bin/env node
require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

// Output directory for logs and results
const OUTPUT_DIR = path.join(__dirname, '..', 'logs');
if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

// Log file for the sync process
const LOG_FILE = path.join(OUTPUT_DIR, `sync-david-profiles-${new Date().toISOString().replace(/:/g, '-')}.log`);
const logStream = fs.createWriteStream(LOG_FILE, { flags: 'a' });

// Special profiles to process - David's profiles
const DAVID_PROFILES = [
  '44b0cd15-c901-4517-9743-31c68032259d', // guest login
  '3afaf5ea-d8c5-4745-9d7d-ba99ab162e1e', // Google login
  'f7775120-f37f-45e5-92b9-0388f8670ea5'  // Facebook login
];

// Helper function to log message to console and file
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

// Check for CRM database credentials
function hasCrmCredentials() {
  return process.env.CRM_SUPABASE_URL && process.env.CRM_SUPABASE_SERVICE_KEY;
}

// Create a client for the CRM database
function createCrmClient() {
  if (!hasCrmCredentials()) {
    log('No CRM database credentials found. Using mock CRM client.', 'warn');
    return {
      from: (table) => ({
        select: () => ({
          limit: () => Promise.resolve({ data: [], error: null })
        }),
        eq: () => ({
          gte: () => Promise.resolve({ data: [], error: null })
        })
      })
    };
  }

  const supabaseUrl = process.env.CRM_SUPABASE_URL;
  const supabaseKey = process.env.CRM_SUPABASE_SERVICE_KEY;
  
  return createClient(supabaseUrl, supabaseKey);
}

// Create a client for the main booking database
function createMainClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  
  if (!supabaseUrl || !supabaseKey) {
    log('Main database credentials not found in environment variables', 'error');
    throw new Error('Main database credentials not found');
  }
  
  return createClient(supabaseUrl, supabaseKey);
}

// Normalize a phone number for comparison
function normalizePhoneNumber(phone) {
  if (!phone) return '';
  
  // Remove all non-digit characters
  let normalized = phone.replace(/\D/g, '');
  
  // Check for Thai numbers
  if (normalized.startsWith('66') && normalized.length > 9) {
    // Remove country code and add leading 0
    return '0' + normalized.substring(2);
  }
  
  // If it starts with 0, keep it as is
  if (normalized.startsWith('0')) {
    return normalized;
  }
  
  // Otherwise, assume it's a Thai number without leading 0 or country code
  // So add the leading 0
  if (normalized.length === 9) {
    return '0' + normalized;
  }
  
  return normalized;
}

// Fetch a profile by ID
async function fetchProfile(profileId) {
  const supabase = createMainClient();
  
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', profileId)
    .single();
  
  if (error) {
    log(`Error fetching profile ${profileId}: ${error.message}`, 'error');
    return null;
  }
  
  return data;
}

// Find CRM customer by phone number
async function findCrmCustomerByPhone(phoneNumber) {
  if (!phoneNumber) return null;
  
  const supabase = createCrmClient();
  const normalizedPhone = normalizePhoneNumber(phoneNumber);
  
  // Get all customers and filter by phone
  const { data, error } = await supabase
    .from('customers')
    .select('*');
  
  if (error) {
    log(`Error fetching CRM customers: ${error.message}`, 'error');
    return null;
  }
  
  // Filter customers with matching phone numbers
  const matchingCustomers = data.filter(customer => {
    const customerPhone = normalizePhoneNumber(customer.contact_number || '');
    return normalizedPhone === customerPhone;
  });
  
  if (matchingCustomers.length === 0) {
    log(`No CRM customer found with phone ${phoneNumber}`, 'warn');
    return null;
  }
  
  if (matchingCustomers.length > 1) {
    log(`Multiple CRM customers found with phone ${phoneNumber}, using first match`, 'warn');
  }
  
  log(`Found CRM customer: ${matchingCustomers[0].customer_name} (${matchingCustomers[0].id})`);
  return matchingCustomers[0];
}

// Create or update a mapping between profile and CRM customer
async function createOrUpdateMapping(profile, crmCustomer) {
  if (!profile || !crmCustomer) {
    log('Missing profile or CRM customer data, cannot create mapping', 'error');
    return null;
  }
  
  const supabase = createMainClient();
  
  // Get the stable_hash_id directly from the customer data or generate it
  const stableHashId = crmCustomer.stable_hash_id || 
    (crmCustomer.stable_id ? crmCustomer.stable_id : null);
  
  if (!stableHashId) {
    log(`No stable hash ID available for CRM customer ${crmCustomer.id}`, 'error');
    return null;
  }
  
  // Check if mapping already exists
  const { data: existingMapping, error: checkError } = await supabase
    .from('crm_customer_mapping')
    .select('id, profile_id, crm_customer_id, stable_hash_id')
    .eq('profile_id', profile.id)
    .maybeSingle();
  
  if (checkError && checkError.code !== 'PGRST116') {
    log(`Error checking existing mapping: ${checkError.message}`, 'error');
    return null;
  }
  
  if (existingMapping) {
    log(`Updating existing mapping for profile ${profile.id}`);
    
    // For existing mappings, just update the stable_hash_id if needed
    if (existingMapping.stable_hash_id !== stableHashId) {
      const { data, error } = await supabase
        .from('crm_customer_mapping')
        .update({
          stable_hash_id: stableHashId,
          updated_at: new Date().toISOString()
        })
        .eq('id', existingMapping.id)
        .select();
      
      if (error) {
        log(`Error updating mapping: ${error.message}`, 'error');
        return null;
      }
      
      log(`Successfully updated mapping for profile ${profile.id} with stable_hash_id ${stableHashId}`);
      return data[0];
    } else {
      log(`Mapping for profile ${profile.id} already has the correct stable_hash_id`);
      return existingMapping;
    }
  } else {
    log(`Creating new mapping for profile ${profile.id} to CRM customer ${crmCustomer.id}`);
    
    const mappingData = {
      profile_id: profile.id,
      crm_customer_id: crmCustomer.id.toString(),
      crm_customer_data: {
        id: crmCustomer.id.toString(),
        name: crmCustomer.customer_name,
        phone_number: crmCustomer.contact_number,
        email: crmCustomer.email,
        stable_hash_id: stableHashId
      },
      is_matched: true,
      match_method: 'auto',
      match_confidence: 1.0, // High confidence since we matched by phone
      stable_hash_id: stableHashId,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };
    
    const { data, error } = await supabase
      .from('crm_customer_mapping')
      .insert(mappingData)
      .select();
    
    if (error) {
      log(`Error creating new mapping: ${error.message}`, 'error');
      return null;
    }
    
    log(`Successfully created mapping for profile ${profile.id} to CRM customer ${crmCustomer.id}`);
    return data[0];
  }
}

// Fetch packages for a customer
async function fetchPackagesForCustomer(mapping) {
  const supabase = createCrmClient();
  
  // Get the stable_hash_id from the mapping
  const stableHashId = mapping.stable_hash_id || mapping.crm_customer_data?.stable_hash_id;
  const crmCustomerId = mapping.crm_customer_id;
  
  log(`Fetching packages for profile ${mapping.profile_id}`);
  
  // Try to find packages using the database function first
  if (stableHashId) {
    log(`Using stable_hash_id: ${stableHashId} with database function`);
    
    try {
      const { data: packages, error } = await supabase
        .rpc('get_packages_by_hash_id', { p_stable_hash_id: stableHashId });
      
      if (!error && packages && packages.length > 0) {
        log(`Found ${packages.length} packages using database function`);
        
        // Log the first package for debugging
        if (packages.length > 0) {
          log(`First package data:`, 'debug', packages[0]);
        }
        
        return packages;
      }
      
      if (error) {
        // Handle RPC not found (common when function hasn't been created yet)
        if (error.message.includes('function get_packages_by_hash_id') || 
            error.message.includes('function not found')) {
          log(`Database function get_packages_by_hash_id not found, falling back to query`, 'warn');
        } else {
          log(`Error using database function: ${error.message}`, 'error');
        }
      } else {
        log(`No packages found using database function`, 'debug');
      }
    } catch (e) {
      log(`Exception using database function: ${e.message}`, 'error');
    }
    
    // If database function fails, fall back to direct query
    log(`Falling back to direct query with stable_hash_id`);
    
    const { data: packagesByHash, error: hashError } = await supabase
      .from('packages')
      .select('*')
      .eq('stable_hash_id', stableHashId)
      .gte('expiration_date', new Date().toISOString().split('T')[0]);
    
    if (!hashError && packagesByHash && packagesByHash.length > 0) {
      log(`Found ${packagesByHash.length} packages using direct stable_hash_id query`);
      
      // First, check if package_type table exists and fetch package types
      let packageTypes = {};
      try {
        // First try package_types
        let { data: types, error: typesError } = await supabase
          .from('package_types')
          .select('id, name');
        
        if (typesError || !types || types.length === 0) {
          // If that fails, try package_type (singular)
          const { data: typesSingular, error: typesSingularError } = await supabase
            .from('package_type')
            .select('id, name');
          
          if (!typesSingularError && typesSingular && typesSingular.length > 0) {
            types = typesSingular;
            log(`Found ${types.length} package types in package_type table`);
          } else if (typesError) {
            log(`Error fetching package types: ${typesError.message}`, 'warn');
          }
        } else {
          log(`Found ${types.length} package types in package_types table`);
        }
        
        if (types && types.length > 0) {
          // Create a map of id -> name for easy lookup
          packageTypes = types.reduce((acc, type) => {
            acc[type.id] = type.name;
            return acc;
          }, {});
          
          // Log the first few package types for debugging
          const packageTypeEntries = Object.entries(packageTypes).slice(0, 3);
          log(`Package type examples:`, 'debug', packageTypeEntries);
        }
      } catch (e) {
        log(`Error fetching package types: ${e.message}`, 'warn');
      }
      
      // Add package type names from the types map
      const enhancedPackages = packagesByHash.map(pkg => {
        return {
          ...pkg,
          package_type_name: pkg.package_type_id && packageTypes[pkg.package_type_id] 
            ? packageTypes[pkg.package_type_id] 
            : (pkg.package_type || `Package Type ${pkg.package_type_id || 'Unknown'}`)
        };
      });
      
      // Log the first package for debugging
      if (enhancedPackages.length > 0) {
        log(`First package data (direct query):`, 'debug', enhancedPackages[0]);
      }
      
      return enhancedPackages;
    }
    
    if (hashError && !hashError.message.includes('does not exist')) {
      log(`Error looking up packages by stable_hash_id: ${hashError.message}`, 'error');
    } else {
      log(`No packages found using stable_hash_id direct query`, 'debug');
    }
  } else {
    log(`No stable_hash_id available in the mapping`, 'warn');
  }
  
  // Fall back to customer_id as a backup
  log(`Falling back to customer ID lookup: ${crmCustomerId}`);
  
  const { data: packagesByCustomerId, error: customerIdError } = await supabase
    .from('packages')
    .select('*')
    .eq('customer_id', crmCustomerId)
    .gte('expiration_date', new Date().toISOString().split('T')[0]);
  
  if (!customerIdError && packagesByCustomerId && packagesByCustomerId.length > 0) {
    log(`Found ${packagesByCustomerId.length} packages using customer_id`);
    
    // First, check if package_type table exists and fetch package types
    let packageTypes = {};
    try {
      // First try package_types
      let { data: types, error: typesError } = await supabase
        .from('package_types')
        .select('id, name');
      
      if (typesError || !types || types.length === 0) {
        // If that fails, try package_type (singular)
        const { data: typesSingular, error: typesSingularError } = await supabase
          .from('package_type')
          .select('id, name');
        
        if (!typesSingularError && typesSingular && typesSingular.length > 0) {
          types = typesSingular;
          log(`Found ${types.length} package types in package_type table`);
        } else if (typesError) {
          log(`Error fetching package types: ${typesError.message}`, 'warn');
        }
      } else {
        log(`Found ${types.length} package types in package_types table`);
      }
      
      if (types && types.length > 0) {
        // Create a map of id -> name for easy lookup
        packageTypes = types.reduce((acc, type) => {
          acc[type.id] = type.name;
          return acc;
        }, {});
        
        // Log the first few package types for debugging
        const packageTypeEntries = Object.entries(packageTypes).slice(0, 3);
        log(`Package type examples:`, 'debug', packageTypeEntries);
      }
    } catch (e) {
      log(`Error fetching package types: ${e.message}`, 'warn');
    }
    
    // Add package type names from the types map
    const enhancedPackages = packagesByCustomerId.map(pkg => {
      return {
        ...pkg,
        package_type_name: pkg.package_type_id && packageTypes[pkg.package_type_id] 
          ? packageTypes[pkg.package_type_id] 
          : (pkg.package_type || `Package Type ${pkg.package_type_id || 'Unknown'}`)
      };
    });
    
    // Log the first package for debugging
    if (enhancedPackages.length > 0) {
      log(`First package data (customer_id):`, 'debug', enhancedPackages[0]);
    }
    
    return enhancedPackages;
  }
  
  if (customerIdError && !customerIdError.message.includes('does not exist')) {
    log(`Error looking up packages by customer_id: ${customerIdError.message}`, 'error');
  }
  
  log(`No packages found for this customer`);
  return [];
}

// Sync packages for a customer to the booking database
async function syncPackagesToBookingDb(packages, mapping) {
  if (!packages.length) {
    log(`No packages to sync for customer ${mapping.crm_customer_id}`);
    return { added: 0, updated: 0, errors: 0 };
  }
  
  log(`Syncing ${packages.length} packages for customer ${mapping.crm_customer_id}`);
  
  const supabase = createMainClient();
  let added = 0;
  let updated = 0;
  let errors = 0;
  
  // Get the stable_hash_id from the mapping or packages
  const stableHashId = 
    mapping.stable_hash_id || 
    mapping.crm_customer_data?.stable_hash_id || 
    (packages[0] && packages[0].stable_hash_id);
  
  if (!stableHashId) {
    log(`No stable_hash_id available for these packages, skipping sync`, 'error');
    return { added: 0, updated: 0, errors: 1 };
  }
  
  // Process each package
  for (const pkg of packages) {
    try {
      // Check if package already exists
      const { data: existingPackage, error: checkError } = await supabase
        .from('crm_packages')
        .select('id')
        .eq('crm_package_id', pkg.id)
        .maybeSingle();
      
      if (checkError && checkError.code !== 'PGRST116') {
        log(`Error checking if package ${pkg.id} exists: ${checkError.message}`, 'error');
        errors++;
        continue;
      }
      
      // Prepare package data
      const packageData = {
        crm_package_id: pkg.id,
        crm_customer_id: mapping.crm_customer_id,
        customer_name: pkg.customer_name,
        package_type_name: pkg.package_type_name || 'Unknown Package',
        first_use_date: pkg.first_use_date,
        expiration_date: pkg.expiration_date,
        remaining_hours: pkg.remaining_hours,
        stable_hash_id: stableHashId, // Always include stable_hash_id
        updated_at: new Date().toISOString(),
        website_id: process.env.WEBSITE_ID || 'default'
      };
      
      // Log package data for debugging
      log(`Package data for ${pkg.id}:`, 'debug', {
        customer_name: packageData.customer_name,
        package_type_name: packageData.package_type_name,
        expiration: packageData.expiration_date,
        stable_hash_id: packageData.stable_hash_id
      });
      
      if (!existingPackage) {
        // Insert new package
        const { error: insertError } = await supabase
          .from('crm_packages')
          .insert({
            ...packageData,
            created_at: new Date().toISOString()
          });
        
        if (insertError) {
          log(`Error inserting package ${pkg.id}: ${insertError.message}`, 'error');
          errors++;
        } else {
          added++;
          log(`Added new package ${pkg.id} with stable_hash_id ${stableHashId}`);
        }
      } else {
        // Update existing package
        const { error: updateError } = await supabase
          .from('crm_packages')
          .update(packageData)
          .eq('crm_package_id', pkg.id);
        
        if (updateError) {
          log(`Error updating package ${pkg.id}: ${updateError.message}`, 'error');
          errors++;
        } else {
          updated++;
          log(`Updated package ${pkg.id} with stable_hash_id ${stableHashId}`);
        }
      }
    } catch (error) {
      log(`Error processing package ${pkg.id}: ${error.message}`, 'error');
      errors++;
    }
  }
  
  return { added, updated, errors };
}

// Process a single profile
async function processProfile(profileId) {
  log(`Processing profile ${profileId}`);
  
  // Fetch the profile
  const profile = await fetchProfile(profileId);
  if (!profile) {
    log(`Profile ${profileId} not found`, 'error');
    return false;
  }
  
  log(`Profile: ${profile.display_name || profile.full_name || profile.name || 'Unknown'}`);
  log(`Phone: ${profile.phone_number || profile.phone || 'None'}`);
  
  // Find CRM customer by phone
  const crmCustomer = await findCrmCustomerByPhone(profile.phone_number || profile.phone);
  if (!crmCustomer) {
    log(`No CRM customer found for profile ${profileId}`, 'warn');
    return false;
  }
  
  // Create or update the mapping
  const mapping = await createOrUpdateMapping(profile, crmCustomer);
  if (!mapping) {
    log(`Failed to create mapping for profile ${profileId}`, 'error');
    return false;
  }
  
  // Fetch and sync packages
  const packages = await fetchPackagesForCustomer(mapping);
  const { added, updated, errors } = await syncPackagesToBookingDb(packages, mapping);
  
  log(`Processed profile ${profileId} (Packages: ${packages.length}, Added: ${added}, Updated: ${updated}, Errors: ${errors})`);
  return true;
}

// Main function
async function main() {
  log('Starting sync for David G. profiles');
  
  try {
    // Check if we have CRM credentials
    if (!hasCrmCredentials()) {
      log('WARNING: No CRM database credentials found. This script will run in limited mode.', 'warn');
      log('Set CRM_SUPABASE_URL and CRM_SUPABASE_SERVICE_KEY environment variables for full functionality.', 'warn');
    }
    
    let totalProcessed = 0;
    let totalSuccess = 0;
    
    // Process David's profiles
    for (const profileId of DAVID_PROFILES) {
      totalProcessed++;
      const success = await processProfile(profileId);
      if (success) totalSuccess++;
    }
    
    // Log summary
    log('====== Sync Completed ======');
    log(`Total Profiles Processed: ${totalProcessed}`);
    log(`Successfully Processed: ${totalSuccess}`);
    log(`Failed: ${totalProcessed - totalSuccess}`);
    
  } catch (error) {
    log(`Error in sync process: ${error.message}`, 'error');
    process.exit(1);
  } finally {
    // Close log stream
    logStream.end();
  }
}

main().catch(error => {
  log(`Unhandled error: ${error.message}`, 'error');
  process.exit(1);
}); 