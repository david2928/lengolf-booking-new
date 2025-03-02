#!/usr/bin/env node
/**
 * This script performs a full sync of all profiles in the booking system 
 * against the CRM customer database.
 * 
 * It will:
 * 1. Fetch all profiles from the booking system
 * 2. Fetch all customers from the CRM
 * 3. Compare each profile against CRM customers to find matches
 * 4. Store matches in the crm_customer_mapping table
 * 
 * Usage:
 * 1. Run `node scripts/sync-all-profiles.js`
 * 2. Check the console output for matching results
 */

const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');
const fs = require('fs');
const path = require('path');

// Load environment variables from .env.local
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

// Constants
const MATCH_CONFIDENCE_THRESHOLD = 0.75; // Threshold for high-confidence automatic matches
const LOG_BATCH_SIZE = 10; // Log progress every N profiles
const CSV_FILENAME = 'manual_matches_review.csv';

// Store clients
let crmSupabaseClient = null;
let mainSupabaseClient = null;

/**
 * Create a client connection to the CRM Supabase instance
 */
function createCrmClient() {
  if (crmSupabaseClient) {
    return crmSupabaseClient;
  }

  // We need separate environment variables for the CRM Supabase connection
  const url = process.env.CRM_SUPABASE_URL;
  const key = process.env.CRM_SUPABASE_SERVICE_KEY;

  if (!url || !key) {
    throw new Error('CRM Supabase environment variables are not set');
  }

  crmSupabaseClient = createClient(url, key, {
    auth: {
      persistSession: false
    }
  });

  return crmSupabaseClient;
}

/**
 * Create a client connection to the main Supabase instance
 */
function createMainClient() {
  if (mainSupabaseClient) {
    return mainSupabaseClient;
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error('Main Supabase environment variables are not set');
  }

  mainSupabaseClient = createClient(url, key, {
    auth: {
      persistSession: false
    }
  });

  return mainSupabaseClient;
}

/**
 * Fetch all profiles from the booking system
 */
async function fetchAllProfiles() {
  const supabase = createMainClient();
  
  const { data, error } = await supabase
    .from('profiles')
    .select('id, display_name, email, phone_number');
  
  if (error) {
    throw new Error(`Failed to fetch profiles: ${error.message}`);
  }
  
  return data || [];
}

/**
 * Fetch all customers from the CRM system
 */
async function fetchAllCrmCustomers() {
  const supabase = createCrmClient();
  const allCustomers = [];
  let page = 0;
  const pageSize = 1000;
  let hasMore = true;
  
  console.log('Fetching CRM customers...');
  
  while (hasMore) {
    const from = page * pageSize;
    const to = from + pageSize - 1;
    
    console.log(`  Fetching page ${page + 1} (records ${from}-${to})...`);
    
    const { data, error, count } = await supabase
      .from('customers')
      .select('*', { count: 'exact' })
      .range(from, to);
    
    if (error) {
      throw new Error(`Failed to fetch CRM customers: ${error.message}`);
    }
    
    if (!data || data.length === 0) {
      hasMore = false;
    } else {
      allCustomers.push(...data);
      page++;
      
      // Check if we've got all records
      if (data.length < pageSize) {
        hasMore = false;
      }
    }
  }
  
  console.log(`Fetched ${allCustomers.length} total CRM customers from database`);
  
  // Transform to expected format
  return allCustomers.map(customer => ({
    id: String(customer.id),
    name: String(customer.customer_name || ''),
    email: customer.email,
    phone_number: customer.contact_number,
    additional_data: {
      store: customer.store,
      address: customer.address,
      date_of_birth: customer.date_of_birth,
      date_joined: customer.date_joined,
      available_credit: customer.available_credit,
      available_point: customer.available_point,
      source: customer.source,
      sms_pdpa: customer.sms_pdpa,
      email_pdpa: customer.email_pdpa,
      batch_id: customer.batch_id,
      update_time: customer.update_time,
      created_at: customer.created_at
    }
  }));
}

/**
 * Normalize a phone number for comparison
 */
