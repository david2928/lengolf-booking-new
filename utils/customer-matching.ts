import { createClient } from '@supabase/supabase-js';
import { syncPackagesForProfile } from './supabase/crm-packages';
import type { Database } from '@/types/supabase';

// Create a dedicated Supabase client instance for admin operations within this module
// This client will use the Service Role Key.
const supabaseAdminClient = createClient<Database>(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!, // CRITICAL: Use the Service Role Key
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false
    }
  }
);

// Types
export interface CrmCustomer {
  id: string;
  name: string; // This will store customer_name from CRM
  email?: string;
  phone_number?: string;
  stable_hash_id?: string;
  additional_data: Record<string, any>;
  // Add customer_name as an alias for compatibility
  customer_name?: string;
}

export interface Profile {
  id: string;
  name?: string;
  email?: string;
  phone_number?: string;
  display_name?: string;
}

export interface MatchResult {
  matched: boolean;
  confidence: number;
  crmCustomerId?: string;
  stableHashId?: string;
  reasons?: string[];
}

export interface CrmCustomerMapping {
  id: string;
  profile_id: string;
  crm_customer_id: string;
  crm_customer_data: CrmCustomer;
  is_matched: boolean;
  match_method: string;
  match_confidence: number;
  created_at: string;
  updated_at: string;
  stable_hash_id?: string;
}

// NEW: Simplified profile link interface
export interface CrmProfileLink {
  id: string;
  profile_id: string;
  stable_hash_id: string;
  match_confidence: number;
  match_method?: string;
  linked_at: string;
  last_verified: string;
}

// Configuration for matching
const CONFIG = {
  confidenceThreshold: 0.6,
  maxPhoneEditDistance: 3
};

/**
 * Calculate Levenshtein distance between two strings
 * @param a - First string
 * @param b - Second string
 * @returns The edit distance between the strings
 */
