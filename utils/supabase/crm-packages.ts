import { createServerClient } from './server';
import { createClient } from '@supabase/supabase-js';

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
  id: string;
  crm_package_id: string;
  customer_name: string;
  package_name_from_def: string | null;
  package_display_name_from_def: string | null;
  package_type_from_def: string | null;
  package_total_hours_from_def: number | null;
  package_pax_from_def: number | null;
  package_validity_period_from_def: string | null;
  first_use_date: string | null;
  expiration_date: string;
  calculated_remaining_hours: number | null;
  calculated_used_hours: number | null;
  stable_hash_id: string;
  created_at_for_purchase_date: string | null;
  
  // Legacy fields for backward compatibility (in case some old data uses these)
  package_name?: string;
  package_display_name?: string;
  package_type_name?: string;
  remaining_hours?: number;
  used_hours?: number;
  total_hours?: number;
  pax?: number;
  validity_period_definition?: string;
  purchase_date?: string;
}

/**
 * IMPROVED: Fetch packages for a profile using direct backoffice function call
 * Now bypasses sync layer and provides real-time data from source
 * Uses the same approach as VIP status API for consistency
 */
export async function getPackagesForProfile(profileId: string): Promise<CrmPackage[]> {
  try {
    const supabase = createServerClient();
    
    let stableHashId: string | null = null;
    
    // First approach: Check vip_customer_data (same as VIP status API)
    const { data: profileVip, error: profileVipError } = await supabase
      .from('profiles')
      .select('vip_customer_data_id')
      .eq('id', profileId)
      .single();

    if (profileVip?.vip_customer_data_id) {
      const { data: vipData, error: vipDataError } = await supabase
        .from('vip_customer_data')
        .select('stable_hash_id')
        .eq('id', profileVip.vip_customer_data_id)
        .single();
      
      if (!vipDataError && vipData?.stable_hash_id) {
        stableHashId = vipData.stable_hash_id;
        console.log(`[getPackagesForProfile] Found stable_hash_id from vip_customer_data: ${stableHashId}`);
      }
    }
    
    // Fallback approach: Check crm_customer_mapping
    if (!stableHashId) {
      const { data: mapping, error: mappingError } = await supabase
        .from('crm_customer_mapping')
        .select('stable_hash_id, is_matched')
        .eq('profile_id', profileId)
        .eq('is_matched', true)
        .single();
      
      if (!mappingError && mapping?.stable_hash_id) {
        stableHashId = mapping.stable_hash_id;
        console.log(`[getPackagesForProfile] Found stable_hash_id from crm_customer_mapping: ${stableHashId}`);
      }
    }
    
    if (!stableHashId) {
      console.log(`[getPackagesForProfile] No stable_hash_id found for profile ${profileId}`);
      return [];
    }

    // IMPROVED: Get real-time data directly from backoffice function instead of stale sync table
    return await getPackagesByStableHashId(stableHashId);
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
    const supabase = createServerClient();
    
    // Call the database function to get packages from backoffice schema
    const { data: packages, error } = await supabase
      .schema('backoffice' as any)
      .rpc('get_packages_by_hash_id', { p_stable_hash_id: stableHashId });
    
    if (error) {
      console.error('Error getting packages by hash ID:', error);
      return [];
    }

    console.log(`[getPackagesByStableHashId] Raw CRM data for ${stableHashId}:`, JSON.stringify(packages, null, 2));

    // Transform and filter packages
    const validPackages = (packages || [])
      .filter((pkg: RawCrmPackage) => {
        // Only include packages that:
        // 1. Have an expiration date
        // 2. Haven't expired
        const expirationDate = pkg.expiration_date ? new Date(pkg.expiration_date) : null;
        const isValid = expirationDate && expirationDate > new Date();
        console.log(`[getPackagesByStableHashId] Package ${pkg.id}: expiration=${pkg.expiration_date}, isValid=${isValid}`);
        return isValid;
      })
      .map((pkg: RawCrmPackage): CrmPackage => {
        console.log(`[getPackagesByStableHashId] Mapping package ${pkg.id}:`, pkg);
        
        // Determine the best package name to use (prioritize richer names)
        const packageName = pkg.package_display_name_from_def || 
                           pkg.package_display_name || 
                           pkg.package_name_from_def || 
                           pkg.package_name || 
                           pkg.package_type_from_def || 
                           pkg.package_type_name || 
                           'Unknown Package';
        
        // Determine remaining hours (prioritize calculated values) and convert null to undefined
        const remainingHours = pkg.calculated_remaining_hours !== null ? pkg.calculated_remaining_hours : 
                              (pkg.remaining_hours !== null ? pkg.remaining_hours : undefined);
        
        return {
          id: String(pkg.id),
          crm_package_id: pkg.crm_package_id || String(pkg.id),
          first_use_date: pkg.first_use_date || undefined,
          expiration_date: pkg.expiration_date || new Date().toISOString(),
          remaining_hours: remainingHours,
          package_type_name: packageName,
          customer_name: pkg.customer_name || '',
          stable_hash_id: stableHashId
        };
      });

    console.log(`[getPackagesByStableHashId] Final mapped packages:`, JSON.stringify(validPackages, null, 2));
    return validPackages;
  } catch (error) {
    console.error('Error in getPackagesByStableHashId:', error);
    return [];
  }
}