function normalizePhoneNumber(phone) {
  if (!phone) return '';
  
  // Remove all non-digit characters
  let normalized = phone.replace(/\D/g, '');
  
  // International phone handling - remove country codes
  // The strategy is to detect and remove country codes, then handle various regional formats
  
  // Swedish numbers: remove country code +46
  if (normalized.startsWith('46') && normalized.length >= 11) {
    normalized = normalized.substring(2);
  }
  
  // Thai numbers: remove country code +66
  else if (normalized.startsWith('66') && normalized.length > 9) {
    normalized = normalized.substring(2);
  }
  
  // UK numbers: remove country code +44
  else if (normalized.startsWith('44') && normalized.length >= 11) {
    normalized = normalized.substring(2);
  }
  
  // US/Canada numbers: remove country code +1
  else if (normalized.startsWith('1') && normalized.length >= 11) {
    normalized = normalized.substring(1);
  }
  
  // Australia: remove country code +61
  else if (normalized.startsWith('61') && normalized.length >= 11) {
    normalized = normalized.substring(2);
  }
  
  // European countries with 2-digit country codes (30-Greece, 31-Netherlands, 32-Belgium, etc.)
  else {
    const twoDigitEUCountryCodes = ['30', '31', '32', '33', '34', '36', '39', '41', '43', '45', '49'];
    for (const code of twoDigitEUCountryCodes) {
      if (normalized.startsWith(code) && normalized.length >= 10) {
        normalized = normalized.substring(2);
        break;
      }
    }
  }
  
  // Handle trunk prefixes (leading zero)
  // In many countries the leading 0 is a trunk prefix that's omitted in international format
  // For UK, Germany, France, Italy, Australia, etc.
  if (normalized.startsWith('0')) {
    // Remove the leading trunk zero for standardization
    normalized = normalized.substring(1);
  }
  
  return normalized;
}

/**
 * Test phone number matching with proper normalization
 * This handles different international formats and country codes
 */
function phoneNumbersMatch(phone1, phone2) {
  if (!phone1 || !phone2) return false;
  
  // Direct match after normalization
  if (phone1 === phone2) return true;
  
  // Try matching last 9 digits for international numbers
  // This is helpful when country codes are handled differently
  if (phone1.length >= 9 && phone2.length >= 9) {
    const last9digits1 = phone1.substring(phone1.length - 9);
    const last9digits2 = phone2.substring(phone2.length - 9);
    if (last9digits1 === last9digits2) return true;
  }
  
  // Try matching last 8 digits for very inconsistent formats
  else if (phone1.length >= 8 && phone2.length >= 8) {
    const last8digits1 = phone1.substring(phone1.length - 8);
    const last8digits2 = phone2.substring(phone2.length - 8);
    if (last8digits1 === last8digits2) return true;
  }
  
  // For shorter numbers (like 7 digits), just compare directly
  else if (phone1.length <= 7 && phone2.length <= 7 && phone1 === phone2) {
    return true;
  }
  
  return false;
}

/**
 * Normalize a name for comparison
 * Removes special characters, emojis, and converts to lowercase
 * Also transliterates international characters to basic Latin equivalents
 */
function normalizeName(name) {
  if (!name) return '';
  
  // Convert to lowercase
  let normalized = name.toLowerCase();
  
  // Transliterate common international characters to basic Latin
  const transliterations = {
    'ä': 'a', 'á': 'a', 'à': 'a', 'â': 'a', 'ã': 'a', 'å': 'a',
    'ö': 'o', 'ó': 'o', 'ò': 'o', 'ô': 'o', 'õ': 'o', 'ø': 'o',
    'ü': 'u', 'ú': 'u', 'ù': 'u', 'û': 'u',
    'ë': 'e', 'é': 'e', 'è': 'e', 'ê': 'e',
    'ï': 'i', 'í': 'i', 'ì': 'i', 'î': 'i',
    'ñ': 'n', 'ç': 'c', 'ß': 'ss'
  };
  
  // Apply transliterations
  for (const [char, replacement] of Object.entries(transliterations)) {
    normalized = normalized.replace(new RegExp(char, 'g'), replacement);
  }
  
  // Remove special characters, emojis, and extra whitespace
  normalized = normalized.replace(/[^\w\s]/g, '').trim();
  
  return normalized;
}

/**
 * Normalize an email address for comparison
 */
function normalizeEmail(email) {
  if (!email) return '';
  
  // Convert to lowercase
  let normalized = email.toLowerCase().trim();
  
  // Handle Gmail's dot-insensitive addressing
  if (normalized.endsWith('@gmail.com')) {
    const [localPart, domain] = normalized.split('@');
    // Remove dots from the local part (Gmail ignores dots)
    const localPartNoDots = localPart.replace(/\./g, '');
    // Remove everything after + (Gmail ignores +tags)
    const localPartNoTags = localPartNoDots.split('+')[0];
    normalized = `${localPartNoTags}@${domain}`;
  }
  
  return normalized;
}

/**
 * Check if names match by comparing individual parts
 * This handles cases where names have different ordering or additional/missing parts
 */
