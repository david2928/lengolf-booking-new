import { createCrmClient } from './supabase/crm';
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
    
    // Fetch CRM customers
    const crmSupabase = createCrmClient();
    const { data: customers, error: customersError } = await crmSupabase
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
 * Get the CRM customer mapped to a profile
 */
export async function getCrmCustomerForProfile(profileId: string): Promise<CrmCustomer | null> {
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
    forceRefresh?: boolean
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
    forceRefresh = false
  } = options;

  try {
    const supabase = supabaseAdminClient;
    
    console.log(`[CRM Mapping] Starting for profile ${profileId} (source: ${source})`);
    
    // STEP 1: Check for existing mapping (fast path)
    if (!forceRefresh) {
      // Modified query to handle multiple mappings - get all matches and sort by confidence
      const { data: mappings, error: mappingError } = await supabase
        .from('crm_customer_mapping')
        .select('profile_id, crm_customer_id, stable_hash_id, match_confidence, match_method, updated_at')
        .eq('profile_id', profileId)
        .eq('is_matched', true)
        .order('match_confidence', { ascending: false }) // Highest confidence first
        .order('updated_at', { ascending: false }); // Most recent first
        
      if (mappingError) {
        console.error('Error checking for existing mappings:', mappingError);
      } else if (mappings && mappings.length > 0) {
        // Use the first mapping (highest confidence, most recent)
        const bestMapping = mappings[0];
        
        console.log(`[CRM Mapping] Found existing mapping for profile ${profileId}:`, {
          crmCustomerId: bestMapping.crm_customer_id,
          stableHashId: bestMapping.stable_hash_id,
          confidence: bestMapping.match_confidence
        });
        
        // Sync packages asynchronously without awaiting to keep operations fast
        syncPackagesForProfile(profileId).catch(err => {
          console.warn('Failed to sync packages for existing mapping:', err);
        });
        
        return {
          profileId,
          crmCustomerId: bestMapping.crm_customer_id,
          stableHashId: bestMapping.stable_hash_id,
          confidence: bestMapping.match_confidence,
          isNewMatch: false
        };
      } else {
        console.log(`[CRM Mapping] No existing mapping found for profile ${profileId}`);
      }
    }
    
    // STEP 2: Attempt a match with timeout (slower path)
    const timeoutPromise = new Promise<null>((_, reject) => {
      setTimeout(() => reject(new Error(`CRM matching timed out after ${timeoutMs}ms`)), timeoutMs);
    });
    
    try {
      // Race the matching process against the timeout
      const matchResult = await Promise.race([
        matchProfileWithCrm(profileId, { source }), // Pass the source from getOrCreateCrmMapping's options
        timeoutPromise
      ]);
      
      if (matchResult?.matched) {
        console.log('Successfully matched profile with CRM', {
          profileId,
          crmCustomerId: matchResult.crmCustomerId,
          confidence: matchResult.confidence,
          reasons: matchResult.reasons
        });
        
        // Give the database a moment to complete any ongoing writes
        await new Promise(resolve => setTimeout(resolve, 300));
        
        // Retrieve the mapping data
        const { data: newMapping, error: mappingError } = await supabase
          .from('crm_customer_mapping')
          .select('stable_hash_id, crm_customer_id, match_confidence')
          .eq('profile_id', profileId)
          .maybeSingle();
          
        if (mappingError) {
          console.error('Error retrieving mapping after match:', mappingError);
        } else if (!newMapping) {
          console.warn('Mapping not found after successful match');
        } else {
          console.log('Retrieved mapping details', {
            profileId,
            crmCustomerId: newMapping.crm_customer_id,
            stableHashId: newMapping.stable_hash_id
          });
        }
        
        // Return the mapping information
        return {
          profileId,
          crmCustomerId: matchResult.crmCustomerId || '',
          stableHashId: matchResult.stableHashId || '',
          confidence: matchResult.confidence,
          isNewMatch: true
        };
      } else {
        console.log('[CRM Mapping] Profile could not be matched with CRM after attempt', {
          profileId,
          confidence: matchResult?.confidence || 0,
          reasons: matchResult?.reasons || []
        });

        // Check if ANY mapping (matched or placeholder) already exists
        const { data: existingAnyMapping } = await supabase
          .from('crm_customer_mapping')
          .select('id, is_matched') // Select enough to know if it exists and its state
          .eq('profile_id', profileId)
          .maybeSingle();
        
        if (!existingAnyMapping) {
          console.log(`[CRM Mapping] No mapping found for profile ${profileId}. Creating placeholder.`);
          const now = new Date().toISOString();
          const placeholderData = {
            profile_id: profileId,
            is_matched: false,
            crm_customer_id: null,
            stable_hash_id: null,
            crm_customer_data: {},
            match_method: `${source}_placeholder_no_match`,
            match_confidence: 0,
            created_at: now,
            updated_at: now,
          };
          const { error: placeholderError } = await supabase
            .from('crm_customer_mapping')
            .insert(placeholderData);
          if (placeholderError) {
            console.error('[CRM Mapping] Failed to create placeholder (no match path):', placeholderError);
          } else {
            console.log(`[CRM Mapping] Placeholder created for profile ${profileId} (no match path).`);
          }
        } else {
          console.log(`[CRM Mapping] Existing mapping found (is_matched: ${existingAnyMapping.is_matched}) for profile ${profileId}. Placeholder creation skipped.`);
        }
        return null; // No active match was made
      }
    } catch (error) {
      console.warn('[CRM Mapping] Error during CRM matching (Promise.race catch):', {
        error: error instanceof Error ? { message: error.message, name: error.name } : error,
        profileId,
        source
      });

      // Check if ANY mapping exists. If not, create placeholder as a fallback.
      const { data: recoveryMappingCheck } = await supabase
          .from('crm_customer_mapping')
          .select('id')
          .eq('profile_id', profileId)
          .maybeSingle();

      if (!recoveryMappingCheck) {
          console.log(`[CRM Mapping] No mapping found for profile ${profileId} after error/timeout. Creating placeholder.`);
          const now = new Date().toISOString();
          const placeholderDataOnError = {
            profile_id: profileId, is_matched: false, crm_customer_id: null, stable_hash_id: null,
            crm_customer_data: {}, match_method: `${source}_placeholder_on_error`, match_confidence: 0,
            created_at: now, updated_at: now,
          };
          await supabase.from('crm_customer_mapping').insert(placeholderDataOnError)
            .then(response => {
              if (response.error) console.error('[CRM Mapping] Placeholder creation on error/timeout failed:', response.error);
              else console.log(`[CRM Mapping] Placeholder created on error/timeout for profile ${profileId}`);
            });
      }
      return null; // No active match confirmed due to error
    }
  } catch (error) {
    console.error('Unexpected error in getOrCreateCrmMapping', {
      error: error instanceof Error 
        ? { message: error.message, stack: error.stack }
        : error
    });
    return null;
  }
} 