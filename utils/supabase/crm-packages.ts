import { createCrmClient } from './crm';
import { createServerClient } from './server';

// Types
export interface CrmPackage {
  id: string;
  crm_package_id: string;
  first_use_date?: string;
  expiration_date: string;
  remaining_hours?: number;
  package_type_name: string;
  customer_name: string;
  stable_hash_id: string;
}

interface RawCrmPackage {
  id: string | number;
  crm_package_id?: string;
  first_use_date?: string;
  expiration_date?: string;
  remaining_hours?: number;
  package_type_name?: string;
  customer_name?: string;
}

/**
 * Fetch packages for a profile using their CRM mapping
 */
export async function getPackagesForProfile(profileId: string): Promise<CrmPackage[]> {
  try {
    const supabase = createServerClient();
    
    // First get the CRM mapping for this profile
    const { data: mapping, error: mappingError } = await supabase
      .from('crm_customer_mapping')
      .select('stable_hash_id')
      .eq('profile_id', profileId)
      .eq('is_matched', true)
      .single();
    
    if (mappingError || !mapping?.stable_hash_id) {
      console.error('No valid CRM mapping found:', mappingError);
      return [];
    }

    // Get packages using stable_hash_id
    return await getPackagesByStableHashId(mapping.stable_hash_id);
  } catch (error) {
    console.error('Error getting packages for profile:', error);
    return [];
  }
}

/**
 * Fetch packages for a customer using stable_hash_id from the CRM database
 */
async function getPackagesByStableHashId(stableHashId: string): Promise<CrmPackage[]> {
  try {
    const crmSupabase = createCrmClient();
    
    // Call the database function to get packages
    const { data: packages, error } = await crmSupabase
      .rpc('get_packages_by_hash_id', { p_stable_hash_id: stableHashId });
    
    if (error) {
      console.error('Error getting packages by hash ID:', error);
      return [];
    }

    // Transform and filter packages
    const validPackages = (packages || [])
      .filter((pkg: RawCrmPackage) => {
        // Only include packages that:
        // 1. Have an expiration date
        // 2. Haven't expired
        const expirationDate = pkg.expiration_date ? new Date(pkg.expiration_date) : null;
        return expirationDate && expirationDate > new Date();
      })
      .map((pkg: RawCrmPackage): CrmPackage => ({
        id: String(pkg.id),
        crm_package_id: pkg.crm_package_id || String(pkg.id),
        first_use_date: pkg.first_use_date,
        expiration_date: pkg.expiration_date || new Date().toISOString(),
        remaining_hours: pkg.remaining_hours,
        package_type_name: pkg.package_type_name || 'Unknown Package',
        customer_name: pkg.customer_name || '',
        stable_hash_id: stableHashId
      }));

    return validPackages;
  } catch (error) {
    console.error('Error in getPackagesByStableHashId:', error);
    return [];
  }
}

/**
 * Sync packages for a profile to our local database
 * This should be called after a successful CRM customer match
 */
export async function syncPackagesForProfile(profileId: string): Promise<void> {
  try {
    const supabase = createServerClient();
    
    // Get the CRM mapping
    const { data: mapping, error: mappingError } = await supabase
      .from('crm_customer_mapping')
      .select('stable_hash_id')
      .eq('profile_id', profileId)
      .eq('is_matched', true)
      .single();
    
    if (mappingError || !mapping?.stable_hash_id) {
      console.error('No valid CRM mapping found:', mappingError);
      return;
    }

    // Get packages from CRM
    const packages = await getPackagesByStableHashId(mapping.stable_hash_id);
    
    if (packages.length > 0) {
      // Upsert packages
      const { error: upsertError } = await supabase
        .from('crm_packages')
        .upsert(
          packages.map(pkg => ({
            ...pkg,
            updated_at: new Date().toISOString()
          })),
          {
            onConflict: 'id',
            ignoreDuplicates: false
          }
        );
      
      if (upsertError) {
        console.error('Error upserting packages:', upsertError);
      }
    }

    // Delete any packages that are no longer valid
    // (i.e., packages in our DB that weren't in the latest sync)
    if (packages.length > 0) {
      const validIds = packages.map(pkg => pkg.id);
      const { error: deleteError } = await supabase
        .from('crm_packages')
        .delete()
        .eq('stable_hash_id', mapping.stable_hash_id)
        .not('id', 'in', `(${validIds.join(',')})`);

      if (deleteError) {
        console.error('Error cleaning up old packages:', deleteError);
      }
    } else {
      // If no packages found, delete all packages for this stable_hash_id
      const { error: deleteError } = await supabase
        .from('crm_packages')
        .delete()
        .eq('stable_hash_id', mapping.stable_hash_id);

      if (deleteError) {
        console.error('Error deleting old packages:', deleteError);
      }
    }
  } catch (error) {
    console.error('Error syncing packages for profile:', error);
  }
} 