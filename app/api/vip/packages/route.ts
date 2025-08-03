import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/options';
import { createServerClient } from '@/utils/supabase/server';
import type { VipPackage } from '@/types/vip';

/**
 * Transform package data to VipPackage format expected by frontend
 */
function transformToVipPackage(pkg: any): VipPackage {
  
  const now = new Date();
  // Handle both possible field names for expiration date
  const expirationDate = new Date(pkg.expiration_date || pkg.expire_date);
  const isExpired = expirationDate <= now;
  
  // Handle both possible field names for remaining hours/count
  const remainingHours = pkg.remaining_hours !== undefined ? Number(pkg.remaining_hours) : 
                        pkg.remaining_count !== undefined ? Number(pkg.remaining_count) : null;
  
  let status: string = 'active';
  if (isExpired) {
    status = 'expired';
  } else if (remainingHours !== null && remainingHours <= 0) {
    status = 'depleted';
  }
  
  const transformed = {
    id: pkg.package_id || pkg.id,
    packageName: pkg.display_name || pkg.package_type_name || pkg.name || 'Package',
    package_display_name: pkg.display_name,
    packageCategory: 'VIP Package',
    purchaseDate: pkg.purchase_date || pkg.created_at,
    expiryDate: pkg.expiration_date || pkg.expire_date,
    totalHours: pkg.total_hours !== undefined ? Number(pkg.total_hours) : 
                pkg.total_count !== undefined ? Number(pkg.total_count) : null,
    remainingHours: remainingHours,
    usedHours: pkg.used_hours !== undefined ? Number(pkg.used_hours) : 
               pkg.used_count !== undefined ? Number(pkg.used_count) : null,
    status: status
  };
  
  return transformed;
}

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = createServerClient();
    
    // Get customer ID from profile
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('customer_id')
      .eq('id', session.user.id)
      .single();

    if (profileError || !profile?.customer_id) {
      return NextResponse.json({
        activePackages: [],
        pastPackages: [],
        message: 'No customer account linked to this profile'
      });
    }

    // Get ALL packages using the customer_id (both active and expired)
    const { data: packages, error: packagesError } = await supabase
      .rpc('get_all_customer_packages', { customer_id_param: profile.customer_id });

    if (packagesError) {
      console.error(`[VIP Packages API] Error fetching packages:`, packagesError);
      return NextResponse.json({ error: 'Failed to fetch packages' }, { status: 500 });
    }


    const transformedPackages = (packages || []).map(transformToVipPackage);
    
    // Categorize packages
    const now = new Date();
    const activePackages = transformedPackages.filter((pkg: VipPackage) => {
      const expirationDate = new Date(pkg.expiryDate || '');
      const isNotExpired = expirationDate > now;
      const hasRemainingCapacity = pkg.remainingHours === undefined || 
                                  pkg.remainingHours === null || 
                                  pkg.remainingHours > 0;
      
      return isNotExpired && hasRemainingCapacity;
    });

    const pastPackages = transformedPackages.filter((pkg: VipPackage) => {
      const expirationDate = new Date(pkg.expiryDate || '');
      const isExpired = expirationDate <= now;
      const isDepletedByHours = pkg.remainingHours !== undefined && 
                               pkg.remainingHours !== null && 
                               pkg.remainingHours <= 0;
      
      return isExpired || isDepletedByHours;
    });

    return NextResponse.json({
      activePackages,
      pastPackages,
      dataSource: 'new_customer_system',
      fetchTime: new Date().toISOString()
    });

  } catch (error) {
    console.error('[VIP Packages API] Error:', error);
    return NextResponse.json({ error: 'Failed to fetch packages' }, { status: 500 });
  }
}