/**
 * @deprecated LEGACY: Sync packages for a profile to our local database
 * This function is deprecated as we now use direct access to backoffice.get_packages_by_hash_id()
 * for real-time data. The sync layer adds complexity and data lag without significant benefits.
 * 
 * Use getPackagesForProfile() for direct access instead.
 * 
 * This should be called after a successful CRM customer match
 * Uses the same approach as VIP status API for consistency
 */
export async function syncPackagesForProfile(profileId: string): Promise<void> {
  console.warn('[DEPRECATED] syncPackagesForProfile() is deprecated. Use direct access via getPackagesForProfile() instead.');
  
  try {
    // Use service role client for admin operations
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );
    
    let stableHashId: string | null = null;
    let attempts = 0;
    const maxAttempts = 3;
    
    // Retry logic to handle potential race conditions
    while (!stableHashId && attempts < maxAttempts) {
      attempts++;
      console.log(`[syncPackagesForProfile] Attempt ${attempts}/${maxAttempts} to find stable_hash_id for profile: ${profileId}`);
      
      // First approach: Check vip_customer_data (same as VIP status API)
      const { data: profileVip, error: profileVipError } = await supabase
        .from('profiles')
        .select('vip_customer_data_id')
        .eq('id', profileId)
        .single();

      if (profileVip?.vip_customer_data_id) {
        const { data: vipData, error: vipDataError } = await supabase
          .from('vip_customer_data')
          .select('stable_hash_id')
          .eq('id', profileVip.vip_customer_data_id)
          .single();
        
        if (!vipDataError && vipData?.stable_hash_id) {
          stableHashId = vipData.stable_hash_id;
          console.log(`[syncPackagesForProfile] Found stable_hash_id from vip_customer_data: ${stableHashId}`);
        }
      }
      
      // Fallback approach: Check crm_customer_mapping
      if (!stableHashId) {
        const { data: mapping, error: mappingError } = await supabase
          .from('crm_customer_mapping')
          .select('stable_hash_id, is_matched')
          .eq('profile_id', profileId)
          .eq('is_matched', true)
          .single();
        
        if (!mappingError && mapping?.stable_hash_id) {
          stableHashId = mapping.stable_hash_id;
          console.log(`[syncPackagesForProfile] Found stable_hash_id from crm_customer_mapping: ${stableHashId}`);
        }
      }
      
      // Sleep briefly before retrying if needed
      if (!stableHashId && attempts < maxAttempts) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
    
    if (!stableHashId) {
      console.log(`[syncPackagesForProfile] No stable_hash_id found for profile ${profileId} after ${maxAttempts} attempts - skipping sync`);
      return;
    }

    // Get packages using direct function call (this is what should be used instead of sync)
    const packages = await getPackagesByStableHashId(stableHashId);
    
    // Clear existing packages for this profile and insert new ones
    const { error: deleteError } = await supabase
      .from('crm_packages')
      .delete()
      .eq('stable_hash_id', stableHashId);
    
    if (deleteError) {
      console.error('Error clearing existing packages:', deleteError);
      throw deleteError;
    }
    
    if (packages.length > 0) {
      // Transform packages for insertion
      const packageInserts = packages.map(pkg => ({
        stable_hash_id: stableHashId,
        crm_package_id: pkg.crm_package_id,
        customer_name: pkg.customer_name,
        package_name: pkg.package_type_name,
        package_display_name: pkg.package_type_name,
        package_type_name: pkg.package_type_name,
        first_use_date: pkg.first_use_date,
        expiration_date: pkg.expiration_date,
        remaining_hours: pkg.remaining_hours,
        total_hours: pkg.remaining_hours, // This is incorrect but kept for compatibility
        used_hours: 0, // This is incorrect but kept for compatibility
        package_category: 'imported',
        validity_period_definition: '1 year',
        pax: 2
      }));
      
      const { error: insertError } = await supabase
        .from('crm_packages')
        .insert(packageInserts);
      
      if (insertError) {
        console.error('Error inserting packages:', insertError);
        throw insertError;
      }
    }
    
    console.log(`[syncPackagesForProfile] Sync completed for profile ${profileId} with ${packages.length} packages`);
  } catch (error) {
    console.error(`[syncPackagesForProfile] Error syncing packages for profile ${profileId}:`, error);
    throw error;
  }
}