function namePartsMatch(name1, name2) {
  if (!name1 || !name2) return { match: false, score: 0 };
  
  // Split names into parts
  const parts1 = name1.split(/\s+/).filter(part => part.length > 1);
  const parts2 = name2.split(/\s+/).filter(part => part.length > 1);
  
  if (parts1.length === 0 || parts2.length === 0) {
    return { match: false, score: 0 };
  }
  
  // Count how many parts match
  let matchCount = 0;
  let totalParts = Math.max(parts1.length, parts2.length);
  
  // Check each part from the shorter name against all parts of the longer name
  const shorterParts = parts1.length <= parts2.length ? parts1 : parts2;
  const longerParts = parts1.length > parts2.length ? parts1 : parts2;
  
  for (const shortPart of shorterParts) {
    // Check if this part matches any part in the longer name
    const matches = longerParts.some(longPart => 
      longPart === shortPart || 
      longPart.includes(shortPart) || 
      shortPart.includes(longPart)
    );
    
    if (matches) matchCount++;
  }
  
  // Calculate match score based on percentage of matching parts
  const score = matchCount / totalParts;
  
  return { 
    match: score > 0,
    score: score,
    exactMatch: score === 1 && parts1.length === parts2.length
  };
}

/**
 * Calculate match confidence between a profile and a CRM customer
 */
function calculateMatchConfidence(profile, customer) {
  if (!profile || !customer) return { confidence: 0, reasons: [] };

  // Set weights for different match types
  const PHONE_MATCH_WEIGHT = 0.8;
  const EMAIL_MATCH_WEIGHT = 0.3;
  const NAME_MATCH_WEIGHT = 0.1;
  
  let maxScore = PHONE_MATCH_WEIGHT + EMAIL_MATCH_WEIGHT + NAME_MATCH_WEIGHT;
  let score = 0;
  let reasons = [];

  // Normalize phone numbers for comparison
  const normalizedProfilePhone = normalizePhoneNumber(profile.phone_number);
  const normalizedCustomerPhone = normalizePhoneNumber(customer.phone_number);
  
  // Check for phone match (strongest signal)
  if (normalizedProfilePhone && normalizedCustomerPhone && 
      phoneNumbersMatch(normalizedProfilePhone, normalizedCustomerPhone)) {
    score += PHONE_MATCH_WEIGHT;
    reasons.push('PHONE');
  }

  // Normalize emails for comparison
  const normalizedProfileEmail = normalizeEmail(profile.email);
  const normalizedCustomerEmail = normalizeEmail(customer.email);
  
  // Check for email match
  if (normalizedProfileEmail && normalizedCustomerEmail && 
      normalizedProfileEmail === normalizedCustomerEmail) {
    score += EMAIL_MATCH_WEIGHT;
    reasons.push('EMAIL');
  }

  // Check for name match with improved normalization
  const profileName = normalizeName(profile.display_name);
  const customerName = normalizeName(customer.name);

  if (profileName && customerName) {
    if (profileName === customerName) {
      score += NAME_MATCH_WEIGHT;
      reasons.push('DISPLAY_NAME_EXACT');
    } else {
      // Enhanced name matching using parts comparison
      const nameParts = namePartsMatch(profileName, customerName);
      
      if (nameParts.exactMatch) {
        score += NAME_MATCH_WEIGHT;
        reasons.push('DISPLAY_NAME_PARTS_EXACT');
      } else if (nameParts.match) {
        // Apply a score based on how many parts match
        const partScore = NAME_MATCH_WEIGHT * nameParts.score;
        score += partScore;
        reasons.push('DISPLAY_NAME_PARTS_PARTIAL');
      } else if (
        (customerName.includes(profileName) || profileName.includes(customerName)) && 
        profileName.length > 2 && customerName.length > 2
      ) {
        // Fallback to the previous approach for simple substring matches
        score += NAME_MATCH_WEIGHT * 0.7;
        reasons.push('DISPLAY_NAME_PARTIAL');
      }
    }
  }

  // Normalize the confidence score (0-1 range)
  const normalizedScore = score / maxScore;
  
  // Improved boosting logic - prioritize phone matches even more
  let adjustedScore = normalizedScore;
  if (normalizedScore >= MATCH_CONFIDENCE_THRESHOLD * 0.9 && normalizedScore < MATCH_CONFIDENCE_THRESHOLD) {
    adjustedScore = MATCH_CONFIDENCE_THRESHOLD;
    reasons.push('BOOSTED_NEAR_THRESHOLD');
  } else if (reasons.includes('PHONE')) {
    // If we have a phone match, boost it to meet threshold
    // Phone numbers are unique enough to be very strong signals
    adjustedScore = MATCH_CONFIDENCE_THRESHOLD;
    reasons.push('BOOSTED_PHONE_MATCH');
  }

  return { confidence: adjustedScore, reasons };
}

