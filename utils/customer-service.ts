/**
 * Customer Service - Unified customer management using public.customers
 */

import { createAdminClient } from '@/utils/supabase/admin';

// === PUBLIC INTERFACES ===

export interface Customer {
  id: string;
  customer_code: string;
  customer_name: string;
  normalized_phone: string | null;
  email: string | null;
  contact_number: string | null;
  total_visits: number;
  total_lifetime_value: number;
}

export interface CustomerResult {
  customer: Customer;
  is_new_customer: boolean;
  match_method: string;
  confidence: number;
}

// === PUBLIC API ===

/**
 * Find or create customer and link to profile
 * Main function used by the booking API
 */
export async function findOrCreateCustomer(
  profileId: string,
  name: string,
  phone: string,
  email?: string
): Promise<CustomerResult> {
  try {
    const supabase = createAdminClient();
    console.log(`[Customer Service] Starting for profile ${profileId}: ${name}, ${phone}`);
    
    // Step 1: Normalize phone
    const { data: normalizedPhone, error: normalizeError } = await supabase
      .rpc('normalize_phone_number', { phone_input: phone });
    
    if (normalizeError || !normalizedPhone) {
      throw new Error(`Phone normalization failed: ${normalizeError?.message}`);
    }
    
    console.log(`[Customer Service] Normalized phone: ${phone} → ${normalizedPhone}`);
    
    // Step 2: Try exact match
    const { data: existingCustomers } = await supabase
      .from('customers')
      .select('*')
      .eq('normalized_phone', normalizedPhone)
      .eq('is_active', true)
      .limit(1);
    
    let customerResult: CustomerResult;
    
    if (existingCustomers && existingCustomers.length > 0) {
      // Found existing customer
      const customer = existingCustomers[0] as Customer;
      console.log(`[Customer Service] Found existing customer: ${customer.customer_code}`);
      
      customerResult = {
        customer,
        is_new_customer: false,
        match_method: 'phone_exact_match',
        confidence: 1.0
      };
    } else {
      // Create new customer
      console.log(`[Customer Service] Creating new customer: ${name}, ${phone}`);
      
      const { data: newCustomer, error } = await supabase
        .rpc('create_customer_with_code', {
          p_customer_name: name,
          p_contact_number: phone,
          p_email: email || null,
          p_date_of_birth: null,
          p_address: null,
          p_notes: null,
          p_preferred_contact_method: null,
          p_customer_profiles: null
        });
      
      if (error || !newCustomer) {
        throw new Error(`Customer creation failed: ${error?.message}`);
      }
      
      console.log(`[Customer Service] Created new customer: ${newCustomer.customer_code}`);
      
      customerResult = {
        customer: {
          id: newCustomer.id,
          customer_code: newCustomer.customer_code,
          customer_name: newCustomer.customer_name,
          normalized_phone: newCustomer.normalized_phone,
          email: newCustomer.email,
          contact_number: newCustomer.contact_number,
          total_visits: 0,
          total_lifetime_value: 0
        },
        is_new_customer: true,
        match_method: 'new_customer_created',
        confidence: 1.0
      };
    }
    
    // Step 3: Link profile to customer
    const { error: linkError } = await supabase
      .from('profiles')
      .update({ customer_id: customerResult.customer.id })
      .eq('id', profileId);
    
    if (linkError) {
      console.error('Profile linking failed:', linkError);
      // Don't fail the whole process - customer was still found/created
    } else {
      console.log(`[Customer Service] Linked profile to customer ${customerResult.customer.customer_code}`);
    }
    
    return customerResult;
    
  } catch (error) {
    console.error('Error in findOrCreateCustomer:', error);
    throw error;
  }
}

/**
 * Get package info for customer using the customer_active_packages view
 * Much simpler lookup with pre-calculated remaining hours and status
 */
export async function getPackageInfoForCustomer(customerId: string): Promise<{packageInfo: string, packageId?: string, packageTypeName?: string}> {
  try {
    const supabase = createAdminClient();
    console.log(`[Customer Service] Looking up packages for customer: ${customerId}`);
    
    // Query the customer_active_packages view via RPC function
    const { data: packages, error: packageError } = await supabase
      .rpc('get_customer_packages', { customer_id_param: customerId });
    
    if (packageError) {
      console.error(`[Customer Service] Error looking up packages:`, packageError);
      return { packageInfo: 'Normal Bay Rate' };
    }
    
    if (!packages || packages.length === 0) {
      console.log(`[Customer Service] No active packages found for customer ${customerId}`);
      return { packageInfo: 'Normal Bay Rate' };
    }
    
    // Use the first active package
    const activePackage = packages[0];
    
    let packageInfo: string;
    if (activePackage.package_status === 'unlimited') {
      packageInfo = `${activePackage.display_name} (Unlimited)`;
      console.log(`[Customer Service] Found unlimited package: ${packageInfo}`);
    } else {
      const remainingHours = activePackage.remaining_hours || 0;
      packageInfo = `${activePackage.display_name} (${remainingHours}h remaining)`;
      console.log(`[Customer Service] Found active package: ${packageInfo} (${activePackage.used_hours}h used of ${activePackage.total_hours}h total)`);
    }
    
    return { 
      packageInfo, 
      packageId: activePackage.package_id,
      packageTypeName: activePackage.package_type_name // The full name like "Silver (15H)"
    };
    
  } catch (error) {
    console.error('Error in getPackageInfoForCustomer:', error);
    return { packageInfo: 'Normal Bay Rate' };
  }
}