/**
 * @deprecated LEGACY: Bulk sync packages for all profiles that have CRM mappings
 * This function is deprecated as we now use direct access to backoffice.get_packages_by_hash_id()
 * for real-time data. The sync layer adds complexity and data lag without significant benefits.
 * 
 * This is used by cron jobs to keep all package data up to date
 */
export async function bulkSyncPackagesForAllProfiles(options: {
  batchSize?: number;
  maxProfiles?: number;
  onlyNewProfiles?: boolean;
} = {}): Promise<{
  totalProfiles: number;
  successfulProfiles: number;
  failedProfiles: number;
  totalPackages: number;
  errors: string[];
}> {
  console.warn('[DEPRECATED] bulkSyncPackagesForAllProfiles() is deprecated. Use direct access via getPackagesForProfile() instead.');
  
  const { batchSize = 20, maxProfiles, onlyNewProfiles = false } = options;
  
  console.log('[bulkSyncPackages] Starting bulk sync with options:', options);
  
  // Use service role client for admin operations
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
  
  let totalProfiles = 0;
  let successfulProfiles = 0;
  let failedProfiles = 0;
  let totalPackages = 0;
  const errors: string[] = [];
  
  try {
    // Get all profiles that have CRM mappings with stable_hash_id
    let query = supabase
      .from('crm_customer_mapping')
      .select('profile_id, stable_hash_id, updated_at')
      .eq('is_matched', true)
      .not('stable_hash_id', 'is', null);
    
    // If only syncing new profiles, filter by recent mappings (last 7 days)
    if (onlyNewProfiles) {
      const weekAgo = new Date();
      weekAgo.setDate(weekAgo.getDate() - 7);
      query = query.gte('updated_at', weekAgo.toISOString());
    }
    
    // Limit the number of profiles if specified
    if (maxProfiles) {
      query = query.limit(maxProfiles);
    }
    
    const { data: mappings, error: mappingsError } = await query;
    
    if (mappingsError) {
      throw new Error(`Failed to fetch mappings: ${mappingsError.message}`);
    }
    
    if (!mappings || mappings.length === 0) {
      console.log('[bulkSyncPackages] No mappings found');
      return { totalProfiles: 0, successfulProfiles: 0, failedProfiles: 0, totalPackages: 0, errors: [] };
    }
    
    console.log(`[bulkSyncPackages] Found ${mappings.length} profiles to sync`);
    totalProfiles = mappings.length;
    
    // Process in batches
    const batches = [];
    for (let i = 0; i < mappings.length; i += batchSize) {
      batches.push(mappings.slice(i, i + batchSize));
    }
    
    for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
      const batch = batches[batchIndex];
      console.log(`[bulkSyncPackages] Processing batch ${batchIndex + 1} of ${batches.length}`);
      
      // Process batch in parallel
      const batchPromises = batch.map(async (mapping) => {
        try {
          console.log(`[bulkSyncPackages] Syncing packages for profile ${mapping.profile_id}`);
          
          // Get packages from backoffice schema
          const { data: rawCrmPackages, error: crmError } = await supabase
            .schema('backoffice' as any)
            .rpc('get_packages_by_hash_id', { p_stable_hash_id: mapping.stable_hash_id });
          
          if (crmError) {
            throw new Error(`CRM error for ${mapping.profile_id}: ${crmError.message}`);
          }
          
          const validPackages = (rawCrmPackages || [])
            .filter((pkg: any) => {
              const expirationDate = pkg.expiration_date ? new Date(pkg.expiration_date) : null;
              return expirationDate && expirationDate > new Date();
            });
          
          // Delete existing packages for this stable_hash_id from public schema
          const { error: deleteError } = await supabase
            .from('crm_packages')
            .delete()
            .eq('stable_hash_id', mapping.stable_hash_id);
          
          if (deleteError) {
            console.warn(`[bulkSyncPackages] Delete error for ${mapping.profile_id}:`, deleteError);
          }
          
          // Insert new packages if any
          if (validPackages.length > 0) {
            const packagesToInsert = validPackages.map((pkg: any) => ({
              crm_package_id: String(pkg.id),
              stable_hash_id: mapping.stable_hash_id,
              customer_name: pkg.customer_name || '',
              
              // Rich package information from CRM - prioritize _from_def fields
              package_name: pkg.package_name_from_def || pkg.package_name || null,
              package_display_name: pkg.package_display_name_from_def || pkg.package_display_name || null,
              package_type_name: pkg.package_type_from_def || pkg.package_type_name || null,
              package_category: pkg.package_type_from_def || pkg.package_category || null,
              total_hours: pkg.package_total_hours_from_def ?? pkg.total_hours ?? null,
              pax: pkg.package_pax_from_def ?? pkg.pax ?? null,
              validity_period_definition: pkg.package_validity_period_from_def || pkg.validity_period_definition || null,
              
              first_use_date: pkg.first_use_date || null,
              expiration_date: pkg.expiration_date || null,
              purchase_date: pkg.created_at_for_purchase_date || pkg.purchase_date || null,
              
              remaining_hours: pkg.calculated_remaining_hours ?? pkg.remaining_hours ?? null,
              used_hours: pkg.calculated_used_hours ?? pkg.used_hours ?? null,
              
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString()
            }));
            
            const { error: insertError } = await supabase
              .from('crm_packages')
              .insert(packagesToInsert);
            
            if (insertError) {
              throw new Error(`Insert error for ${mapping.profile_id}: ${insertError.message}`);
            }
            
            console.log(`[bulkSyncPackages] Synced ${validPackages.length} packages for profile ${mapping.profile_id}`);
            return { success: true, packageCount: validPackages.length };
          } else {
            console.log(`[bulkSyncPackages] No valid packages for profile ${mapping.profile_id}`);
            return { success: true, packageCount: 0 };
          }
        } catch (error) {
          const errorMessage = `Profile ${mapping.profile_id}: ${error instanceof Error ? error.message : String(error)}`;
          console.error(`[bulkSyncPackages] ${errorMessage}`);
          return { success: false, error: errorMessage };
        }
      });
      
      // Wait for batch to complete
      const batchResults = await Promise.all(batchPromises);
      
      // Process results
      for (const result of batchResults) {
        if (result.success) {
          successfulProfiles++;
          totalPackages += result.packageCount || 0;
        } else {
          failedProfiles++;
          errors.push(result.error || 'Unknown error');
        }
      }
      
      // Add a small delay between batches to avoid rate limits
      if (batchIndex < batches.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }
    
    console.log('[bulkSyncPackages] Bulk sync completed:', {
      totalProfiles,
      successfulProfiles,
      failedProfiles,
      totalPackages,
      errorCount: errors.length
    });
    
    return {
      totalProfiles,
      successfulProfiles,
      failedProfiles,
      totalPackages,
      errors
    };
    
  } catch (error) {
    console.error('[bulkSyncPackages] Bulk sync failed:', error);
    return {
      totalProfiles,
      successfulProfiles,
      failedProfiles,
      totalPackages,
      errors: [error instanceof Error ? error.message : String(error)]
    };
  }
} 