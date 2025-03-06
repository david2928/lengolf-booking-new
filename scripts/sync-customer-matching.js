#!/usr/bin/env node
const path = require('path');
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

console.log('=== Starting Customer Matching Script ===');

// Hardcoded credentials
const CREDENTIALS = {
  // Booking Supabase
  SUPABASE_URL: 'https://bisimqmtxjsptehhqpeg.supabase.co',
  SUPABASE_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJpc2ltcW10eGpzcHRlaGhxcGVnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MzgzOTY5MzEsImV4cCI6MjA1Mzk3MjkzMX0.NZ_mEOOoaKEG1p9LBXkULWwSIr-rWmCbksVZq3OzSYE',
  
  // CRM Supabase
  CRM_SUPABASE_URL: 'https://dujqvigihnlfnvmcdrko.supabase.co',
  CRM_SUPABASE_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImR1anF2aWdpaG5sZm52bWNkcmtvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MzM3NTQyNDYsImV4cCI6MjA0OTMzMDI0Nn0.N-KIgE6_nfAY9LarJgFYFjBvjQ6awVgDmUtsBbNzhZM'
};

// Configuration
const CONFIG = {
  confidenceThreshold: 0.6,
  debugMode: true,
  // Target profile ID to process
  targetProfileId: '44b0cd15-c901-4517-9743-31c68032259d'
};

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
    
    // Phone number matching (higher weight)
    if (normalizedProfilePhone && normalizedCustomerPhone) {
      if (normalizedProfilePhone === normalizedCustomerPhone) {
        score += 0.7; // Increased from 0.5 for exact phone matches
        reasons.push('exact_phone_match');
      } else if (normalizedProfilePhone.includes(normalizedCustomerPhone) || 
                normalizedCustomerPhone.includes(normalizedProfilePhone)) {
        score += 0.3;
        reasons.push('partial_phone_match');
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
  // Only create mappings for high confidence matches (> 0.6)
  if (score <= 0.6) {
    console.log(`Skipping mapping creation for profile ${profile.id} - confidence score ${score.toFixed(2)} is below threshold`);
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
  log(`Configuration: confidenceThreshold=${CONFIG.confidenceThreshold}, debugMode=${CONFIG.debugMode}`, 'info');
  
  console.log('Creating Supabase client...');
  const supabase = createBookingClient();
  console.log('Supabase client created');
  
  console.log('Fetching all profiles...');
  const { data: profiles, error } = await supabase
    .from('profiles')
    .select('*');
    // Removing the filter to process all profiles
    // .eq('id', CONFIG.targetProfileId);
  
  if (error) {
    console.error('Error fetching profiles:', error);
    log(`Error fetching profiles: ${error.message}`, 'error');
    return;
  }
  
  if (!profiles || profiles.length === 0) {
    console.error('No profiles found');
    log('No profiles found', 'error');
    return;
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
}

// Run the main function
console.log('Calling main function...');
main().catch(err => {
  console.error('Error in main function:', err);
  process.exit(1);
}); 