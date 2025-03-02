import { createServerClient } from './supabase/server';
import { createCrmClient, fetchCrmCustomers, calculateMatchConfidence, normalizePhoneNumber, CrmCustomer } from './supabase/crm';
import type { Profile, CrmCustomerMapping } from '@/types/supabase';

const MATCH_CONFIDENCE_THRESHOLD = 0.75; // Minimum confidence to consider a match as "auto"

/**
 * Fetch all profiles from our booking system
 */
async function fetchAllProfiles(): Promise<Profile[]> {
  const supabase = createServerClient();
  
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .order('updated_at', { ascending: false });
  
  if (error) {
    console.error('Error fetching profiles:', error);
    throw error;
  }
  
  return data || [];
}

/**
 * Try to match a single profile with CRM customers
 * This is designed to be called when a user logs in or makes a booking
 * to immediately attempt to match them with a CRM customer
 * 
 * @param profileId The ID of the profile to match
 * @returns The match result if successful, null if no match found
 */
export async function matchProfileWithCrm(profileId: string): Promise<{
  matched: boolean;
  confidence: number;
  crmCustomerId?: string;
} | null> {
  try {
    // First check if this profile is already mapped
    const supabase = createServerClient();
    const { data: existingMapping } = await supabase
      .from('crm_customer_mapping')
      .select('*')
      .eq('profile_id', profileId)
      .eq('is_matched', true)
      .maybeSingle();
    
    // If already matched, just return the existing mapping
    if (existingMapping) {
      return {
        matched: true,
        confidence: existingMapping.match_confidence,
        crmCustomerId: existingMapping.crm_customer_id
      };
    }
    
    // Get the profile details
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', profileId)
      .single();
    
    if (profileError || !profile) {
      console.error('Error fetching profile:', profileError);
      return null;
    }
    
    // Skip profiles without any matching data
    if (!profile.phone_number && !profile.email && !profile.name && !profile.display_name) {
      return null;
    }
    
    // Fetch CRM customers
    const crmCustomers = await fetchCrmCustomers();
    
    // Find potential matches
    const matches = [];
    
    for (const customer of crmCustomers) {
      const matchResult = calculateMatchConfidence(
        { 
          phone_number: profile.phone_number || '', 
          email: profile.email || '', 
          name: profile.display_name || profile.name || '' 
        },
        customer
      );
      
      if (matchResult.confidence > 0) {
        matches.push({
          customer,
          confidence: matchResult.confidence,
          reasons: matchResult.reasons
        });
      }
    }
    
    // Sort matches by confidence (highest first)
    matches.sort((a, b) => b.confidence - a.confidence);
    
    if (matches.length === 0) {
      return null;
    }
    
    // Get the best match
    const bestMatch = matches[0];
    const isHighConfidence = bestMatch.confidence >= MATCH_CONFIDENCE_THRESHOLD;
    
    // Store the mapping
    await supabase
      .from('crm_customer_mapping')
      .upsert({
        profile_id: profileId,
        crm_customer_id: bestMatch.customer.id,
        crm_customer_data: bestMatch.customer,
        is_matched: isHighConfidence,
        match_method: isHighConfidence ? 'auto' : 'manual',
        match_confidence: bestMatch.confidence,
        match_reasons: bestMatch.reasons.join(', '),
        updated_at: new Date().toISOString()
      }, {
        onConflict: 'profile_id,crm_customer_id'
      });
    
    // Return the match result
    return {
      matched: isHighConfidence,
      confidence: bestMatch.confidence,
      crmCustomerId: bestMatch.customer.id
    };
  } catch (error) {
    console.error('Error matching profile with CRM:', error);
    return null;
  }
}

/**
 * Sync customers from the CRM to our local mapping table
 * This function:
 * 1. Fetches CRM customers
 * 2. Fetches our local profiles
 * 3. Finds potential matches based on phone number, email, etc.
 * 4. Stores the matches in the crm_customer_mapping table
 */