/**
 * Main function to sync all profiles with CRM customers
 */
async function main() {
  console.log('Starting full profile sync with CRM customers...');
  
  try {
    // Fetch all profiles from booking system
    const profiles = await fetchAllProfiles();
    
    // Fetch all customers from CRM system
    const crmCustomers = await fetchAllCrmCustomers();
    
    console.log(`Fetched ${profiles.length} profiles and ${crmCustomers.length} CRM customers`);
    
    // Track statistics
    const stats = {
      totalProcessed: 0,
      potentialMatches: 0,
      highConfidenceMatches: 0,
      noMatches: 0,
      errors: 0,
      newMappingsCreated: 0, // Track new mappings
      updatedMappings: 0, // Track updated mappings
      matchReasons: {
        PHONE: 0,
        EMAIL: 0,
        DISPLAY_NAME: 0,
        DISPLAY_NAME_PARTIAL: 0
      }
    };
    
    // Create arrays to store matches
    const highConfidenceMatches = [];
    const manualReviewMatches = [];
    
    // Process each profile
    for (const profile of profiles) {
      stats.totalProcessed++;
      
      // Find potential matches
      let bestMatch = null;
      let bestScore = 0;
      let bestMatchDetails = null;
      
      // Special handling for phone number matches
      let phoneMatch = null;
      
      for (const customer of crmCustomers) {
        const matchDetails = calculateMatchConfidence(profile, customer);
        
        // Phone matches are very strong signals, prioritize them
        if (matchDetails.reasons.includes('PHONE')) {
          phoneMatch = {
            customer,
            confidence: matchDetails.confidence,
            matchDetails
          };
        }
        
        if (matchDetails.confidence > bestScore) {
          bestScore = matchDetails.confidence;
          bestMatch = customer;
          bestMatchDetails = matchDetails;
        }
      }
      
      // If we found a phone match but it wasn't the best score (unlikely), use it anyway
      if (phoneMatch && !bestMatchDetails.reasons.includes('PHONE')) {
        bestMatch = phoneMatch.customer;
        bestScore = phoneMatch.confidence;
        bestMatchDetails = phoneMatch.matchDetails;
      }
      
      if (bestMatch && bestScore > 0) {
        stats.potentialMatches++;
        
        // Prepare data for the match
        const matchData = {
          profile_id: profile.id,
          crm_customer_id: bestMatch.id,
          crm_customer_data: bestMatch,
          match_confidence: bestScore,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        };
        
        if (bestScore >= MATCH_CONFIDENCE_THRESHOLD) {
          // High confidence match - save for auto-matching
          matchData.is_matched = true;
          matchData.match_method = 'auto';
          highConfidenceMatches.push(matchData);
          stats.highConfidenceMatches++;
          
          // Count match reasons
          bestMatchDetails.reasons.forEach(reason => {
            if (stats.matchReasons[reason] !== undefined) {
              stats.matchReasons[reason]++;
            }
          });
        } else {
          // Lower confidence match - save for manual review
          manualReviewMatches.push({
            profile_id: profile.id,
            profile_name: profile.display_name || 'Unknown',
            profile_email: profile.email || 'No email',
            profile_phone: profile.phone_number || 'No phone',
            crm_customer_id: bestMatch.id,
            crm_customer_name: bestMatch.name,
            crm_customer_email: bestMatch.email || 'No email',
            crm_customer_phone: bestMatch.phone_number || 'No phone',
            match_confidence: bestScore.toFixed(2),
            match_reasons: bestMatchDetails.reasons.join(', ')
          });
        }
      } else {
        stats.noMatches++;
      }
      
      // Log progress periodically
      if (stats.totalProcessed % LOG_BATCH_SIZE === 0) {
        console.log(`Processed ${stats.totalProcessed}/${profiles.length} profiles...`);
      }
    }
    
    // Insert high confidence matches into the database
    if (highConfidenceMatches.length > 0) {
      console.log(`\nInserting ${highConfidenceMatches.length} high confidence matches into database...`);
      
      const supabase = createMainClient();
      
      // Insert in batches to avoid request size limitations
      const BATCH_SIZE = 50;
      for (let i = 0; i < highConfidenceMatches.length; i += BATCH_SIZE) {
        const batch = highConfidenceMatches.slice(i, i + BATCH_SIZE);
        console.log(`Inserting batch ${Math.floor(i/BATCH_SIZE) + 1}/${Math.ceil(highConfidenceMatches.length/BATCH_SIZE)}...`);
        
        // First check which mappings already exist
        const profileIds = batch.map(m => m.profile_id);
        const { data: existingMappings, error: fetchError } = await supabase
          .from('crm_customer_mapping')
          .select('profile_id, crm_customer_id')
          .in('profile_id', profileIds);
        
        if (fetchError) {
          console.error('Error fetching existing mappings:', fetchError);
          stats.errors++;
          continue;
        }
        
        // Create a lookup map for existing mappings
        const existingMap = new Map();
        existingMappings?.forEach(mapping => {
          existingMap.set(mapping.profile_id, mapping.crm_customer_id);
        });
        
        // Count new vs updated mappings
        batch.forEach(mapping => {
          if (existingMap.has(mapping.profile_id)) {
            if (existingMap.get(mapping.profile_id) !== mapping.crm_customer_id) {
              stats.updatedMappings++;
            }
          } else {
            stats.newMappingsCreated++;
          }
        });
        
        const { error } = await supabase
          .from('crm_customer_mapping')
          .upsert(batch, {
            onConflict: 'profile_id,crm_customer_id',
            ignoreDuplicates: false
          });
        
        if (error) {
          console.error('Error inserting mappings:', error);
          stats.errors++;
        }
      }
    }
    
    // Write manual review matches to CSV
    if (manualReviewMatches.length > 0) {
      console.log(`\nWriting ${manualReviewMatches.length} matches for manual review to ${CSV_FILENAME}...`);
      
      // Create CSV content with better formatting
      let csvContent = 'profile_id,profile_name,profile_email,profile_phone,crm_customer_id,crm_customer_name,crm_customer_email,crm_customer_phone,match_confidence,match_reasons\r\n';
      
      // Create CSV rows with appropriate escaping
      manualReviewMatches.forEach(match => {
        csvContent += [
          match.profile_id,
          escapeCsv(match.profile_name),
          escapeCsv(match.profile_email),
          escapeCsv(match.profile_phone),
          match.crm_customer_id,
          escapeCsv(match.crm_customer_name),
          escapeCsv(match.crm_customer_email),
          escapeCsv(match.crm_customer_phone),
          match.match_confidence,
          escapeCsv(match.match_reasons)
        ].join(',') + '\r\n';
      });
      
      // Write to file
      fs.writeFileSync(CSV_FILENAME, csvContent, { encoding: 'utf8' });
      
      console.log(`CSV file created: ${path.resolve(process.cwd(), CSV_FILENAME)}`);
    }
    
    // Output results
    console.log('\nSync Complete. Results:');
    console.log(`Total profiles processed: ${stats.totalProcessed}`);
    console.log(`Profiles with potential matches: ${stats.potentialMatches}`);
    console.log(`High confidence matches (auto-matched): ${stats.highConfidenceMatches}`);
    console.log(`New mappings created: ${stats.newMappingsCreated}`);
    console.log(`Existing mappings updated: ${stats.updatedMappings}`);
    console.log(`Profiles with no matches: ${stats.noMatches}`);
    console.log(`Mappings created in database: ${highConfidenceMatches.length}`);
    console.log(`Manual matches for review (saved to CSV): ${manualReviewMatches.length}`);
    console.log(`Errors: ${stats.errors}`);
    console.log(`Match rate: ${(stats.highConfidenceMatches / stats.totalProcessed * 100).toFixed(2)}%`);
    
    // Output match reasons statistics
    console.log('\nMatch Reasons for High Confidence Matches:');
    for (const [reason, count] of Object.entries(stats.matchReasons)) {
      if (count > 0) {
        console.log(`  ${reason}: ${count}`);
      }
    }
    
    return {
      totalProfiles: stats.totalProcessed,
      highConfidenceMatches: stats.highConfidenceMatches,
      newMappingsCreated: stats.newMappingsCreated,
      updatedMappings: stats.updatedMappings,
      manualReviewMatches: manualReviewMatches.length,
      noMatches: stats.noMatches,
      matchReasons: stats.matchReasons
    };
  } catch (error) {
    console.error('Error in profile sync:', error);
    return {
      error: error.message
    };
  }
}

/**
 * Helper function to escape values for CSV
 */
function escapeCsv(value) {
  if (value === null || value === undefined) return '';
  return `"${String(value).replace(/"/g, '""')}"`;
}

// Run the main function if called directly
if (require.main === module) {
  main().catch(console.error);
}

// Export the main function
module.exports = { main }; 