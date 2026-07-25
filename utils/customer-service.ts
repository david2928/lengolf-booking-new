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
      
      const { data: newCustomerArray, error } = await supabase
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
      
      if (error || !newCustomerArray || newCustomerArray.length === 0) {
        throw new Error(`Customer creation failed: ${error?.message || 'No customer data returned'}`);
      }
      
      const newCustomer = newCustomerArray[0];
      
      console.log(`[Customer Service] Created new customer: ${newCustomer.customer_code}`);
      
      customerResult = {
        customer: {
          id: newCustomer.id,
          customer_code: newCustomer.customer_code,
          customer_name: newCustomer.customer_name,
          normalized_phone: normalizedPhone, // Use the normalized phone we calculated earlier
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
 * Everything the `get_customer_packages` RPC already tells us about the one
 * package that applies to a booking — a superset of what
 * `getPackageInfoForCustomer` returns.
 *
 * The balance fields exist so the booking flow can DISCLOSE the customer's
 * remaining hours before they submit. They are not authoritative for pricing:
 * `lib/cost-calculator.ts` decides what is charged, and it keys off the
 * `hasActivePackage` boolean only.
 */
export interface ActivePackageDetails {
  /** Human-readable summary. `'Normal Bay Rate'` when no package applies. */
  packageInfo: string;
  packageId?: string;
  /** Full CRM type name, e.g. `"Silver (15H)"`. */
  packageTypeName?: string;
  /** Short CRM display name, e.g. `"Silver"`. */
  displayName?: string;
  /** Hours left. `null` for unlimited packages (and when none applies). */
  remainingHours: number | null;
  /** Hours the package was sold with. `null` for unlimited / none. */
  totalHours: number | null;
  /** Hours already consumed. `null` for unlimited / none. */
  usedHours: number | null;
  /** `yyyy-MM-dd`, or `null` when the package never expires / none applies. */
  expiryDate: string | null;
  isUnlimited: boolean;
}

/**
 * No-package result — keeps the `'Normal Bay Rate'` contract in one place.
 * A factory, not a shared constant: returning one module-level object by
 * reference to every caller means a single mutation anywhere poisons every
 * later lookup in the process.
 */
function noPackage(): ActivePackageDetails {
  return {
    packageInfo: 'Normal Bay Rate',
    remainingHours: null,
    totalHours: null,
    usedHours: null,
    expiryDate: null,
    isUnlimited: false,
  };
}

/**
 * Postgres `numeric` can arrive as a JSON number or a string depending on
 * driver/serialisation. Anything unparseable becomes `null` rather than 0 — a
 * spurious 0 would render "0 h left" and trigger a bogus overage warning.
 */
function toNumberOrNull(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

/**
 * Get package info for customer using the customer_active_packages view
 * Much simpler lookup with pre-calculated remaining hours and status
 *
 * Thin projection of {@link getActivePackageDetailsForCustomer} — kept at its
 * original three-field shape so existing callers (notably
 * `app/api/bookings/create/route.ts`, which is on the booking-creation path)
 * are untouched.
 */
export async function getPackageInfoForCustomer(
  customerId: string,
  options?: { excludeCategories?: string[] }
): Promise<{packageInfo: string, packageId?: string, packageTypeName?: string}> {
  const details = await getActivePackageDetailsForCustomer(customerId, options);
  return {
    packageInfo: details.packageInfo,
    packageId: details.packageId,
    packageTypeName: details.packageTypeName,
  };
}

/**
 * Same single RPC call and the same package selection as
 * {@link getPackageInfoForCustomer}, but also returns the balance and expiry
 * fields the RPC was already fetching and throwing away.
 *
 * Selection is deliberately identical to the legacy path (status
 * `active`/`unlimited`, minus excluded categories, first match). The booking
 * flow gates the 4 h and 5 h duration rungs on this same result, so the name
 * and the hours must always describe ONE package — a divergent filter here
 * would show "Gold" alongside some other package's balance.
 */
export async function getActivePackageDetailsForCustomer(
  customerId: string,
  options?: { excludeCategories?: string[] }
): Promise<ActivePackageDetails> {
  try {
    const supabase = createAdminClient();
    console.log(`[Customer Service] Looking up packages for customer: ${customerId}`, options?.excludeCategories ? `(excluding: ${options.excludeCategories.join(', ')})` : '');

    // Query the customer_active_packages view via RPC function
    const { data: packages, error: packageError } = await supabase
      .rpc('get_customer_packages', { customer_id_param: customerId });

    if (packageError) {
      console.error(`[Customer Service] Error looking up packages:`, packageError);
      return noPackage();
    }

    if (!packages || packages.length === 0) {
      console.log(`[Customer Service] No active packages found for customer ${customerId}`);
      return noPackage();
    }

    // Filter to only active/unlimited packages (exclude expired and depleted)
    let filteredPackages = packages.filter((pkg: { package_status: string }) =>
      pkg.package_status === 'active' || pkg.package_status === 'unlimited'
    );
    console.log(`[Customer Service] Filtered ${packages.length} packages to ${filteredPackages.length} active/unlimited`);

    // Filter out excluded categories if specified
    if (options?.excludeCategories && options.excludeCategories.length > 0) {
      filteredPackages = filteredPackages.filter((pkg: { package_category: string }) =>
        !options.excludeCategories!.includes(pkg.package_category)
      );
      console.log(`[Customer Service] After category filter: ${filteredPackages.length} (excluded: ${options.excludeCategories.join(', ')})`);
    }

    if (filteredPackages.length === 0) {
      console.log(`[Customer Service] No packages remaining after filtering for customer ${customerId}`);
      return noPackage();
    }

    // Use the first active package
    const activePackage = filteredPackages[0];
    const isUnlimited = activePackage.package_status === 'unlimited';

    let packageInfo: string;
    if (isUnlimited) {
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
      packageTypeName: activePackage.package_type_name, // The full name like "Silver (15H)"
      displayName: activePackage.display_name ?? undefined,
      // An unlimited package has no meaningful balance — report null rather
      // than whatever the RPC happens to put in the hours columns, so the UI
      // shows "unlimited" instead of a meter against a fabricated total.
      remainingHours: isUnlimited ? null : toNumberOrNull(activePackage.remaining_hours),
      totalHours: isUnlimited ? null : toNumberOrNull(activePackage.total_hours),
      usedHours: isUnlimited ? null : toNumberOrNull(activePackage.used_hours),
      expiryDate: activePackage.expiration_date ?? null,
      isUnlimited,
    };

  } catch (error) {
    console.error('Error in getActivePackageDetailsForCustomer:', error);
    return noPackage();
  }
}