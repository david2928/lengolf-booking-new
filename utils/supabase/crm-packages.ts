import { createCrmClient } from './crm';
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
 * Fetch packages for a profile using their CRM mapping
 * Uses the same approach as VIP status API for consistency
 * Now reads from local staging table for better performance
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

    // Get packages from production table
    const { data: packages, error: packagesError } = await supabase
      .from('crm_packages')
      .select('*')
      .eq('stable_hash_id', stableHashId);
    
    if (packagesError) {
      console.error('Error fetching packages:', packagesError);
      return [];
    }

    // Transform staging table data to CrmPackage interface
    const validPackages = (packages || [])
      .filter((pkg: any) => {
        const expirationDate = pkg.expiration_date ? new Date(pkg.expiration_date) : null;
        const isValid = expirationDate && expirationDate > new Date();
        console.log(`[getPackagesForProfile] Package ${pkg.id}: expiration=${pkg.expiration_date}, isValid=${isValid}`);
        return isValid;
      })
      .map((pkg: any): CrmPackage => {
        console.log(`[getPackagesForProfile] Mapping package from staging ${pkg.id}:`, pkg);
        
        // Use the rich data stored in staging table
        const packageName = pkg.package_display_name || 
                           pkg.package_name || 
                           pkg.package_type_name || 
                           'Unknown Package';
        
        return {
          id: String(pkg.id),
          crm_package_id: pkg.crm_package_id || String(pkg.id),
          first_use_date: pkg.first_use_date,
          expiration_date: pkg.expiration_date || new Date().toISOString(),
          remaining_hours: pkg.remaining_hours,
          package_type_name: packageName,
          customer_name: pkg.customer_name || '',
          stable_hash_id: stableHashId
        };
      });

    console.log(`[getPackagesForProfile] Final packages from staging:`, JSON.stringify(validPackages, null, 2));
    return validPackages;
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
 * Sync packages for a profile to our local database
 * This should be called after a successful CRM customer match
 * Uses the same approach as VIP status API for consistency
 */
export async function syncPackagesForProfile(profileId: string): Promise<void> {
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
          break;
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
          break;
        }
      }
      
      // If we still don't have it and this isn't the last attempt, wait a bit
      if (!stableHashId && attempts < maxAttempts) {
        console.log(`[syncPackagesForProfile] stable_hash_id not found on attempt ${attempts}, waiting 200ms before retry...`);
        await new Promise(resolve => setTimeout(resolve, 200));
      }
    }
    
    if (!stableHashId) {
      console.error('No valid CRM mapping found via either approach for profile:', profileId, 'after', attempts, 'attempts');
      return;
    }

    // Get the raw CRM packages with all rich data
    const crmSupabase = createCrmClient();
    const { data: rawCrmPackages, error: crmError } = await crmSupabase
      .rpc('get_packages_by_hash_id', { p_stable_hash_id: stableHashId });
    
    if (crmError || !rawCrmPackages) {
      console.error('Error getting raw CRM packages for sync:', crmError);
      return;
    }

    console.log(`[syncPackagesForProfile] Raw CRM packages for sync:`, JSON.stringify(rawCrmPackages, null, 2));
    
    if (rawCrmPackages.length > 0) {
      // Map the rich CRM data to the production table structure
      const packagesToUpsert = rawCrmPackages
        .filter((pkg: any) => {
          const expirationDate = pkg.expiration_date ? new Date(pkg.expiration_date) : null;
          return expirationDate && expirationDate > new Date();
        })
        .map((pkg: any) => {
          return {
            // Let PostgreSQL generate UUID automatically - remove id field
            crm_package_id: String(pkg.id), // CRM's package ID
            stable_hash_id: stableHashId,
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
            
            // Audit timestamps
            updated_at: new Date().toISOString(),
            created_at: new Date().toISOString()
          };
        });

      console.log(`[syncPackagesForProfile] Packages to upsert:`, JSON.stringify(packagesToUpsert, null, 2));
      
      // Delete existing packages for this stable_hash_id first to avoid conflicts
      const { error: deleteError } = await supabase
        .from('crm_packages')
        .delete()
        .eq('stable_hash_id', stableHashId);
      
      if (deleteError) {
        console.error('Error clearing existing packages:', deleteError);
      }

      // Insert new packages
      if (packagesToUpsert.length > 0) {
        const { error: insertError } = await supabase
          .from('crm_packages')
          .insert(packagesToUpsert);
        
        if (insertError) {
          console.error('Error inserting packages:', insertError);
        } else {
          console.log(`[syncPackagesForProfile] Successfully synced ${packagesToUpsert.length} packages for stable_hash_id: ${stableHashId}`);
        }
      }
    } else {
      // If no packages found, delete all packages for this stable_hash_id
      const { error: deleteError } = await supabase
        .from('crm_packages')
        .delete()
        .eq('stable_hash_id', stableHashId);

      if (deleteError) {
        console.error('Error deleting old packages:', deleteError);
      } else {
        console.log(`[syncPackagesForProfile] No active packages found, cleared all for stable_hash_id: ${stableHashId}`);
      }
    }
  } catch (error) {
    console.error('Error syncing packages for profile:', error);
  }
} 