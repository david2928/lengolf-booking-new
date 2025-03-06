#!/usr/bin/env node
require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// Output directory for logs and results
const OUTPUT_DIR = path.join(__dirname, '..', 'logs');
if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

// Log file for the sync process
const LOG_FILE = path.join(OUTPUT_DIR, `sync-mapped-packages-${new Date().toISOString().replace(/:/g, '-')}.log`);
const logStream = fs.createWriteStream(LOG_FILE, { flags: 'a' });

// Special profiles to debug (from user input)
// NOTE: This is now just for DEBUG logging, not for filtering
const SPECIAL_PROFILES = [
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
    
    // Return a mock client with minimal functionality needed for testing
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

// Fetch all CRM customer mappings from the booking database
async function fetchAllMappings() {
  log('Fetching all CRM customer mappings...');
  const supabase = createMainClient();
  
  const { data, error } = await supabase
    .from('crm_customer_mapping')
    .select('*')
    .eq('is_matched', true);
  
  if (error) {
    log(`Error fetching CRM mappings: ${error.message}`, 'error');
    throw error;
  }
  
  log(`Found ${data.length} CRM customer mappings`);
  return data;
}

// Fetch packages for a customer using stable_hash_id from the CRM database
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
    
    return enhancedPackages;
  }
  
  if (customerIdError && !customerIdError.message.includes('does not exist')) {
    log(`Error looking up packages by customer_id: ${customerIdError.message}`, 'error');
  }
  
  log(`No packages found for this customer`);
  return [];
}

