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

// Constants
const MATCH_CONFIDENCE_THRESHOLD = 0.6; // From sync script

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
    
    const isHighConfidence = bestMatch.confidence >= MATCH_CONFIDENCE_THRESHOLD;
    
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