function levenshteinDistance(a: string, b: string): number {
  if (!a || !b) return 0;
  
  const matrix: number[][] = [];
  
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
 * @param phone1 - First phone number
 * @param phone2 - Second phone number
 * @returns Similarity score between 0 and 1
 */
function phoneNumberSimilarity(phone1: string, phone2: string): number {
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
  
  // Only log phone comparisons in debug mode and when there's an actual match
  if (process.env.DEBUG_PHONE_COMPARISON === 'true' && similarity > 0) {
    console.log(`Phone comparison: '${phone1}' vs '${phone2}' - distance: ${distance}, similarity: ${similarity.toFixed(2)}`);
  }
  
  return similarity;
}

/**
 * Extract first and last name from display name
 */
function extractNameParts(displayName?: string) {
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
 * Normalize phone number for comparison
 */
function normalizePhoneNumber(phone?: string): string {
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
  
  return normalized;
}

/**
 * Normalize text for comparison
 */
function normalizeText(text?: string): string {
  if (!text) return '';
  return String(text).toLowerCase().trim();
}

/**
 * Calculate match confidence between a profile and a CRM customer
 * Direct port of the matching logic from sync-customer-matching.js
 */
function calculateMatchConfidence(profile: Profile, customer: CrmCustomer): { confidence: number; reasons: string[] } {
  let score = 0;
  const reasons: string[] = [];
  
  // Extract name parts
  const profileNameParts = extractNameParts(profile.display_name || profile.name);
  const customerNameParts = extractNameParts(customer.name);
  
  // Normalize the profile data for comparison
  const normalizedProfilePhone = normalizePhoneNumber(profile.phone_number);
  const normalizedProfileFirstName = normalizeText(profileNameParts.first);
  const normalizedProfileLastName = normalizeText(profileNameParts.last);
  const normalizedProfileEmail = normalizeText(profile.email);
  
  // Normalize the customer data for comparison
  const normalizedCustomerPhone = normalizePhoneNumber(customer.phone_number);
  const normalizedCustomerFirstName = normalizeText(customerNameParts.first);
  const normalizedCustomerLastName = normalizeText(customerNameParts.last);
  const normalizedCustomerEmail = normalizeText(customer.email);
  
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
      score += 0.5;
      reasons.push('exact_first_name_match');
    } else if (normalizedProfileFirstName.includes(normalizedCustomerFirstName) || 
              normalizedCustomerFirstName.includes(normalizedProfileFirstName)) {
      score += 0.2;
      reasons.push('partial_first_name_match');
    }
  }
  
  if (normalizedProfileLastName && normalizedCustomerLastName) {
    if (normalizedProfileLastName === normalizedCustomerLastName) {
      score += 0.5;
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
  
  return { confidence: score, reasons };
}

/**
 * Match a profile with CRM customers
 * This is the main function that should be called when a user logs in or makes a booking
 * Uses the exact same logic as the sync script
 */
export async function matchProfileWithCrm(
  profileId: string,
  options?: { phoneNumberToMatch?: string; source?: string }
): Promise<MatchResult | null> {
  const phoneNumberToMatch = options?.phoneNumberToMatch;
  const source = options?.source || 'sync_script'; // Default source if not provided

  try {
    // Get the profile details
    const supabase = supabaseAdminClient;
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('id, display_name, phone_number, email')
      .eq('id', profileId)
      .single();

    if (profileError || !profile) {
      console.error('Error fetching profile for matching:', profileError);
      return null;
    }

    // Construct the profile object to be used for matching
    // Use the provided phoneNumberToMatch if available, otherwise use the profile's phone number
    const profileForMatching: Profile = {
      id: profile.id,
      name: profile.display_name,  // Use display_name as name
      email: profile.email,
      display_name: profile.display_name,
      phone_number: phoneNumberToMatch || profile.phone_number, // Key change here
    };

    // Skip if no data for matching (considering profileForMatching)
    if (!profileForMatching.phone_number && !profileForMatching.email && !profileForMatching.name && !profileForMatching.display_name) {
      console.log(`Profile ${profileId} (using phone: ${profileForMatching.phone_number || 'N/A'}) has no data for matching for source: ${source}`);
      return null;
    }
    
    // Fetch CRM customers from backoffice schema
    const { data: customers, error: customersError } = await supabaseAdminClient
      .schema('backoffice' as any)
      .from('customers')
      .select('*');
    
    if (customersError) {
      console.error('Error fetching CRM customers:', customersError);
      return null;
    }
    
    // Find potential matches
    let bestMatch: { customer: CrmCustomer; confidence: number; reasons: string[] } | null = null;
    
    for (const rawCustomer of customers) {
      // Transform raw customer data to our CrmCustomer type
      const customer: CrmCustomer = {
        id: String(rawCustomer.id),
        name: String(rawCustomer.customer_name || ''),
        customer_name: String(rawCustomer.customer_name || ''), // Add this for compatibility
        email: rawCustomer.email,
        phone_number: rawCustomer.contact_number,
        stable_hash_id: rawCustomer.stable_hash_id,
        additional_data: rawCustomer // Store all raw data
      };
      
      const matchResult = calculateMatchConfidence(profileForMatching, customer);
      
      if (!bestMatch || matchResult.confidence > bestMatch.confidence) {
        bestMatch = {
          customer,
          ...matchResult
        };
      }
    }
    
    if (!bestMatch) {
      return {
        matched: false,
        confidence: 0
      };
    }
    
    // Apply match boosting for high-quality but borderline matches
    const originalConfidence = bestMatch.confidence;
    let isHighConfidence = originalConfidence >= CONFIG.confidenceThreshold;

    // If we have a phone match that's close to threshold, boost it 
    if (!isHighConfidence && 
        bestMatch.confidence >= CONFIG.confidenceThreshold - 0.1 && 
        (bestMatch.reasons.includes('exact_phone_match') || 
         bestMatch.reasons.includes('very_similar_phone_match'))) {
      
      // Boost the confidence score to meet the threshold
      bestMatch.confidence = CONFIG.confidenceThreshold;
      bestMatch.reasons.push('boosted_phone_match');
      
      console.log(`Boosted match confidence from ${originalConfidence.toFixed(2)} to ${bestMatch.confidence.toFixed(2)} based on phone match`);
      
      // Now this match will be considered high confidence
      isHighConfidence = true;
    }
    
    // Store the mapping if confidence is high enough
    if (isHighConfidence) {
      const now = new Date().toISOString();

      // Create a descriptive match method based on the source and reasons
      let matchMethod = source; // Start with the provided source
      if (bestMatch.reasons.includes('exact_phone_match')) {
        matchMethod += '_phone';
      } else if (bestMatch.reasons.includes('exact_email_match')) {
        matchMethod += '_email';
      } else if (bestMatch.reasons.includes('exact_first_name_match') && bestMatch.reasons.includes('exact_last_name_match')) {
        matchMethod += '_full_name';
      } else if (bestMatch.reasons.includes('exact_first_name_match')) {
        matchMethod += '_first_name';
      } else if (bestMatch.reasons.length > 0) { // Fallback for other reasons
        matchMethod += '_' + bestMatch.reasons[0];
      }
      
      try {
        // Prepare the mapping data
        const mappingData = {
          profile_id: profileId,
          crm_customer_id: bestMatch.customer.id,
          crm_customer_data: {
            ...bestMatch.customer,
            // Ensure both name and customer_name are set for compatibility
            name: bestMatch.customer.name || bestMatch.customer.customer_name,
            customer_name: bestMatch.customer.customer_name || bestMatch.customer.name
          },
          is_matched: true,
          match_method: matchMethod,
          match_confidence: bestMatch.confidence,
          stable_hash_id: bestMatch.customer.stable_hash_id,
          created_at: now,
          updated_at: now
        };
        
        console.log(`Saving CRM mapping for profile ${profileId}:`, JSON.stringify(mappingData, null, 2));
        
        // Now use PostgreSQL's efficient upsert functionality
        const { data: upsertResult, error: upsertError } = await supabase
          .from('crm_customer_mapping')
          .upsert(mappingData, {
            onConflict: 'profile_id' // Using the new unique constraint
          });
          
        if (upsertError) {
          console.error('Failed to save CRM mapping to database:', upsertError);
          throw upsertError;
        } else {
          console.log(`Successfully saved CRM mapping for profile ${profileId} to customer ${bestMatch.customer.id}`);
        }
        
        // Quick verify the mapping exists now (optional, can be removed for production)
        const { data: verifyMapping, error: verifyError } = await supabase
          .from('crm_customer_mapping')
          .select('id, crm_customer_id')
          .eq('profile_id', profileId)
          .maybeSingle();
          
        if (verifyError || !verifyMapping) {
          console.warn('Verification check for mapping failed, but upsert reported success');
        } else {
          console.log(`Verified mapping saved successfully: ${verifyMapping.id}`);
        }
      } catch (error) {
        console.error('Error managing CRM mappings:', error);
        // Re-throw the error so it's not silently caught
        throw error;
      }

      // After successful matching, sync packages
      await syncPackagesForProfile(profileId).catch(err => {
        // Log but don't fail the matching process
        console.error('Error syncing packages after match:', err);
      });
    }
    
    return {
      matched: isHighConfidence,
      confidence: bestMatch.confidence,
      crmCustomerId: bestMatch.customer.id,
      stableHashId: isHighConfidence ? bestMatch.customer.stable_hash_id : undefined,
      reasons: bestMatch.reasons
    };
    
  } catch (error) {
    console.error('Error matching profile with CRM:', error);
    return null;
  }
}

/**
 * Normalize CRM customer data to ensure both name and customer_name are set
 * This helps maintain compatibility between different data formats
 */
export function normalizeCrmCustomerData(customerData: any): CrmCustomer | null {
  if (!customerData) return null;
  
  // Create a normalized copy
  const normalized: CrmCustomer = {
    ...customerData,
    id: String(customerData.id || ''),
    additional_data: customerData.additional_data || customerData
  };
  
  // Ensure both name and customer_name are set
  normalized.name = customerData.name || customerData.customer_name || '';
  normalized.customer_name = customerData.customer_name || customerData.name || '';
  
  return normalized;
}

/**
 * @deprecated Use getRealTimeCustomerForProfile() instead for better performance and real-time data
 * Get the CRM customer mapped to a profile
 */
export async function getCrmCustomerForProfile(profileId: string): Promise<CrmCustomer | null> {
  console.warn('DEPRECATED: getCrmCustomerForProfile() is deprecated. Use getRealTimeCustomerForProfile() for real-time data access.');
  const supabase = supabaseAdminClient;
  
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
  
  // Normalize the data before returning
  return normalizeCrmCustomerData(data.crm_customer_data);
}

/**
 * NEW: Get real-time customer data for a profile using simplified architecture
 * This replaces getCrmCustomerForProfile with real-time data access
 */
export async function getRealTimeCustomerForProfile(profileId: string): Promise<CrmCustomer | null> {
  try {
    const supabase = supabaseAdminClient;
    
    // Query the simplified function that joins links with real-time customer data
    const { data, error } = await supabase.rpc('get_customer_for_profile', {
      p_profile_id: profileId
    });
    
    if (error) {
      console.error('Error fetching real-time customer for profile:', error);
      return null;
    }
    
    if (!data || data.length === 0) {
      return null;
    }
    
    const customerData = data[0];
    
    // Convert to our CrmCustomer interface format
    return {
      id: customerData.customer_id,
      name: customerData.customer_name || '',
      customer_name: customerData.customer_name || '',
      email: customerData.email || '',
      phone_number: customerData.phone_number || '',
      stable_hash_id: customerData.stable_hash_id || '',
      additional_data: customerData.raw_data || {}
    };
  } catch (error) {
    console.error('Error in getRealTimeCustomerForProfile:', error);
    return null;
  }
}

/**
 * NEW: Get profile link status using simplified architecture
 */
export async function getProfileCustomerLink(profileId: string): Promise<CrmProfileLink | null> {
  try {
    const supabase = supabaseAdminClient;
    
    const { data, error } = await supabase.rpc('get_profile_customer_link', {
      p_profile_id: profileId
    });
    
    if (error) {
      console.error('Error fetching profile customer link:', error);
      return null;
    }
    
    if (!data || data.length === 0) {
      return null;
    }
    
    const linkData = data[0];
    
    return {
      id: '', // Not returned by function, but required by interface
      profile_id: linkData.profile_id,
      stable_hash_id: linkData.stable_hash_id,
      match_confidence: linkData.match_confidence,
      match_method: linkData.match_method || '',
      linked_at: linkData.linked_at,
      last_verified: linkData.last_verified
    };
  } catch (error) {
    console.error('Error in getProfileCustomerLink:', error);
    return null;
  }
}

/**
 * NEW: Create or update a simplified profile link
 */
export async function createProfileLink(
  profileId: string, 
  stableHashId: string, 
  confidence: number, 
  method: string
): Promise<boolean> {
  try {
    const supabase = supabaseAdminClient;
    
    const linkData = {
      profile_id: profileId,
      stable_hash_id: stableHashId,
      match_confidence: confidence,
      match_method: method,
      linked_at: new Date().toISOString(),
      last_verified: new Date().toISOString()
    };
    
    // Use upsert to handle both create and update cases
    const { error } = await supabase
      .from('crm_profile_links')
      .upsert(linkData, {
        onConflict: 'profile_id',
        ignoreDuplicates: false
      });
    
    if (error) {
      console.error('Error creating/updating profile link:', error);
      return false;
    }
    
    console.log('Successfully created/updated profile link:', {
      profileId,
      stableHashId,
      confidence,
      method
    });
    
    return true;
  } catch (error) {
    console.error('Error in createProfileLink:', error);
    return false;
  }
}

/**
 * NEW: Enhanced getOrCreateCrmMapping using simplified architecture
 * This version is optimized for performance and uses real-time data
 */
export async function getOrCreateCrmMappingV2(
  profileId: string,
  options: {
    source?: string,
    timeoutMs?: number,
    forceRefresh?: boolean,
    phoneNumberToMatch?: string
  } = {}
): Promise<{
  profileId: string,
  crmCustomerId: string,
  stableHashId: string,
  confidence: number,
  isNewMatch: boolean
} | null> {
  const {
    source = 'unknown',
    timeoutMs = 5000,
    forceRefresh = false,
    phoneNumberToMatch
  } = options;

  try {
    console.log(`[CRM Mapping V2] Starting for profile ${profileId} (source: ${source}${phoneNumberToMatch ? `, booking phone: ${phoneNumberToMatch}` : ''})`);
    
    // STEP 1: Check for existing link (fast path)
    if (!forceRefresh) {
      const existingLink = await getProfileCustomerLink(profileId);
      
      if (existingLink) {
        console.log(`[CRM Mapping V2] Found existing link for profile ${profileId}:`, {
          stableHashId: existingLink.stable_hash_id,
          confidence: existingLink.match_confidence
        });
        
        // Get real-time customer data
        const customerData = await getRealTimeCustomerForProfile(profileId);
        
        if (customerData) {
          return {
            profileId,
            crmCustomerId: customerData.id,
            stableHashId: existingLink.stable_hash_id,
            confidence: existingLink.match_confidence,
            isNewMatch: false
          };
        }
      } else {
        console.log(`[CRM Mapping V2] No existing link found for profile ${profileId}`);
      }
    }
    
    // STEP 2: Attempt matching with timeout (slower path)
    const timeoutPromise = new Promise<null>((_, reject) => {
      setTimeout(() => reject(new Error(`CRM matching timed out after ${timeoutMs}ms`)), timeoutMs);
    });
    
    try {
      const matchResult = await Promise.race([
        matchProfileWithCrmV2(profileId, { 
          source, 
          phoneNumberToMatch 
        }),
        timeoutPromise
      ]);
      
      if (matchResult?.matched) {
        console.log('Successfully matched profile with CRM (V2)', {
          profileId,
          crmCustomerId: matchResult.crmCustomerId,
          confidence: matchResult.confidence,
          reasons: matchResult.reasons
        });
        
        // Create the simplified link
        const linkCreated = await createProfileLink(
          profileId,
          matchResult.stableHashId || '',
          matchResult.confidence,
          `${source}_v2_match`
        );
        
        if (linkCreated) {
          return {
            profileId,
            crmCustomerId: matchResult.crmCustomerId || '',
            stableHashId: matchResult.stableHashId || '',
            confidence: matchResult.confidence,
            isNewMatch: true
          };
        }
      } else {
        console.log('[CRM Mapping V2] Profile could not be matched with CRM', {
          profileId,
          confidence: matchResult?.confidence || 0,
          reasons: matchResult?.reasons || []
        });
        
        return null; // No active match was made
      }
    } catch (error) {
      if (error instanceof Error && error.message.includes('timed out')) {
        console.warn(`[CRM Mapping V2] Matching timed out for profile ${profileId} after ${timeoutMs}ms`);
      } else {
        console.error(`[CRM Mapping V2] Error during matching for profile ${profileId}:`, error);
      }
      return null;
    }
    
  } catch (error) {
    console.error(`[CRM Mapping V2] Unexpected error for profile ${profileId}:`, error);
    return null;
  }
  
  return null;
}

/**
 * NEW: Simplified matching function that uses direct backoffice queries
 */
export async function matchProfileWithCrmV2(
  profileId: string,
  options?: { phoneNumberToMatch?: string; source?: string }
): Promise<MatchResult | null> {
  try {
    console.log(`[CRM Matching V2] Starting match for profile ${profileId}`);
    
    const supabase = supabaseAdminClient;
    
    // Get profile data
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('id, display_name, email, phone_number')
      .eq('id', profileId)
      .single();
    
    if (profileError || !profile) {
      console.error('Profile not found:', profileError);
      return null;
    }
    
    // Prepare phone numbers for matching
    const phoneToMatch = options?.phoneNumberToMatch || profile.phone_number;
    const normalizedPhone = normalizePhoneNumber(phoneToMatch);
    
    if (!normalizedPhone || normalizedPhone.length < 8) {
      console.log('No valid phone number available for matching');
      return null;
    }
    
    console.log(`[CRM Matching V2] Searching customers with phone: ${normalizedPhone}`);
    
    // Query customers directly from backoffice using phone matching  
    const { data: customers, error: customersError } = await (supabase as any)
      .schema('backoffice')
      .from('customers')
      .select('id, customer_name, email, contact_number, stable_hash_id')
      .ilike('contact_number', `%${normalizedPhone}%`);
    
    if (customersError) {
      console.error('Error querying customers:', customersError);
      return null;
    }
    
    if (!customers || customers.length === 0) {
      console.log('No customers found with matching phone number');
      return null;
    }
    
    console.log(`[CRM Matching V2] Found ${customers.length} potential customer matches`);
    
    // Find the best match
    let bestMatch: any = null;
    let bestConfidence = 0;
    let bestReasons: string[] = [];
    
    for (const customer of customers) {
      const { confidence, reasons } = calculateMatchConfidence({
        id: profile.id,
        display_name: profile.display_name,
        email: profile.email,
        phone_number: phoneToMatch
      }, {
        id: customer.id,
        name: customer.customer_name || '',
        customer_name: customer.customer_name || '',
        email: customer.email || '',
        phone_number: customer.contact_number || '',
        stable_hash_id: customer.stable_hash_id || '',
        additional_data: {}
      });
      
      if (confidence > bestConfidence) {
        bestMatch = customer;
        bestConfidence = confidence;
        bestReasons = reasons;
      }
    }
    
    if (bestMatch && bestConfidence >= CONFIG.confidenceThreshold) {
      console.log(`[CRM Matching V2] Best match found:`, {
        customerId: bestMatch.id,
        customerName: bestMatch.customer_name,
        confidence: bestConfidence,
        reasons: bestReasons
      });
      
      return {
        matched: true,
        confidence: bestConfidence,
        crmCustomerId: bestMatch.id,
        stableHashId: bestMatch.stable_hash_id,
        reasons: bestReasons
      };
    } else {
      console.log(`[CRM Matching V2] No high-confidence match found. Best confidence: ${bestConfidence}`);
      return {
        matched: false,
        confidence: bestConfidence,
        reasons: bestReasons || ['No high-confidence match found']
      };
    }
    
  } catch (error) {
    console.error('Error in matchProfileWithCrmV2:', error);
    return null;
  }
}

/**
 * @deprecated Use getOrCreateCrmMappingV2() instead for better performance and simplified architecture
 * Efficiently retrieve or create a CRM mapping for a profile.
 * First checks for existing mapping, then attempts matching only if needed.
 * This approach is optimized for performance in user-facing operations.
 * 
 * @param profileId The profile ID to find or create mapping for
 * @param options Configuration options
 * @returns CRM mapping data or null if unavailable
 */
export async function getOrCreateCrmMapping(
  profileId: string,
  options: {
    source?: string,
    timeoutMs?: number,
    forceRefresh?: boolean,
    phoneNumberToMatch?: string
  } = {}
): Promise<{
  profileId: string,
  crmCustomerId: string,
  stableHashId: string,
  confidence: number,
  isNewMatch: boolean
} | null> {
  console.warn('DEPRECATED: getOrCreateCrmMapping() is deprecated. Use getOrCreateCrmMappingV2() for simplified architecture and better performance.');
  
  // For now, delegate to the V2 function for consistency
  return getOrCreateCrmMappingV2(profileId, options);
} 