export async function syncCrmCustomers(lastSyncTimestamp?: string): Promise<{
  totalCrmCustomers: number;
  potentialMatches: number;
  highConfidenceMatches: number;
}> {
  const [crmCustomers, profiles] = await Promise.all([
    fetchCrmCustomers(lastSyncTimestamp),
    fetchAllProfiles()
  ]);
  
  const supabase = createServerClient();
  let potentialMatches = 0;
  let highConfidenceMatches = 0;
  
  // Process each CRM customer
  for (const crmCustomer of crmCustomers) {
    // Find potential matches in our profiles
    const matchingProfiles = [];
    
    for (const profile of profiles) {
      const matchResult = calculateMatchConfidence(
        { 
          phone_number: profile.phone_number || '', 
          email: profile.email || '', 
          name: profile.display_name || ''
        },
        crmCustomer
      );
      
      if (matchResult.confidence > 0) {
        matchingProfiles.push({
          profile,
          confidence: matchResult.confidence,
          reasons: matchResult.reasons
        });
      }
    }
    
    // Sort by confidence (highest first)
    matchingProfiles.sort((a, b) => b.confidence - a.confidence);
    
    if (matchingProfiles.length > 0) {
      potentialMatches++;
      
      // Get the best match
      const bestMatch = matchingProfiles[0];
      const isHighConfidence = bestMatch.confidence >= MATCH_CONFIDENCE_THRESHOLD;
      
      if (isHighConfidence) {
        highConfidenceMatches++;
      }
      
      // Create or update the mapping
      const { error } = await supabase
        .from('crm_customer_mapping')
        .upsert({
          profile_id: bestMatch.profile.id,
          crm_customer_id: crmCustomer.id,
          crm_customer_data: crmCustomer,
          is_matched: isHighConfidence, // Auto-match if confidence is high enough
          match_method: isHighConfidence ? 'auto' : 'manual', // Mark as 'auto' if high confidence
          match_confidence: bestMatch.confidence,
          match_reasons: bestMatch.reasons.join(', '),
          updated_at: new Date().toISOString()
        }, {
          onConflict: 'profile_id,crm_customer_id'
        });
      
      if (error) {
        console.error(`Error updating mapping for CRM customer ${crmCustomer.id}:`, error);
      }
    }
  }
  
  return {
    totalCrmCustomers: crmCustomers.length,
    potentialMatches,
    highConfidenceMatches
  };
}

/**
 * Find the CRM customer mapped to a profile
 * @param profileId The profile ID to look up
 * @returns The mapped CRM customer data, or null if not mapped
 */
export async function getCrmCustomerForProfile(profileId: string): Promise<CrmCustomer | null> {
  const supabase = createServerClient();
  
  const { data, error } = await supabase
    .from('crm_customer_mapping')
    .select('*')
    .eq('profile_id', profileId)
    .eq('is_matched', true)
    .order('updated_at', { ascending: false })
    .limit(1)
    .single();
  
  if (error || !data) {
    return null;
  }
  
  return data.crm_customer_data as CrmCustomer;
}

/**
 * Manually set a mapping between a profile and a CRM customer
 */
export async function setManualCustomerMapping(
  profileId: string, 
  crmCustomerId: string,
  isMatched: boolean = true
): Promise<CrmCustomerMapping | null> {
  try {
    // First get the CRM customer data
    const crmSupabase = createCrmClient();
    const { data: crmCustomer, error: crmError } = await crmSupabase
      .from('customers')
      .select('*')
      .eq('id', crmCustomerId)
      .single();
    
    if (crmError || !crmCustomer) {
      console.error('Error fetching CRM customer:', crmError);
      return null;
    }
    
    // Transform to our expected format
    const transformedCustomer: CrmCustomer = {
      id: String(crmCustomer.id),
      name: String(crmCustomer.customer_name || ''),
      email: crmCustomer.email,
      phone_number: crmCustomer.contact_number,
      additional_data: {
        store: crmCustomer.store,
        address: crmCustomer.address,
        date_of_birth: crmCustomer.date_of_birth,
        date_joined: crmCustomer.date_joined,
        available_credit: crmCustomer.available_credit,
        available_point: crmCustomer.available_point,
        source: crmCustomer.source,
        sms_pdpa: crmCustomer.sms_pdpa,
        email_pdpa: crmCustomer.email_pdpa,
        batch_id: crmCustomer.batch_id,
        update_time: crmCustomer.update_time,
        created_at: crmCustomer.created_at
      }
    };
    
    // Create or update the mapping
    const supabase = createServerClient();
    const { data, error } = await supabase
      .from('crm_customer_mapping')
      .upsert({
        profile_id: profileId,
        crm_customer_id: crmCustomerId,
        crm_customer_data: transformedCustomer,
        is_matched: isMatched,
        match_method: 'manual',
        match_confidence: 1.0, // Manual matches are 100% confidence
        updated_at: new Date().toISOString()
      }, {
        onConflict: 'profile_id,crm_customer_id'
      })
      .select()
      .single();
    
    if (error) {
      console.error('Error setting manual mapping:', error);
      return null;
    }
    
    return data;
  } catch (error) {
    console.error('Error in setManualCustomerMapping:', error);
    return null;
  }
} 