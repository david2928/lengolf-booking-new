"use strict";
/**
 * Customer Service - Unified customer management using public.customers
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.findOrCreateCustomer = findOrCreateCustomer;
exports.getPackageInfoForCustomer = getPackageInfoForCustomer;
const admin_1 = require("@/utils/supabase/admin");
const supabase = (0, admin_1.createAdminClient)();
// === PUBLIC API ===
/**
 * Find or create customer and link to profile
 * Main function used by the booking API
 */
async function findOrCreateCustomer(profileId, name, phone, email) {
    try {
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
        let customerResult;
        if (existingCustomers && existingCustomers.length > 0) {
            // Found existing customer
            const customer = existingCustomers[0];
            console.log(`[Customer Service] Found existing customer: ${customer.customer_code}`);
            customerResult = {
                customer,
                is_new_customer: false,
                match_method: 'phone_exact_match',
                confidence: 1.0
            };
        }
        else {
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
        }
        else {
            console.log(`[Customer Service] Linked profile to customer ${customerResult.customer.customer_code}`);
        }
        return customerResult;
    }
    catch (error) {
        console.error('Error in findOrCreateCustomer:', error);
        throw error;
    }
}
/**
 * Get package info for customer
 * TODO: Implement direct customer-based package lookup
 */
async function getPackageInfoForCustomer(customerId) {
    console.log(`[Customer Service] Package lookup not yet implemented for customer: ${customerId}`);
    return 'Normal Bay Rate';
}
