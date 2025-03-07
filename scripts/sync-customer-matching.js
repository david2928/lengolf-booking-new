#!/usr/bin/env node
const path = require('path');
const { createClient } = require('@supabase/supabase-js');
const { levenshtein } = require('natural');
const fs = require('fs');

console.log('=== Starting Customer Matching Sync ===');

// Display help message
function showHelp() {
  console.log(`
Customer Matching Script - Matches booking profiles with CRM customer records

Usage:
  node sync-customer-matching.js [options]

Options:
  --help                Show this help message
  --all                 Process all profiles (default: false)
  --profile <id>        Process a specific profile by ID
  --maxDistance <number> Set maximum edit distance for phone similarity (default: 3)
  --debug               Enable debug mode (default: true)

Examples:
  # Process a single specific profile
  node sync-customer-matching.js --profile 44b0cd15-c901-4517-9743-31c68032259d
  
  # Process all profiles
  node sync-customer-matching.js --all
  
  # Process all profiles with debug mode off
  node sync-customer-matching.js --all --debug false
  `);
  process.exit(0);
}

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

// Show help if requested
if (args.help) {
  showHelp();
}

console.log('Command line arguments:', args);

// Configuration with defaults and command line overrides - with environment variable support
const CONFIG = {
  confidenceThreshold: parseFloat(process.env.CONFIDENCE_THRESHOLD || args.confidenceThreshold || 0.85),
  debugMode: (process.env.DEBUG_MODE === 'true') || args.debug === 'true',
  processAllProfiles: args.all === true,
  targetProfileId: args.profileId || null,
  maxPhoneEditDistance: parseInt(args.maxPhoneEditDistance || 2, 10)
};

// Debug output for processAllProfiles setting
console.log(`processAllProfiles setting: ${CONFIG.processAllProfiles}`);
console.log(`--all argument value: ${args.all}`);

