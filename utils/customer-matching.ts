import { createCrmClient } from './supabase/crm';
import { createServerClient } from './supabase/server';
import { syncPackagesForProfile } from './supabase/crm-packages';
import type { Database } from '@/types/supabase';

// Types
export interface CrmCustomer {
  id: string;
  name: string;
  email?: string;
  phone_number?: string;
  stable_hash_id?: string;
  additional_data: Record<string, any>;
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
  
  // Log phone comparison in development/debug environments
  if (process.env.NODE_ENV !== 'production') {
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
export async function matchProfileWithCrm(profileId: string): Promise<MatchResult | null> {
  try {
    // Get the profile details
    const supabase = createServerClient();
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
        email: rawCustomer.email,
        phone_number: rawCustomer.contact_number,
        stable_hash_id: rawCustomer.stable_hash_id,
        additional_data: rawCustomer // Store all raw data
      };
      
      const matchResult = calculateMatchConfidence(profile, customer);
      
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

      // Create a descriptive match method based on the reasons
      let matchMethod = 'sync_script';
      if (bestMatch.reasons.length > 0) {
        // Add the primary match reason
        if (bestMatch.reasons.includes('exact_phone_match')) {
          matchMethod += '_phone';
        } else if (bestMatch.reasons.includes('exact_email_match')) {
          matchMethod += '_email';
        } else if (bestMatch.reasons.includes('exact_first_name_match') && bestMatch.reasons.includes('exact_last_name_match')) {
          matchMethod += '_full_name';
        } else if (bestMatch.reasons.includes('exact_first_name_match')) {
          matchMethod += '_first_name';
        }
      }

      await supabase
        .from('crm_customer_mapping')
        .upsert({
          profile_id: profileId,
          crm_customer_id: bestMatch.customer.id,
          crm_customer_data: bestMatch.customer,
          is_matched: true,
          match_method: matchMethod,
          match_confidence: bestMatch.confidence,
          stable_hash_id: bestMatch.customer.stable_hash_id,
          created_at: now,
          updated_at: now
        }, {
          onConflict: 'profile_id,crm_customer_id'
        });

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
      reasons: bestMatch.reasons
    };
    
  } catch (error) {
    console.error('Error matching profile with CRM:', error);
    return null;
  }
}

/**
 * Get the CRM customer mapped to a profile
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