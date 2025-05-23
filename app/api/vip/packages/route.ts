import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/options';
import { createClient } from '@supabase/supabase-js';
import { getPackagesForProfile, syncPackagesForProfile, type CrmPackage } from '@/utils/supabase/crm-packages';
import type { Session as NextAuthSession, User as NextAuthUser } from 'next-auth';
import type { VipPackage } from '@/types/vip';

// Define a type for our session that includes the accessToken
interface VipPackagesSessionUser extends NextAuthUser {
  id: string;
}
interface VipPackagesSession extends NextAuthSession {
  accessToken?: string;
  user: VipPackagesSessionUser;
}

/**
 * Transform CrmPackage to VipPackage format expected by frontend
 */
function transformToVipPackage(pkg: any): VipPackage {
  const now = new Date();
  const expirationDate = new Date(pkg.expiration_date || pkg.expiryDate);
  const isExpired = expirationDate <= now;
  
  // Determine status
  let status: string = 'active';
  if (isExpired) {
    status = 'expired';
  } else if (pkg.remaining_hours !== undefined && pkg.remaining_hours !== null && pkg.remaining_hours <= 0) {
    status = 'depleted';
  }
  
  return {
    id: pkg.id,
    crm_package_id: pkg.crm_package_id,
    packageName: pkg.package_display_name || pkg.package_name || pkg.package_type_name || 'Package',
    package_display_name: pkg.package_display_name || pkg.package_name,
    package_type_name: pkg.package_type_name,
    packageCategory: pkg.package_category || pkg.package_type_name,
    
    purchaseDate: pkg.purchase_date,
    first_use_date: pkg.first_use_date,
    expiryDate: pkg.expiration_date,
    
    totalHours: pkg.total_hours,
    remainingHours: pkg.remaining_hours,
    usedHours: pkg.used_hours,
    
    pax: pkg.pax,
    validityPeriod: pkg.validity_period_definition,
    
    customer_name: pkg.customer_name,
    status: status
  };
}

/**
 * Get packages for the authenticated VIP user
 * Automatically syncs if packages are stale or missing
 */
export async function GET() {
  try {
    const session = await getServerSession(authOptions) as VipPackagesSession | null;
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const profileId = session.user.id;
    
    // Create user-specific Supabase client
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        global: {
          headers: {
            Authorization: `Bearer ${session.accessToken}`
          }
        }
      }
    );
    
    // Find stable_hash_id using the same approach as VIP status API
    let stableHashId: string | null = null;
    let mappingUpdatedAt: string | null = null;
    
    // First approach: Check vip_customer_data (same as VIP status API)
    const { data: profileVip, error: profileVipError } = await supabase
      .from('profiles_vip_staging')
      .select('vip_customer_data_id')
      .eq('id', profileId)
      .single();

    if (profileVip?.vip_customer_data_id) {
      const { data: vipData, error: vipDataError } = await supabase
        .from('vip_customer_data')
        .select('stable_hash_id, updated_at')
        .eq('id', profileVip.vip_customer_data_id)
        .single();
      
      if (!vipDataError && vipData?.stable_hash_id) {
        stableHashId = vipData.stable_hash_id;
        mappingUpdatedAt = vipData.updated_at;
      }
    }
    
    // Fallback approach: Check crm_customer_mapping_vip_staging  
    if (!stableHashId) {
      const { data: mapping, error: mappingError } = await supabase
        .from('crm_customer_mapping_vip_staging')
        .select('stable_hash_id, is_matched, updated_at')
        .eq('profile_id', profileId)
        .eq('is_matched', true)
        .single();

      if (!mappingError && mapping?.stable_hash_id) {
        stableHashId = mapping.stable_hash_id;
        mappingUpdatedAt = mapping.updated_at;
      }
    }

    if (!stableHashId) {
      return NextResponse.json({
        activePackages: [],
        pastPackages: [],
        message: 'Account not linked to CRM or no valid mapping found'
      });
    }

    // Check existing packages and their freshness - using staging table
    const { data: existingPackages, error: packagesError } = await supabase
      .from('crm_packages_vip_staging')
      .select('*, updated_at')
      .eq('stable_hash_id', stableHashId);

    const now = new Date();
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000); // 1 hour threshold
    const mappingAge = mappingUpdatedAt ? new Date(mappingUpdatedAt) : new Date(0); // Use epoch if no mapping time
    
    // Determine if we need to sync:
    // 1. No packages exist, or
    // 2. Packages are older than 1 hour, or  
    // 3. Mapping was updated recently (within last hour) but packages are older
    const shouldSync = !existingPackages || 
                      existingPackages.length === 0 ||
                      existingPackages.some((pkg: any) => new Date(pkg.updated_at) < oneHourAgo) ||
                      (mappingAge > oneHourAgo && existingPackages.some((pkg: any) => new Date(pkg.updated_at) < mappingAge));

    if (shouldSync) {
      try {
        await syncPackagesForProfile(profileId);
      } catch (syncError) {
        console.error(`[VIP Packages API] Error syncing packages:`, syncError);
        // Continue with existing data if sync fails
      }
    }

    // Get the rich package data directly from staging table instead of using getPackagesForProfile
    const { data: richPackages, error: richPackagesError } = await supabase
      .from('crm_packages_vip_staging')
      .select('*')
      .eq('stable_hash_id', stableHashId);

    if (richPackagesError) {
      console.error(`[VIP Packages API] Error fetching rich packages:`, richPackagesError);
      return NextResponse.json({ error: 'Failed to fetch packages' }, { status: 500 });
    }

    const packages = (richPackages || []).map(transformToVipPackage);
    
    // Categorize packages with improved logic
    const activePackages = packages.filter((pkg: VipPackage) => {
      const expirationDate = new Date(pkg.expiryDate || '');
      const isNotExpired = expirationDate > now;
      
      // Package is active if:
      // 1. Not expired, AND
      // 2. Either has remaining hours > 0 OR has no remaining_hours field (unlimited/session-based packages)
      const hasRemainingCapacity = pkg.remainingHours === undefined || 
                                  pkg.remainingHours === null || 
                                  pkg.remainingHours > 0;
      
      return isNotExpired && hasRemainingCapacity;
    });

    const pastPackages = packages.filter((pkg: VipPackage) => {
      const expirationDate = new Date(pkg.expiryDate || '');
      const isExpired = expirationDate <= now;
      
      // Package is past/depleted if:
      // 1. Expired, OR
      // 2. Has defined remaining_hours and it's 0 or negative
      const isDepletedByHours = pkg.remainingHours !== undefined && 
                               pkg.remainingHours !== null && 
                               pkg.remainingHours <= 0;
      
      return isExpired || isDepletedByHours;
    });

    return NextResponse.json({
      activePackages,
      pastPackages,
      lastSyncTime: new Date().toISOString(),
      autoSynced: shouldSync
    });

  } catch (error) {
    console.error('Error in VIP packages endpoint:', error);
    return NextResponse.json({ error: 'Failed to fetch packages' }, { status: 500 });
  }
} 