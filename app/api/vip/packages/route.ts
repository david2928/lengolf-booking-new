import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/options';
import { createClient } from '@supabase/supabase-js';
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

// Helper to create admin client for backoffice schema access
const getSupabaseAdminClient = () => {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
};

/**
 * Transform backoffice function output to VipPackage format expected by frontend
 * Updated to handle the rich data format from backoffice.get_packages_by_hash_id()
 */
function transformBackofficeToVipPackage(pkg: any): VipPackage {
  const now = new Date();
  const expirationDate = new Date(pkg.expiration_date);
  const isExpired = expirationDate <= now;
  
  // Determine status
  let status: string = 'active';
  if (isExpired) {
    status = 'expired';
  } else if (pkg.calculated_remaining_hours !== undefined && pkg.calculated_remaining_hours !== null && pkg.calculated_remaining_hours <= 0) {
    status = 'depleted';
  }
  
  return {
    id: pkg.id,
    crm_package_id: pkg.crm_package_id,
    packageName: pkg.package_display_name_from_def || pkg.package_name_from_def || 'Package',
    package_display_name: pkg.package_display_name_from_def,
    package_type_name: pkg.package_type_from_def,
    packageCategory: pkg.package_type_from_def,
    
    purchaseDate: pkg.created_at_for_purchase_date,
    first_use_date: pkg.first_use_date,
    expiryDate: pkg.expiration_date,
    
    totalHours: pkg.package_total_hours_from_def,
    remainingHours: pkg.calculated_remaining_hours,
    usedHours: pkg.calculated_used_hours,
    
    pax: pkg.package_pax_from_def,
    validityPeriod: pkg.package_validity_period_from_def,
    
    customer_name: pkg.customer_name,
    status: status
  };
}

/**
 * Get packages for the authenticated VIP user
 * Now uses direct access to backoffice.get_packages_by_hash_id() for real-time data
 */
export async function GET() {
  try {
    const session = await getServerSession(authOptions) as VipPackagesSession | null;
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const profileId = session.user.id;
    
    // Create user-specific Supabase client for profile data access
    const userSupabase = createClient(
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
    
    // Create admin client for backoffice schema access
    const adminSupabase = getSupabaseAdminClient();
    
    // Find stable_hash_id using the same approach as VIP status API
    let stableHashId: string | null = null;
    
    // First approach: Check vip_customer_data (same as VIP status API)
    const { data: profileVip, error: profileVipError } = await userSupabase
      .from('profiles')
      .select('vip_customer_data_id')
      .eq('id', profileId)
      .single();

    if (profileVip?.vip_customer_data_id) {
      const { data: vipData, error: vipDataError } = await userSupabase
        .from('vip_customer_data')
        .select('stable_hash_id')
        .eq('id', profileVip.vip_customer_data_id)
        .single();
      
      if (!vipDataError && vipData?.stable_hash_id) {
        stableHashId = vipData.stable_hash_id;
      }
    }
    
    // Fallback approach: Check crm_customer_mapping  
    if (!stableHashId) {
      const { data: mapping, error: mappingError } = await userSupabase
        .from('crm_customer_mapping')
        .select('stable_hash_id, is_matched')
        .eq('profile_id', profileId)
        .eq('is_matched', true)
        .single();

      if (!mappingError && mapping?.stable_hash_id) {
        stableHashId = mapping.stable_hash_id;
      }
    }

    if (!stableHashId) {
      return NextResponse.json({
        activePackages: [],
        pastPackages: [],
        message: 'Account not linked to CRM or no valid mapping found'
      });
    }

    // Get real-time package data directly from backoffice function using admin client
    const { data: richPackages, error: richPackagesError } = await adminSupabase
      .schema('backoffice' as any)
      .rpc('get_packages_by_hash_id', { p_stable_hash_id: stableHashId });

    if (richPackagesError) {
      console.error(`[VIP Packages API] Error fetching packages from backoffice:`, richPackagesError);
      return NextResponse.json({ error: 'Failed to fetch packages' }, { status: 500 });
    }

    const packages = (richPackages || []).map(transformBackofficeToVipPackage);
    
    // Categorize packages with improved logic
    const now = new Date();
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
      dataSource: 'backoffice_direct_fixed', // Updated indicator
      fetchTime: new Date().toISOString()
    });

  } catch (error) {
    console.error('[VIP Packages API] Error in VIP packages endpoint:', error);
    return NextResponse.json({ error: 'Failed to fetch packages' }, { status: 500 });
  }
} 