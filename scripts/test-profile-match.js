#!/usr/bin/env node
require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');
const crypto = require('crypto');

// Profile IDs to test
const PROFILE_IDS = [
  '44b0cd15-c901-4517-9743-31c68032259d', // guest login - 842695447
  '3afaf5ea-d8c5-4745-9d7d-ba99ab162e1e', // Google login - 66842695447
  'f7775120-f37f-45e5-92b9-0388f8670ea5'  // Facebook login - 66842695447
];

// Create client for the CRM database
function createCrmClient() {
  const supabaseUrl = process.env.CRM_SUPABASE_URL;
  const supabaseKey = process.env.CRM_SUPABASE_SERVICE_KEY;
  
  if (!supabaseUrl || !supabaseKey) {
    console.log('No CRM database credentials found.');
    return {
      from: (table) => ({
        select: () => ({
          eq: () => Promise.resolve({ data: [], error: null })
        })
      })
    };
  }
  
  return createClient(supabaseUrl, supabaseKey);
}

// Create client for the main booking database
function createMainClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  
  if (!supabaseUrl || !supabaseKey) {
    console.log('Main database credentials not found');
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

// Check if two phone numbers match
function phoneNumbersMatch(phone1, phone2) {
  const normalized1 = normalizePhoneNumber(phone1);
  const normalized2 = normalizePhoneNumber(phone2);
  
  console.log(`Comparing phones: 
    Original: "${phone1}" vs "${phone2}"
    Normalized: "${normalized1}" vs "${normalized2}"
    Match: ${normalized1 === normalized2}`);
  
  return normalized1 === normalized2;
}

// Test matching for a specific profile
async function testMatchForProfile(profileId) {
  console.log(`\n======= Testing match for profile ${profileId} =======`);
  
  // Get profile details
  const mainClient = createMainClient();
  const { data: profile, error: profileError } = await mainClient
    .from('profiles')
    .select('*')
    .eq('id', profileId)
    .single();
  
  if (profileError || !profile) {
    console.log(`Error fetching profile: ${profileError?.message || 'Profile not found'}`);
    return null;
  }
  
  console.log(`Profile: ${profile.display_name} (${profile.email})`);
  console.log(`Phone: ${profile.phone_number}`);
  
  // Look for CRM customers with matching phone
  const crmClient = createCrmClient();
  const { data: crmCustomers, error: crmError } = await crmClient
    .from('customers')
    .select('*');
  
  if (crmError) {
    console.log(`Error fetching CRM customers: ${crmError.message}`);
    return null;
  }
  
  console.log(`Checking against ${crmCustomers.length} CRM customers...`);
  
  // Try matching by phone
  const phoneMatches = crmCustomers.filter(customer => 
    phoneNumbersMatch(profile.phone_number, customer.contact_number)
  );
  
  console.log(`Found ${phoneMatches.length} phone matches`);
  
  if (phoneMatches.length > 0) {
    phoneMatches.forEach(match => {
      console.log(`Match: ${match.customer_name} (${match.contact_number})`);
      console.log(`CRM ID: ${match.id}`);
      console.log(`Email: ${match.email || 'none'}`);
      
      // Create a stable hash ID
      const normalizedPhone = normalizePhoneNumber(match.contact_number);
      const normalizedName = (match.customer_name || '').toLowerCase().trim();
      const hashInput = `${normalizedName}::${normalizedPhone}`;
      const stableHashId = crypto.createHash('md5').update(hashInput).digest('hex');
      
      console.log(`Hash Input: ${hashInput}`);
      console.log(`Stable Hash ID: ${stableHashId}`);
    });
    
    // Generate mapping
    const bestMatch = phoneMatches[0];
    await createMapping(profile, bestMatch);
  } else {
    console.log(`No phone matches found for ${profile.phone_number}`);
    
    // Try matching by email
    if (profile.email) {
      const emailMatches = crmCustomers.filter(customer => 
        customer.email && customer.email.toLowerCase() === profile.email.toLowerCase()
      );
      
      console.log(`Found ${emailMatches.length} email matches`);
      
      if (emailMatches.length > 0) {
        emailMatches.forEach(match => {
          console.log(`Match: ${match.customer_name} (${match.contact_number})`);
          console.log(`CRM ID: ${match.id}`);
        });
      }
    }
  }
}

// Create or update a mapping
async function createMapping(profile, customer) {
  console.log(`Creating/updating mapping for profile ${profile.id} to CRM customer ${customer.id}`);
  
  const mainClient = createMainClient();
  
  // Generate stable hash ID
  const normalizedPhone = normalizePhoneNumber(customer.contact_number);
  const normalizedName = (customer.customer_name || '').toLowerCase().trim();
  const stableHashId = crypto.createHash('md5').update(`${normalizedName}::${normalizedPhone}`).digest('hex');
  
  const mappingData = {
    profile_id: profile.id,
    crm_customer_id: customer.id.toString(),
    crm_customer_data: {
      id: customer.id.toString(),
      name: customer.customer_name,
      phone_number: customer.contact_number,
      email: customer.email,
      stable_hash_id: stableHashId
    },
    is_matched: true,
    match_method: 'auto',
    match_confidence: 1.0,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };
  
  const { data, error } = await mainClient
    .from('crm_customer_mapping')
    .upsert(mappingData)
    .select();
  
  if (error) {
    console.log(`Error creating mapping: ${error.message}`);
    return null;
  }
  
  console.log(`Mapping created/updated successfully!`);
  return data[0];
}

// Main function
async function main() {
  console.log('Testing profile matching for specific profiles');
  
  for (const profileId of PROFILE_IDS) {
    await testMatchForProfile(profileId);
  }
  
  console.log('\nAll tests complete!');
}

main().catch(error => {
  console.error(`Unhandled error: ${error.message}`);
  process.exit(1);
}); 