// Update a mapping with stable_hash_id if it's missing
async function updateMappingWithStableHashId(mapping, stableHashId) {
  if (!stableHashId) return;
  
  // Check if mapping already has stable_hash_id
  if (mapping.stable_hash_id === stableHashId && 
      mapping.crm_customer_data && 
      mapping.crm_customer_data.stable_hash_id === stableHashId) {
    return;
  }
  
  log(`Updating mapping ${mapping.id} with stable_hash_id ${stableHashId}`);
  
  const supabase = createMainClient();
  
  // Create updated customer data with stable_hash_id
  const updatedData = {
    ...mapping.crm_customer_data,
    stable_hash_id: stableHashId
  };
  
  const { error } = await supabase
    .from('crm_customer_mapping')
    .update({
      crm_customer_data: updatedData,
      stable_hash_id: stableHashId, // Store at top level too for easier querying
      updated_at: new Date().toISOString()
    })
    .eq('id', mapping.id);
  
  if (error) {
    log(`Error updating mapping ${mapping.id}: ${error.message}`, 'error');
  }
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

// Fetch all profiles from the main database
async function fetchAllProfiles() {
  log('Fetching all profiles...');
  const supabase = createMainClient();
  
  const { data, error } = await supabase
    .from('profiles')
    .select('*');
  
  if (error) {
    log(`Error fetching profiles: ${error.message}`, 'error');
    throw error;
  }
  
  // Log sample profile data for debugging
  if (data.length > 0) {
    log('Sample profile data structure:', 'debug', data[0]);
    
    // Log special profiles for detailed debugging
    for (const specialId of SPECIAL_PROFILES) {
      const specialProfile = data.find(p => p.id === specialId);
      if (specialProfile) {
        log(`Special profile ${specialId}:`, 'debug', specialProfile);
      }
    }
  }
  
  log(`Found ${data.length} profiles`);
  return data;
}

// Fetch all customers from the CRM database
async function fetchAllCrmCustomers() {
  log('Fetching all CRM customers...');
  const supabase = createCrmClient();
  
  const { data, error } = await supabase
    .from('customers')
    .select('*')
    .limit(1000); // Adjust limit as needed
  
  if (error) {
    log(`Error fetching CRM customers: ${error.message}`, 'error');
    throw error;
  }
  
  // Log sample customer data for debugging
  if (data.length > 0) {
    log('Sample CRM customer data structure:', 'debug', data[0]);
    
    // Log customers with specific phone numbers related to our special profiles
    const phoneNumbers = ['842695447', '66842695447'];
    for (const phone of phoneNumbers) {
      const matchingCustomers = data.filter(c => 
        c.contact_number && 
        c.contact_number.replace(/\D/g, '').includes(phone.replace(/\D/g, ''))
      );
      
      if (matchingCustomers.length > 0) {
        log(`CRM customers with phone ${phone}:`, 'debug', matchingCustomers);
      }
    }
  }
  
  log(`Found ${data.length} CRM customers`);
  return data;
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

// Check if two phone numbers match
function phoneNumbersMatch(phone1, phone2) {
  const normalized1 = normalizePhoneNumber(phone1);
  const normalized2 = normalizePhoneNumber(phone2);
  
  if (!normalized1 || !normalized2) return false;
  
  // After our improved normalization, direct comparison should work
  return normalized1 === normalized2;
}

// Normalize a name for comparison
function normalizeName(name) {
  if (!name) return '';
  return name.toLowerCase().trim();
}

// Extract first and last names
function extractNameParts(fullName) {
  if (!fullName) return { first: '', last: '' };
  
  const parts = fullName.trim().split(/\s+/);
  if (parts.length === 1) return { first: parts[0], last: '' };
  
  const first = parts[0];
  const last = parts.slice(1).join(' ');
  return { first, last };
}

// Check if two names might match
function namePartsMatch(name1, name2) {
  if (!name1 || !name2) return false;
  
  const normalized1 = normalizeName(name1);
  const normalized2 = normalizeName(name2);
  
  // Extract first and last names
  const parts1 = extractNameParts(normalized1);
  const parts2 = extractNameParts(normalized2);
  
  // Check for first name match
  if (parts1.first && parts2.first) {
    // First name exact match
    if (parts1.first === parts2.first) {
      return true;
    }
    
    // First name is contained in the other
    if (parts1.first.length >= 3 && parts2.first.length >= 3) {
      if (parts1.first.includes(parts2.first) || parts2.first.includes(parts1.first)) {
        return true;
      }
    }
  }
  
  // Check for last name match if both have last names
  if (parts1.last && parts2.last) {
    // Last name exact match
    if (parts1.last === parts2.last) {
      return true;
    }
    
    // Last name starts with the same character(s)
    if (parts1.last.charAt(0) === parts2.last.charAt(0)) {
      return true;
    }
  }
  
  return false;
}

// Calculate match confidence between profile and customer
function calculateMatchConfidence(profile, customer) {
  // Set weights for different match types
  const PHONE_MATCH_WEIGHT = 0.8;
  const EMAIL_MATCH_WEIGHT = 0.3;
  const NAME_MATCH_WEIGHT = 0.1;
  const MATCH_CONFIDENCE_THRESHOLD = 0.75;
  
  let maxScore = PHONE_MATCH_WEIGHT + EMAIL_MATCH_WEIGHT + NAME_MATCH_WEIGHT;
  let score = 0;
  let reasons = [];
  let debug = {};
  
  // Check phone match (strongest signal)
  const profilePhone = profile.phone_number || profile.phone || '';
  const customerPhone = customer.contact_number || customer.phone_number || '';
  
  debug.phonesBeforeNormalization = { profilePhone, customerPhone };
  
  const normalizedProfilePhone = normalizePhoneNumber(profilePhone);
  const normalizedCustomerPhone = normalizePhoneNumber(customerPhone);
  
  debug.phonesAfterNormalization = { normalizedProfilePhone, normalizedCustomerPhone };
  debug.phoneMatch = phoneNumbersMatch(profilePhone, customerPhone);
  
  if (profilePhone && customerPhone && phoneNumbersMatch(profilePhone, customerPhone)) {
    score += PHONE_MATCH_WEIGHT;
    reasons.push('PHONE');
  }
  
  // Check for email match
  const profileEmail = (profile.email || '').toLowerCase();
  const customerEmail = (customer.email || '').toLowerCase();
  
  debug.emails = { profileEmail, customerEmail };
  debug.emailMatch = profileEmail && customerEmail && profileEmail === customerEmail;
  
  if (profileEmail && customerEmail && profileEmail === customerEmail) {
    score += EMAIL_MATCH_WEIGHT;
    reasons.push('EMAIL');
  }
  
  // Check name match
  const profileName = normalizeName(profile.display_name || profile.full_name || '');
  const customerName = normalizeName(customer.customer_name || customer.name || '');
  
  debug.names = { profileName, customerName };
  debug.nameExactMatch = profileName === customerName;
  debug.namePartsMatch = namePartsMatch(profileName, customerName);
  
  if (profileName && customerName) {
    if (profileName === customerName) {
      score += NAME_MATCH_WEIGHT;
      reasons.push('NAME_EXACT');
    } else if (namePartsMatch(profileName, customerName)) {
      score += NAME_MATCH_WEIGHT * 0.8;
      reasons.push('NAME_PARTS');
    }
  }
  
  // Normalize the confidence score (0-1 range)
  const normalizedScore = score / maxScore;
  
  // Improved boosting logic - prioritize phone matches
  let adjustedScore = normalizedScore;
  if (normalizedScore >= MATCH_CONFIDENCE_THRESHOLD * 0.9 && normalizedScore < MATCH_CONFIDENCE_THRESHOLD) {
    adjustedScore = MATCH_CONFIDENCE_THRESHOLD;
    reasons.push('BOOSTED_NEAR_THRESHOLD');
  } else if (reasons.includes('PHONE')) {
    // If we have a phone match, boost it to meet threshold
    adjustedScore = MATCH_CONFIDENCE_THRESHOLD;
    reasons.push('BOOSTED_PHONE_MATCH');
  }
  
  debug.scores = { 
    rawScore: score, 
    maxScore, 
    normalizedScore, 
    adjustedScore,
    isAboveThreshold: adjustedScore >= MATCH_CONFIDENCE_THRESHOLD
  };
  
  return {
    score: adjustedScore,
    matchReason: reasons.join('_'),
    debug,
    isMatch: adjustedScore >= MATCH_CONFIDENCE_THRESHOLD
  };
}

// Try to match a profile with all available CRM customers
async function matchProfileWithCrm(profile, allCrmCustomers) {
  // Skip profiles without any matching data
  if (!profile.phone_number && !profile.email && !profile.display_name && !profile.full_name) {
    log(`Skipping profile ${profile.id} - insufficient information for matching`);
    return null;
  }
  
  // Check if this is a special profile we want to debug in detail
  const isSpecialProfile = SPECIAL_PROFILES.includes(profile.id);
  if (isSpecialProfile) {
    log(`Attempting detailed match for special profile ${profile.id}`, 'debug');
  }
  
  // Find potential matches
  const matches = [];
  
  for (const customer of allCrmCustomers) {
    const matchResult = calculateMatchConfidence(profile, customer);
    
    // For special profiles, log ALL potential matches with scores
    if (isSpecialProfile) {
      // Always log match attempts for special profiles
      log(`Match attempt for special profile ${profile.id} with customer ${customer.id} (${customer.customer_name}):`, 
          matchResult.isMatch ? 'debug' : 'debug', 
          matchResult.debug);
    }
    
    if (matchResult.score > 0) {
      matches.push({
        customer,
        confidence: matchResult.score,
        reasons: matchResult.matchReason,
        debug: matchResult.debug
      });
    }
  }
  
  // Sort matches by confidence (highest first)
  matches.sort((a, b) => b.confidence - a.confidence);
  
  if (matches.length === 0) {
    if (isSpecialProfile) {
      log(`No matches found for special profile ${profile.id}`, 'warn');
    }
    return null;
  }
  
  // Get the best match
  const bestMatch = matches[0];
  
  if (isSpecialProfile) {
    log(`Best match for special profile ${profile.id}:`, 'debug', {
      crmCustomerId: bestMatch.customer.id,
      customerName: bestMatch.customer.customer_name,
      confidence: bestMatch.confidence,
      reasons: bestMatch.reasons
    });
  }
  
  return {
    profile,
    customer: bestMatch.customer,
    confidence: bestMatch.confidence,
    reasons: bestMatch.reasons
  };
}

// Create a mapping between a profile and CRM customer
async function createMapping(profile, customer, confidence) {
  const supabase = createMainClient();
  
  // Get the stable_hash_id directly from the customer data
  const stableHashId = customer.stable_hash_id;
  
  // Check if this is a high confidence match
  const isHighConfidence = confidence.confidence >= 0.75;
  
  // Only process high confidence matches
  if (!isHighConfidence) {
    log(`Skipping low confidence match (${confidence.confidence.toFixed(2)}) for profile ${profile.id}`, 'warn');
    return null;
  }
  
  log(`Creating mapping for profile ${profile.id} to CRM customer ${customer.id} (confidence: ${confidence.confidence.toFixed(2)})`);
  
  const mappingData = {
    profile_id: profile.id,
    crm_customer_id: customer.id.toString(),
    crm_customer_data: {
      id: customer.id.toString(),
      name: customer.customer_name,
      phone_number: customer.contact_number,
      email: customer.email,
      stable_hash_id: stableHashId,
      // Store original match info in the data object
      match_info: {
        reasons: confidence.reasons,
        raw_confidence: confidence.confidence
      }
    },
    is_matched: true,
    match_method: 'auto', // High confidence only, so always auto
    match_confidence: confidence.confidence,
    stable_hash_id: stableHashId, // Store stable_hash_id at the top level too
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };
  
  const { data, error } = await supabase
    .from('crm_customer_mapping')
    .upsert(mappingData)
    .select();
  
  if (error) {
    log(`Error creating mapping: ${error.message}`, 'error');
    return null;
  }
  
  return data[0];
}

// Create mappings for profiles that don't have one
async function createMappingsForUnmappedProfiles() {
  log('Checking for unmapped profiles...');
  
  // Fetch all profiles and existing mappings
  const profiles = await fetchAllProfiles();
  const { data: existingMappings } = await createMainClient()
    .from('crm_customer_mapping')
    .select('profile_id')
    .eq('is_matched', true);
  
  // Create a set of already mapped profile IDs
  const mappedProfileIds = new Set(existingMappings?.map(m => m.profile_id) || []);
  
  // Find unmapped profiles
  const unmappedProfiles = profiles.filter(p => !mappedProfileIds.has(p.id));
  log(`Found ${unmappedProfiles.length} unmapped profiles`);
  
  if (unmappedProfiles.length === 0) {
    return [];
  }
  
  // Fetch all CRM customers for matching
  const crmCustomers = await fetchAllCrmCustomers();
  
  // Create new mappings
  const newMappings = [];
  
  for (const profile of unmappedProfiles) {
    // Use the existing matching logic
    const match = await matchProfileWithCrm(profile, crmCustomers);
    
    if (match) {
      const mapping = await createMapping(match.profile, match.customer, match);
      
      if (mapping) {
        newMappings.push(mapping);
        log(`Created new mapping for profile ${profile.id} to CRM customer ${match.customer.id}`);
      }
    } else {
      if (SPECIAL_PROFILES.includes(profile.id)) {
        log(`No matching CRM customer found for special profile ${profile.id}`, 'warn');
      } else {
        log(`No matching CRM customer found for profile ${profile.id}`);
      }
    }
  }
  
  log(`Created ${newMappings.length} new mappings`);
  return newMappings;
}

// Main function
async function main() {
  try {
    // Check if we have CRM credentials
    if (!hasCrmCredentials()) {
      log('WARNING: No CRM database credentials found. This script will run in limited mode.', 'warn');
      log('Only existing mappings will be processed, and no new mappings will be created.', 'warn');
      log('Set CRM_SUPABASE_URL and CRM_SUPABASE_SERVICE_KEY environment variables for full functionality.', 'warn');
    }
    
    log('Starting sync of mapped customers and packages');
    
    // Fetch all CRM customer mappings - no longer filtering by SPECIAL_PROFILES
    let mappings = await fetchAllMappings();
    
    log(`Found ${mappings.length} total mappings to process`);
    
    // If no mappings found and we have CRM credentials, try to create some
    if (mappings.length === 0 && hasCrmCredentials()) {
      log('No existing mappings found. Attempting to create new mappings...');
      const newMappings = await createMappingsForUnmappedProfiles();
      
      if (newMappings.length > 0) {
        log(`Successfully created ${newMappings.length} new mappings. Proceeding with package sync.`);
        mappings = newMappings;
      } else {
        log('No new mappings could be created. Exiting.');
        return;
      }
    } else if (mappings.length === 0) {
      log('No existing mappings found and CRM credentials not available. Exiting.');
      return;
    }
    
    // Process all mappings, not just special ones
    const mappingsToProcess = mappings;
    log(`Found ${mappingsToProcess.length} total mappings to process`);
    
    // Process in batches to avoid overloading the database
    const BATCH_SIZE = 10;
    const batches = [];
    
    for (let i = 0; i < mappingsToProcess.length; i += BATCH_SIZE) {
      batches.push(mappingsToProcess.slice(i, i + BATCH_SIZE));
    }
    
    let totalPackages = 0;
    let totalAdded = 0;
    let totalUpdated = 0;
    let totalErrors = 0;
    
    for (let i = 0; i < batches.length; i++) {
      const batch = batches[i];
      log(`Processing batch ${i + 1} of ${batches.length}`);
      
      for (let j = 0; j < batch.length; j++) {
        const mapping = batch[j];
        log(`Processing mapping ${j + 1}/${batch.length} for profile ${mapping.profile_id}`);
        
        // Get packages for this customer from CRM
        const packages = await fetchPackagesForCustomer(mapping);
        totalPackages += packages.length;
        
        // Update packages in booking database
        if (packages.length > 0) {
          const { added, updated, errors } = await syncPackagesToBookingDb(packages, mapping);
          totalAdded += added;
          totalUpdated += updated;
          totalErrors += errors;
        }
      }
    }
    
    // Log summary
    log('====== Sync Completed ======');
    log(`Total Mappings Processed: ${mappingsToProcess.length}`);
    log(`Total Packages Found: ${totalPackages}`);
    log(`Total Packages Added: ${totalAdded}`);
    log(`Total Packages Updated: ${totalUpdated}`);
    log(`Total Errors: ${totalErrors}`);
    
    // Close log stream
    logStream.end();
    
  } catch (error) {
    log(`Error in sync process: ${error.message}`, 'error');
    logStream.end();
    process.exit(1);
  }
}

/**
 * Here's the SQL function to create in your database to optimize package lookups:
 * 
 * ```sql
 * CREATE OR REPLACE FUNCTION get_packages_by_hash_id(p_stable_hash_id text)
 * RETURNS TABLE (
 *   id uuid,
 *   crm_package_id integer,
 *   website_id text,
 *   name text,
 *   expiry_date date,
 *   remaining_minutes integer,
 *   price numeric,
 *   customer_id integer,
 *   package_type_id integer,
 *   package_type_name text,
 *   stable_hash_id text
 * ) AS $$
 * BEGIN
 *   RETURN QUERY
 *   SELECT 
 *     p.id,
 *     p.crm_package_id,
 *     p.website_id,
 *     p.name,
 *     p.expiry_date,
 *     p.remaining_minutes,
 *     p.price,
 *     p.customer_id,
 *     p.package_type_id,
 *     COALESCE(pt.name, 'Unknown Type') as package_type_name,
 *     p.stable_hash_id
 *   FROM packages p
 *   LEFT JOIN package_types pt ON p.package_type_id = pt.id
 *   WHERE p.stable_hash_id = p_stable_hash_id
 *   AND p.expiry_date >= CURRENT_DATE;
 * END;
 * $$ LANGUAGE plpgsql;
 * ```
 * 
 * With this function in place, the script will be able to fetch packages with their 
 * type names in a single query, improving performance and reliability.
 */

main().catch(error => {
  log(`Unhandled error: ${error.message}`, 'error');
  process.exit(1);
});