import { createCrmClient } from './crm';
import { createServerClient } from './server';

/**
 * Interface representing a package in the CRM system
 */
export interface CrmPackage {
  id: string;
  customer_name: string;
  package_type_name: string;
  first_use_date: string | null;
  expiration_date: string;
  remaining_hours: number | null;
}

/**
 * Fetch available packages from the CRM database
 * @returns Array of CRM packages
 */
export async function fetchAvailableCrmPackages(): Promise<CrmPackage[]> {
  const supabase = createCrmClient();
  
  // Call the get_available_packages function
  const { data, error } = await supabase
    .rpc('get_available_packages');
  
  if (error) {
    console.error('Error fetching CRM packages:', error);
    throw error;
  }
  
  // Transform and validate the data
  if (!data) return [];
  
  // Map the raw data to our CrmPackage type
  return data.map((item: any) => ({
    id: String(item.id),
    customer_name: String(item.customer_name || ''),
    package_type_name: String(item.package_type_name || ''),
    first_use_date: item.first_use_date,
    expiration_date: item.expiration_date,
    remaining_hours: item.remaining_hours
  }));
}

/**
 * Sync packages from CRM to our local database
 * This will fetch all available packages and update our local copy
 */
export async function syncCrmPackages(): Promise<{
  totalPackages: number;
  newPackages: number;
  updatedPackages: number;
  errors: number;
}> {
  try {
    // Fetch all available packages from CRM
    const crmPackages = await fetchAvailableCrmPackages();
    
    // Get our main Supabase client
    const supabase = createServerClient();
    
    // Track statistics
    const stats = {
      totalPackages: crmPackages.length,
      newPackages: 0,
      updatedPackages: 0,
      errors: 0
    };
    
    // Process packages in batches
    const BATCH_SIZE = 50;
    for (let i = 0; i < crmPackages.length; i += BATCH_SIZE) {
      const batch = crmPackages.slice(i, i + BATCH_SIZE);
      console.log(`Processing package batch ${Math.floor(i/BATCH_SIZE) + 1}/${Math.ceil(crmPackages.length/BATCH_SIZE)}...`);
      
      // Prepare data for upsert
      const packagesToUpsert = batch.map(pkg => ({
        crm_package_id: pkg.id,
        crm_customer_id: '', // We'll update this later based on customer mappings
        customer_name: pkg.customer_name,
        package_type_name: pkg.package_type_name,
        first_use_date: pkg.first_use_date,
        expiration_date: pkg.expiration_date,
        remaining_hours: pkg.remaining_hours,
        updated_at: new Date().toISOString()
      }));
      
      // First, check which packages already exist
      const packageIds = packagesToUpsert.map(p => p.crm_package_id);
      const { data: existingPackages, error: fetchError } = await supabase
        .from('crm_packages')
        .select('crm_package_id')
        .in('crm_package_id', packageIds);
      
      if (fetchError) {
        console.error('Error fetching existing packages:', fetchError);
        stats.errors++;
        continue;
      }
      
      // Create a set of existing package IDs for quick lookup
      const existingPackageIds = new Set(existingPackages?.map(p => p.crm_package_id) || []);
      
      // Count new vs updated packages
      packagesToUpsert.forEach(pkg => {
        if (existingPackageIds.has(pkg.crm_package_id)) {
          stats.updatedPackages++;
        } else {
          stats.newPackages++;
        }
      });
      
      // Upsert the packages
      const { error } = await supabase
        .from('crm_packages')
        .upsert(packagesToUpsert, {
          onConflict: 'crm_package_id,website_id',
          ignoreDuplicates: false
        });
      
      if (error) {
        console.error('Error upserting packages:', error);
        stats.errors++;
      }
    }
    
    // Now update the crm_customer_id field based on customer mappings
    console.log('Updating customer IDs for packages...');
    
    // Get all customer mappings
    const { data: customerMappings, error: mappingError } = await supabase
      .from('crm_customer_mapping')
      .select('crm_customer_id, crm_customer_data')
      .eq('is_matched', true);
    
    if (mappingError) {
      console.error('Error fetching customer mappings:', mappingError);
      stats.errors++;
    } else if (customerMappings) {
      // Create a map of customer names to customer IDs
      const customerNameToId = new Map<string, string>();
      
      customerMappings.forEach(mapping => {
        const customerData = mapping.crm_customer_data as any;
        if (customerData && customerData.name) {
          customerNameToId.set(customerData.name.toLowerCase(), mapping.crm_customer_id);
        }
      });
      
      // Update packages with customer IDs
      for (const [customerName, customerId] of Array.from(customerNameToId.entries())) {
        const { error: updateError } = await supabase
          .from('crm_packages')
          .update({ crm_customer_id: customerId })
          .eq('customer_name', customerName)
          .is('crm_customer_id', '');
        
        if (updateError) {
          console.error(`Error updating customer ID for ${customerName}:`, updateError);
          stats.errors++;
        }
      }
    }
    
    return stats;
  } catch (error) {
    console.error('Error syncing CRM packages:', error);
    throw error;
  }
}

/**
 * Get packages for a specific profile
 * @param profileId The profile ID to get packages for
 * @returns Array of packages for the profile
 */
export async function getPackagesForProfile(profileId: string): Promise<any[]> {
  const supabase = createServerClient();
  
  // First get the CRM customer ID for this profile
  const { data: mapping, error: mappingError } = await supabase
    .from('crm_customer_mapping')
    .select('crm_customer_id')
    .eq('profile_id', profileId)
    .eq('is_matched', true)
    .single();
  
  if (mappingError || !mapping) {
    // No mapping found, return empty array
    return [];
  }
  
  // Get packages for this customer
  const { data: packages, error: packagesError } = await supabase
    .from('crm_packages')
    .select('*')
    .eq('crm_customer_id', mapping.crm_customer_id)
    .gte('expiration_date', new Date().toISOString().split('T')[0]) // Only active packages
    .order('expiration_date', { ascending: true });
  
  if (packagesError) {
    console.error('Error fetching packages for profile:', packagesError);
    return [];
  }
  
  return packages || [];
} 