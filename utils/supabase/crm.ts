import { createClient, SupabaseClient } from '@supabase/supabase-js';

// Define a better type for the client
let crmSupabaseClient: SupabaseClient | null = null;

/**
 * Create a client connection to the CRM Supabase instance
 */
export function createCrmClient(): SupabaseClient {
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
 * Interface representing a customer in the CRM system
 */
export interface CrmCustomer {
  id: string;
  name: string;
  email?: string;
  phone_number?: string;
  additional_data: Record<string, any>;
}

/**
 * Fetch customers from the CRM database
 * @param lastSyncTimestamp Optional timestamp to fetch only customers updated since then
 * @returns Array of CRM customers
 */
export async function fetchCrmCustomers(lastSyncTimestamp?: string): Promise<CrmCustomer[]> {
  const supabase = createCrmClient();
  
  // Using the actual table structure provided by the user
  let query = supabase.from('customers').select('*');
  
  if (lastSyncTimestamp) {
    query = query.gt('update_time', lastSyncTimestamp);
  }
  
  const { data, error } = await query;
  
  if (error) {
    console.error('Error fetching CRM customers:', error);
    throw error;
  }
  
  // Transform and validate the data to ensure it matches our expected format
  if (!data) return [];
  
  // Map the raw data to our CrmCustomer type based on the actual table structure
  return data.map((item: any) => ({
    id: String(item.id),
    name: String(item.customer_name || ''),
    email: item.email ? String(item.email) : undefined,
    phone_number: item.contact_number ? String(item.contact_number) : undefined,
    // Include all additional fields from the CRM structure
    additional_data: {
      store: item.store,
      address: item.address,
      date_of_birth: item.date_of_birth,
      date_joined: item.date_joined,
      available_credit: item.available_credit,
      available_point: item.available_point,
      source: item.source,
      sms_pdpa: item.sms_pdpa,
      email_pdpa: item.email_pdpa,
      batch_id: item.batch_id,
      update_time: item.update_time,
      created_at: item.created_at
    }
  }));
}

/**
 * Normalize a phone number for comparison
 * Removes country codes, spaces, and special characters
 * @param phone Phone number to normalize
 * @returns Normalized phone number
 */
export function normalizePhoneNumber(phone?: string): string {
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
  if (normalized.startsWith('0')) {
    // Remove the leading trunk zero for standardization
    normalized = normalized.substring(1);
  }
  
  return normalized;
}

/**
 * Checks if two phone numbers match after normalization
 * @param phone1 First phone number
 * @param phone2 Second phone number
 * @returns True if the phone numbers match
 */
export function phoneNumbersMatch(phone1: string, phone2: string): boolean {
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
 * @param name Name to normalize
 * @returns Normalized name
 */
export function normalizeName(name?: string): string {
  if (!name) return '';
  
  // Convert to lowercase
  let normalized = name.toLowerCase();
  
  // Transliterate common international characters to basic Latin
  const transliterations: Record<string, string> = {
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
 * Check if names match by comparing individual parts
 * This handles cases where names have different ordering or additional/missing parts
 * @param name1 First name
 * @param name2 Second name
 * @returns Object with match result and score
 */
export function namePartsMatch(name1: string, name2: string): { match: boolean; score: number; exactMatch: boolean } {
  if (!name1 || !name2) return { match: false, score: 0, exactMatch: false };
  
  // Split names into parts
  const parts1 = name1.split(/\s+/).filter(part => part.length > 1);
  const parts2 = name2.split(/\s+/).filter(part => part.length > 1);
  
  if (parts1.length === 0 || parts2.length === 0) {
    return { match: false, score: 0, exactMatch: false };
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
 * @param profile The profile from the booking system
 * @param crmCustomer The customer from the CRM system
 * @returns Confidence score between 0 and 1 and match reasons
 */
export function calculateMatchConfidence(
  profile: { phone_number?: string; email?: string; name?: string },
  crmCustomer: { phone_number?: string; email?: string; name?: string }
): { confidence: number; reasons: string[] } {
  // Set weights for different match types
  const PHONE_MATCH_WEIGHT = 0.8;
  const EMAIL_MATCH_WEIGHT = 0.3;
  const NAME_MATCH_WEIGHT = 0.1;
  const MATCH_CONFIDENCE_THRESHOLD = 0.75;
  
  let maxScore = PHONE_MATCH_WEIGHT + EMAIL_MATCH_WEIGHT + NAME_MATCH_WEIGHT;
  let score = 0;
  let reasons: string[] = [];

  // Normalize phone numbers for comparison
  const normalizedProfilePhone = normalizePhoneNumber(profile.phone_number);
  const normalizedCrmPhone = normalizePhoneNumber(crmCustomer.phone_number);
  
  // Check for phone match (strongest signal)
  if (normalizedProfilePhone && normalizedCrmPhone && 
      phoneNumbersMatch(normalizedProfilePhone, normalizedCrmPhone)) {
    score += PHONE_MATCH_WEIGHT;
    reasons.push('PHONE');
  }

  // Check for email match
  if (profile.email && crmCustomer.email) {
    // Normalize emails for comparison
    const normalizedProfileEmail = profile.email.toLowerCase().trim();
    const normalizedCrmEmail = crmCustomer.email.toLowerCase().trim();
    
    if (normalizedProfileEmail === normalizedCrmEmail) {
      score += EMAIL_MATCH_WEIGHT;
      reasons.push('EMAIL');
    }
  }

  // Check for name match with improved normalization
  const profileName = normalizeName(profile.name);
  const crmName = normalizeName(crmCustomer.name);

  if (profileName && crmName) {
    if (profileName === crmName) {
      score += NAME_MATCH_WEIGHT;
      reasons.push('DISPLAY_NAME_EXACT');
    } else {
      // Enhanced name matching using parts comparison
      const nameParts = namePartsMatch(profileName, crmName);
      
      if (nameParts.exactMatch) {
        score += NAME_MATCH_WEIGHT;
        reasons.push('DISPLAY_NAME_PARTS_EXACT');
      } else if (nameParts.match) {
        // Apply a score based on how many parts match
        const partScore = NAME_MATCH_WEIGHT * nameParts.score;
        score += partScore;
        reasons.push('DISPLAY_NAME_PARTS_PARTIAL');
      } else if (
        (crmName.includes(profileName) || profileName.includes(crmName)) && 
        profileName.length > 2 && crmName.length > 2
      ) {
        // Fallback to simple substring matching
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