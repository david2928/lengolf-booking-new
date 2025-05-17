import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/app/api/auth/options';
import { createClient } from '@supabase/supabase-js'; // Import base Supabase client for main app DB
import type { Session as NextAuthSession, User as NextAuthUser } from 'next-auth';

// Define a type for our session that includes the accessToken
interface VipPackagesSessionUser extends NextAuthUser {
  id: string;
}
interface VipPackagesSession extends NextAuthSession {
  accessToken?: string;
  user: VipPackagesSessionUser;
}

export async function GET() {
  const session = await getServerSession(authOptions) as VipPackagesSession | null;

  if (!session?.user?.id || !session.accessToken) {
    return NextResponse.json({ error: 'Unauthorized or missing token' }, { status: 401 });
  }

  const profileId = session.user.id;
  const userAccessToken = session.accessToken; // Store for clarity
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    console.error('[VIP Packages API GET] Supabase URL or Anon Key is not set.');
    return NextResponse.json({ error: 'Server configuration error: Supabase connection details missing.' }, { status: 500 });
  }
  
  // Create a user-specific Supabase client for operations on the main app DB (e.g., crm_customer_mapping_vip_staging)
  // Corrected initialization
  const supabaseUserClient = createClient(supabaseUrl, supabaseAnonKey, {
    global: {
      headers: {
        Authorization: `Bearer ${userAccessToken}`
      }
    }
  });

  try {
    // 1. Fetch CRM mapping from crm_customer_mapping_vip_staging using user-specific client
    const { data: mapping, error: mappingError } = await supabaseUserClient
      .from('crm_customer_mapping_vip_staging') // Corrected table name
      .select('is_matched, stable_hash_id')
      .eq('profile_id', profileId)
      .maybeSingle();

    if (mappingError) {
      console.error('Error fetching CRM mapping for packages (crm_customer_mapping_vip_staging):', JSON.stringify(mappingError, null, 2));
      return NextResponse.json({ error: 'Error checking CRM link status.', details: mappingError.message }, { status: 500 });
    }

    // Log the mapping data retrieved
    console.log(`[VIP Packages] Mapping data for profileId ${profileId}:`, JSON.stringify(mapping, null, 2));

    if (!mapping?.is_matched || !mapping.stable_hash_id) {
      console.log(`[VIP Packages] Condition met: !mapping?.is_matched (${!mapping?.is_matched}) || !mapping.stable_hash_id (${!mapping?.stable_hash_id}). Returning empty packages.`);
      return NextResponse.json({ activePackages: [], pastPackages: [] });
    }

    const stableHashId = mapping.stable_hash_id;

    // 3. Query crm_packages_vip_staging using stable_hash_id via the main app's Supabase client (supabaseUserClient)
    const { data: allPackagesData, error: packagesError } = await supabaseUserClient
      .from('crm_packages_vip_staging')
      .select('id, crm_package_id, package_type_name, first_use_date, expiration_date, remaining_hours, customer_name')
      .eq('stable_hash_id', stableHashId);

    if (packagesError) {
      console.error('Error fetching CRM packages:', JSON.stringify(packagesError, null, 2));
      return NextResponse.json({ error: 'Failed to fetch packages.', details: packagesError.message }, { status: 500 });
    }

    // Log packages data retrieved
    console.log(`[VIP Packages] Raw packages data for stableHashId ${stableHashId}:`, JSON.stringify(allPackagesData, null, 2));

    const activePackages: any[] = [];
    const pastPackages: any[] = [];
    const today = new Date();
    today.setHours(0,0,0,0);

    allPackagesData?.forEach(pkg => {
      const packageItem = {
        id: pkg.id,
        crmPackageId: pkg.crm_package_id,
        packageName: pkg.package_type_name,
        firstUseDate: pkg.first_use_date,
        expiryDate: pkg.expiration_date,
        remainingHours: pkg.remaining_hours,
        customerName: pkg.customer_name,
      };

      let isActive = false;
      const expiry = packageItem.expiryDate ? new Date(packageItem.expiryDate) : null;
      const hasRemainingHours = typeof packageItem.remainingHours === 'number' ? packageItem.remainingHours > 0 : false;
      
      if (expiry && expiry.getTime() >= today.getTime() && hasRemainingHours) {
        isActive = true;
      } else if (!expiry && hasRemainingHours) {
        isActive = true;
      } else {
        isActive = false;
      }

      if (isActive) {
        activePackages.push(packageItem);
      } else {
        pastPackages.push(packageItem);
      }
    });

    return NextResponse.json({ activePackages, pastPackages });

  } catch (error) {
    console.error('Unexpected error in GET /api/vip/packages:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
} 