// Simple logging function
function log(message, type = 'info') {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] [${type.toUpperCase()}] ${message}`);
}

/**
 * Create Supabase client for the booking database
 */
function createBookingClient() {
  console.log('Creating Booking Supabase client...');
  return createClient(CREDENTIALS.SUPABASE_URL, CREDENTIALS.SUPABASE_KEY);
}

/**
 * Create Supabase client for the CRM database
 */
function createCrmClient() {
  console.log('Creating CRM Supabase client...');
  return createClient(CREDENTIALS.CRM_SUPABASE_URL, CREDENTIALS.CRM_SUPABASE_KEY);
}

/**
 * Fetch all customers from the CRM
 */
async function fetchAllCrmCustomers() {
  console.log('Fetching CRM customers...');
  
  try {
    const supabase = createCrmClient();
    const { data, error } = await supabase
      .from('customers')  // Correct table name
      .select('*');
    
    if (error) {
      throw error;
    }
    
    console.log(`Fetched ${data.length} customers from CRM`);
    return data;
  } catch (error) {
    console.error('Error fetching CRM customers:', error);
    throw error; // Don't fall back to sample data, let the error propagate
  }
}

/**
 * Normalize phone number for comparison
 * @param {string} phone - The phone number to normalize
 * @returns {string} - The normalized phone number
 */
function normalizePhoneNumber(phone) {
  if (!phone) return '';
  
  // Convert to string if not already
  phone = String(phone);
  
  // Remove all non-digit characters
  let normalized = phone.replace(/\D/g, '');
  
  // For Thai mobile numbers, if it starts with '0', convert to '+66'
  if (normalized.startsWith('0')) {
    normalized = normalized.substring(1);
  }
  
  // For international format, if it starts with country code, extract the last 9 digits
  if (normalized.startsWith('66') || normalized.startsWith('661')) {
    normalized = normalized.substring(2);
  }
  
  // For international format without +, if it starts with other country codes
  if (normalized.length > 9 && !normalized.startsWith('66')) {
    // Extract the last 9 digits for comparison
    normalized = normalized.substring(normalized.length - 9);
  }
  
  // Try to consistently extract the last N digits for comparison
  // This helps match numbers that might be formatted differently but are actually the same
  if (normalized.length > 8) {
    // Keep the last 9 digits for consistency when comparing
    normalized = normalized.substring(Math.max(0, normalized.length - 9));
  }
  
  // Log for debugging
  if (normalized) {
    console.log(`Normalized phone number: ${phone} -> ${normalized}`);
  }
  
  return normalized;
}

/**
 * Normalize text for comparison
 * @param {string} text - The text to normalize
 * @returns {string} - The normalized text
 */
function normalizeText(text) {
  if (!text) return '';
  
  // Convert to string if not already
  text = String(text);
  
  // Convert to lowercase and remove extra spaces
  return text.toLowerCase().trim();
}

/**
 * Extract first and last name from display name
 * @param {string} displayName - Full display name
 * @returns {Object} - Object with first and last name
 */
function extractNameParts(displayName) {
  if (!displayName) return { first: '', last: '' };
  
  const parts = displayName.split(' ').filter(Boolean);
  if (parts.length === 0) return { first: '', last: '' };
  if (parts.length === 1) return { first: parts[0], last: '' };
  
  return {
    first: parts[0],
    last: parts.slice(1).join(' ')
  };
}

/**
 * Calculate Levenshtein distance between two strings
 * @param {string} a - First string
 * @param {string} b - Second string
 * @returns {number} - The edit distance between the strings
 */
function levenshteinDistance(a, b) {
  if (!a || !b) return 0;
  
  const matrix = [];
  
  // Initialize the matrix
  for (let i = 0; i <= a.length; i++) {
    matrix[i] = [i];
  }
  
  for (let j = 0; j <= b.length; j++) {
    matrix[0][j] = j;
  }
  
  // Fill the matrix
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,      // deletion
        matrix[i][j - 1] + 1,      // insertion
        matrix[i - 1][j - 1] + cost // substitution
      );
    }
  }
  
  return matrix[a.length][b.length];
}

/**
 * Calculate similarity score between two phone numbers
 * @param {string} phone1 - First phone number
 * @param {string} phone2 - Second phone number
 * @returns {number} - Similarity score between 0 and 1
 */
function phoneNumberSimilarity(phone1, phone2) {
  if (!phone1 || !phone2) return 0;
  
  // For very short numbers, require exact match
  if (phone1.length < 8 || phone2.length < 8) {
    return phone1 === phone2 ? 1 : 0;
  }
  
  // Calculate edit distance
  const distance = levenshteinDistance(phone1, phone2);
  
  // Calculate similarity score
  // For longer phone numbers, we allow more differences
  const maxLength = Math.max(phone1.length, phone2.length);
  const similarityThreshold = Math.min(CONFIG.maxPhoneEditDistance, Math.floor(maxLength * 0.2)); 
  
  let similarity = 0;
  if (distance === 0) {
    similarity = 1; // Exact match
  } else if (distance === 1) {
    similarity = 0.9; // Off by just one digit
  } else if (distance === 2) {
    similarity = 0.8; // Off by two digits
  } else if (distance <= similarityThreshold) {
    similarity = 0.7; // Similar enough but not very close
  }
  
  // Log phone comparison
  console.log(`Phone comparison: '${phone1}' vs '${phone2}' - distance: ${distance}, similarity: ${similarity.toFixed(2)}`);
  
  return similarity;
}

/**
 * Match a profile with CRM customers
 * @param {Object} profile - The profile to match
 * @param {Array} crmCustomers - Array of CRM customers to match against
 * @returns {Object} - The match result with match, score, and reasons
 */
function matchProfile(profile, crmCustomers) {
  console.log(`Matching profile: ${profile.display_name}, phone: ${profile.phone_number}`);
  
  let bestMatch = null;
  let bestScore = 0;
  let bestReasons = [];
  
  // Extract name parts from display name
  const nameParts = extractNameParts(profile.display_name || '');
  
  // Normalize the profile data for comparison
  const normalizedProfilePhone = normalizePhoneNumber(profile.phone_number || '');
  const normalizedProfileFirstName = normalizeText(nameParts.first || '');
  const normalizedProfileLastName = normalizeText(nameParts.last || '');
  const normalizedProfileEmail = normalizeText(profile.email || '');
  
  console.log(`Normalized profile data: phone=${normalizedProfilePhone}, firstName=${normalizedProfileFirstName}, lastName=${normalizedProfileLastName}`);
  
  // Check each CRM customer for a match
  for (const customer of crmCustomers) {
    let score = 0;
    const reasons = [];
    
    // Extract name parts from customer name
    const customerNameParts = extractNameParts(customer.customer_name || '');
    
    // Normalize the customer data for comparison
    const normalizedCustomerPhone = normalizePhoneNumber(customer.contact_number || '');
    const normalizedCustomerFirstName = normalizeText(customerNameParts.first || '');
    const normalizedCustomerLastName = normalizeText(customerNameParts.last || '');
    const normalizedCustomerEmail = normalizeText(customer.email || '');
    
    // Phone number matching with improved fuzzy matching
    if (normalizedProfilePhone && normalizedCustomerPhone) {
      // Calculate phone similarity score
      const phoneSimilarity = phoneNumberSimilarity(normalizedProfilePhone, normalizedCustomerPhone);
      
      if (phoneSimilarity === 1) {
        score += 0.7; // Exact match
        reasons.push('exact_phone_match');
      } else if (phoneSimilarity >= 0.9) {
        score += 0.6; // Off by just one digit
        reasons.push('very_similar_phone_match');
      } else if (phoneSimilarity >= 0.8) {
        score += 0.5; // Off by two digits
        reasons.push('similar_phone_match');
      } else if (phoneSimilarity >= 0.7) {
        score += 0.3; // Similar enough
        reasons.push('partial_phone_match');
      } else if (normalizedProfilePhone.includes(normalizedCustomerPhone) || 
                normalizedCustomerPhone.includes(normalizedProfilePhone)) {
        score += 0.2;
        reasons.push('substring_phone_match');
      }
    }
    
    // Name matching
    if (normalizedProfileFirstName && normalizedCustomerFirstName) {
      if (normalizedProfileFirstName === normalizedCustomerFirstName) {
        score += 0.5; // Increased from 0.4 for exact name matches
        reasons.push('exact_first_name_match');
      } else if (normalizedProfileFirstName.includes(normalizedCustomerFirstName) || 
                normalizedCustomerFirstName.includes(normalizedProfileFirstName)) {
        score += 0.2;
        reasons.push('partial_first_name_match');
      }
    }
    
    if (normalizedProfileLastName && normalizedCustomerLastName) {
      if (normalizedProfileLastName === normalizedCustomerLastName) {
        score += 0.5; // Increased from 0.4 for exact name matches
        reasons.push('exact_last_name_match');
      } else if (normalizedProfileLastName.includes(normalizedCustomerLastName) || 
                normalizedCustomerLastName.includes(normalizedProfileLastName)) {
        score += 0.2;
        reasons.push('partial_last_name_match');
      }
    }
    
    // Email matching (exact match only)
    if (normalizedProfileEmail && normalizedCustomerEmail && 
        normalizedProfileEmail === normalizedCustomerEmail) {
      score += 0.5;
      reasons.push('exact_email_match');
    }
    
    // Cap the score at 1.0
    score = Math.min(score, 1.0);
    
    console.log(`Match score for ${customer.customer_name}: ${score} (${reasons.join(', ')})`);
    
    // Update best match if this score is higher
    if (score > bestScore) {
      bestMatch = customer;
      bestScore = score;
      bestReasons = reasons;
    }
  }
  
  return {
    match: bestMatch,
    score: bestScore,
    reasons: bestReasons
  };
}

/**
 * Create or update a mapping between a profile and a CRM customer
 */
async function createMapping(supabase, profile, customer, score, reasons) {
  // Only create mappings for matches above the confidence threshold
  if (score < CONFIG.confidenceThreshold) {
    console.log(`Skipping mapping creation for profile ${profile.id} - confidence score ${score.toFixed(2)} is below threshold (${CONFIG.confidenceThreshold})`);
    return { operation: 'skip', reason: 'low_confidence' };
  }

  console.log(`Creating mapping for profile ${profile.id} to customer ${customer.id}`);
  
  try {
    const mappingData = {
      profile_id: profile.id,
      crm_customer_id: customer.id,
      match_confidence: score.toFixed(2),
      match_method: Array.isArray(reasons) ? reasons.join(',') : reasons,
      stable_hash_id: customer.stable_hash_id || '',
      is_matched: true,
      crm_customer_data: customer // Include the entire customer object
    };
    
    // Check if mapping already exists
    const { data: existingMapping } = await supabase
      .from('crm_customer_mapping')
      .select('*')
      .eq('profile_id', profile.id)
      .single();
    
    if (existingMapping) {
      console.log(`Updating existing mapping for profile ${profile.id}`);
      const { data, error } = await supabase
        .from('crm_customer_mapping')
        .update(mappingData)
        .eq('id', existingMapping.id);
      
      if (error) {
        throw error;
      }
      
      return { operation: 'update', data };
    } else {
      console.log(`Inserting new mapping for profile ${profile.id}`);
      const { data, error } = await supabase
        .from('crm_customer_mapping')
        .insert(mappingData);
      
      if (error) {
        throw error;
      }
      
      return { operation: 'insert', data };
    }
  } catch (error) {
    console.error(`Error creating mapping for profile ${profile.id}:`, error);
    throw error;
  }
}

/**
 * Main function to run the customer matching process
 */
async function main() {
  log('Starting customer matching', 'info');
  log(`Configuration: confidenceThreshold=${CONFIG.confidenceThreshold}, debugMode=${CONFIG.debugMode}, processAllProfiles=${CONFIG.processAllProfiles}`, 'info');
  
  console.log('Creating Supabase client...');
  const supabase = createBookingClient();
  console.log('Supabase client created');
  
  console.log('Fetching profiles...');
  let query = supabase.from('profiles').select('*');
  
  // Determine whether to process all profiles or just a specific one
  if (CONFIG.processAllProfiles) {
    log('Processing ALL profiles (--all flag is set)', 'info');
    // No filter - will process all profiles
  } else if (CONFIG.targetProfileId) {
    log(`Targeting specific profile ID: ${CONFIG.targetProfileId}`, 'info');
    query = query.eq('id', CONFIG.targetProfileId);
  } else {
    log('No target profile specified and --all flag not set. Using default profile ID.', 'warn');
    query = query.eq('id', '44b0cd15-c901-4517-9743-31c68032259d');
  }
  
  const { data: profiles, error } = await query;
  
  if (error) {
    console.error('Error fetching profiles:', error);
    log(`Error fetching profiles: ${error.message}`, 'error');
    return false;
  }
  
  if (!profiles || profiles.length === 0) {
    console.error('No profiles found');
    log('No profiles found', 'error');
    return false;
  }
  
  console.log(`Fetched ${profiles.length} profiles`);
  log(`Fetched ${profiles.length} profiles`, 'info');
  
  console.log('Fetching CRM customers...');
  const crmCustomers = await fetchAllCrmCustomers();
  console.log(`Fetched ${crmCustomers.length} CRM customers`);
  
  // Process profiles
  console.log('Processing profiles...');
  let matchCount = 0;
  let lowerMatchCount = 0;
  let notMatchedCount = 0;  // Re-add this to track profiles with no matches
  
  // Make sure we have all the confidence levels
  const confidenceLevels = {
    '0.0-0.1': 0,
    '0.1-0.2': 0,
    '0.2-0.3': 0,
    '0.3-0.4': 0,
    '0.4-0.5': 0,
    '0.5-0.6': 0,
    '0.6-0.7': 0,
    '0.7-0.8': 0,
    '0.8-0.9': 0,
    '0.9-1.0': 0
  };
  
  for (const profile of profiles) {
    try {
      console.log(`Processing profile ${profile.id} (${profile.display_name})`);
      const { match, score, reasons } = matchProfile(profile, crmCustomers);
      
      if (match) {
        if (score >= 0.6) {
          // Only count as a match if score >= 0.6
          matchCount++;
          // ... create mapping code ...
          await createMapping(supabase, profile, match, score, reasons);
        } else if (score >= 0.4) {
          // Track lower confidence matches but don't create mappings
          lowerMatchCount++;
          console.log(`Lower confidence match found for profile ${profile.id} with score ${score.toFixed(1)}`);
        } else {
          console.log(`No match found for profile ${profile.id} (best score: ${score.toFixed(1)})`);
        }

        // Track confidence level statistics regardless of whether we create a mapping
        if (score >= 0.2 && score < 0.3) confidenceLevels['0.2-0.3']++;
        else if (score >= 0.3 && score < 0.4) confidenceLevels['0.3-0.4']++;
        else if (score >= 0.4 && score < 0.5) confidenceLevels['0.4-0.5']++;
        else if (score >= 0.5 && score < 0.6) confidenceLevels['0.5-0.6']++;
        else if (score >= 0.6 && score < 0.7) confidenceLevels['0.6-0.7']++;
        else if (score >= 0.7 && score < 0.8) confidenceLevels['0.7-0.8']++;
        else if (score >= 0.8 && score < 0.9) confidenceLevels['0.8-0.9']++;
        else if (score >= 0.9) confidenceLevels['0.9-1.0']++;
      } else {
        console.log(`No match found for profile ${profile.id}`);
        notMatchedCount++;
      }
    } catch (error) {
      console.error(`Error processing profile ${profile.id}:`, error);
      log(`Error processing profile ${profile.id}: ${error.message}`, 'error');
    }
  }
  
  // Log statistics
  console.log('=== Matching Statistics ===');
  console.log(`Profiles processed: ${profiles.length}`);
  console.log(`High confidence matches (>=0.6): ${matchCount}`);
  console.log(`Lower confidence matches (0.4-0.6): ${lowerMatchCount}`);
  console.log(`Total matches found: ${matchCount + lowerMatchCount}`);
  console.log(`Not matched: ${notMatchedCount}`);
  
  // Log confidence level breakdown
  console.log('=== Confidence Level Breakdown ===');
  for (const [level, count] of Object.entries(confidenceLevels)) {
    if (count > 0) {
      console.log(`  ${level}: ${count} profiles`);
    }
  }
  
  log(`Matching complete. High confidence (mapped): ${matchCount}, Lower confidence (not mapped): ${lowerMatchCount}, Not matched: ${notMatchedCount}`, 'info');
  
  if (typeof lowerMatchCount !== 'undefined') {
    log(`Note: ${lowerMatchCount} profiles had match scores between 0.4-0.6 but were not mapped due to confidence threshold`, 'info');
  }
  
  console.log('Main function completed');
  return true;
}

// Run the main function
console.log('Calling main function...');
main().then(success => {
  if (success) {
    log('Script completed successfully', 'info');
    process.exit(0);
  } else {
    log('Script completed with errors', 'error');
    process.exit(1);
  }
}).catch(err => {
  console.error('Error in main function:', err);
  log(`Unhandled error: ${err.message}`, 'error');
  process.exit(1);
});