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

    if (!mapping?.is_matched || !mapping.stable_hash_id) {
      return NextResponse.json({ activePackages: [], pastPackages: [] });
    }

    const stableHashId = mapping.stable_hash_id;

    // 3. Query crm_packages_vip_staging using stable_hash_id via the main app's Supabase client (supabaseUserClient)
    const { data: allPackagesData, error: packagesError } = await supabaseUserClient
      .from('crm_packages_vip_staging')
      .select(`
        id, 
        crm_package_id, 
        customer_name,
        package_name,
        package_display_name,
        package_category,
        total_hours,
        pax,
        validity_period_definition,
        purchase_date,
        used_hours,
        first_use_date,
        expiration_date,
        remaining_hours,
        package_type_name
      `)
      .eq('stable_hash_id', stableHashId);

    if (packagesError) {
      console.error('Error fetching CRM packages:', JSON.stringify(packagesError, null, 2));
      return NextResponse.json({ error: 'Failed to fetch packages.', details: packagesError.message }, { status: 500 });
    }

    const activePackages: any[] = [];
    const pastPackages: any[] = [];
    const today = new Date();
    today.setHours(0,0,0,0);

    allPackagesData?.forEach(pkg => {
      const packageItem = {
        id: pkg.id,
        crm_package_id: pkg.crm_package_id,
        customer_name: pkg.customer_name,
        
        packageName: pkg.package_name,
        package_display_name: pkg.package_display_name,
        package_type_name: pkg.package_type_name,
        packageCategory: pkg.package_category,
        
        purchaseDate: pkg.purchase_date,
        first_use_date: pkg.first_use_date,
        expiryDate: pkg.expiration_date,
        
        totalHours: pkg.total_hours,
        remainingHours: pkg.remaining_hours,
        usedHours: pkg.used_hours,
        
        pax: pkg.pax,
        validityPeriod: pkg.validity_period_definition,

        status: '',
      };

      const expiry = packageItem.expiryDate ? new Date(packageItem.expiryDate) : null;
      const hasSufficientHours = packageItem.remainingHours === null ||
                               (typeof packageItem.remainingHours === 'number' && packageItem.remainingHours > 0);
      
      let isConsideredActive = false;
      if (!expiry) {
        isConsideredActive = hasSufficientHours;
      } else if (expiry.getTime() >= today.getTime()) {
        isConsideredActive = hasSufficientHours;
      } else {
        isConsideredActive = false;
      }
      
      if (isConsideredActive) {
        packageItem.status = 'active';
        activePackages.push(packageItem);
      } else {
        if (expiry && expiry.getTime() < today.getTime()) {
            packageItem.status = 'expired';
        } else if (packageItem.remainingHours !== null && packageItem.remainingHours <= 0) {
            packageItem.status = 'depleted';
        } else {
            packageItem.status = 'expired';
        }
        pastPackages.push(packageItem);
      }
    });

    return NextResponse.json({ activePackages, pastPackages });

  } catch (error) {
    console.error('Unexpected error in GET /api/vip/packages:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
} 