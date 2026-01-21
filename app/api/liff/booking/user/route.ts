import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/utils/supabase/admin';
import { appCache } from '@/lib/cache';

interface PackageFromRPC {
  package_id: string;
  display_name?: string;
  package_type_name?: string;
  package_category?: string;
  expiration_date: string;
  remaining_hours?: number | null;
}

/**
 * LIFF Booking User Endpoint
 * Lightweight endpoint to check user status and get profile for booking context.
 * Returns user status, profile data, and any active simulator package.
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const lineUserId = searchParams.get('lineUserId');

    if (!lineUserId) {
      return NextResponse.json(
        { error: 'lineUserId is required' },
        { status: 400 }
      );
    }

    // Check cache first
    const cacheKey = `booking_user_${lineUserId}`;
    const cachedData = appCache.get(cacheKey);
    if (cachedData) {
      console.log('[LIFF Booking User] Cache hit for', lineUserId);
      return NextResponse.json(cachedData, {
        headers: {
          'Cache-Control': 'private, max-age=30, stale-while-revalidate=60',
          'X-Cache': 'HIT'
        }
      });
    }

    const supabase = createAdminClient();

    // Get profile by LINE userId
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('id, display_name, email, phone_number, customer_id')
      .eq('provider', 'line')
      .eq('provider_id', lineUserId)
      .maybeSingle();

    if (profileError) {
      console.error('[LIFF Booking User] Profile query error:', profileError);
      return NextResponse.json(
        { error: 'Database error' },
        { status: 500 }
      );
    }

    // If no profile at all
    if (!profile) {
      const noProfileResponse = { status: 'not_linked' as const };
      appCache.set(cacheKey, noProfileResponse, 30);
      return NextResponse.json(noProfileResponse, {
        headers: {
          'Cache-Control': 'private, max-age=30',
          'X-Cache': 'MISS'
        }
      });
    }

    // If profile exists but no customer_id, return profile data for form pre-fill
    // Customer matching will happen at booking time via findOrCreateCustomer
    if (!profile.customer_id) {
      const notLinkedResponse = {
        status: 'not_linked' as const,
        profile: {
          id: profile.id,
          name: profile.display_name,
          email: profile.email,
          phone: profile.phone_number,
          customerId: null,
          customerCode: null
        }
      };
      appCache.set(cacheKey, notLinkedResponse, 30);
      return NextResponse.json(notLinkedResponse, {
        headers: {
          'Cache-Control': 'private, max-age=30',
          'X-Cache': 'MISS'
        }
      });
    }

    // User is linked - fetch customer data and active packages
    const [
      { data: customer, error: customerError },
      { data: packagesData, error: packagesError }
    ] = await Promise.all([
      supabase
        .from('customers')
        .select('id, customer_code, customer_name, email, contact_number')
        .eq('id', profile.customer_id)
        .single(),
      supabase.rpc('get_customer_packages', { customer_id_param: profile.customer_id })
    ]);

    if (customerError || !customer) {
      console.error('[LIFF Booking User] Customer query error:', customerError);
      return NextResponse.json(
        { error: 'Customer not found' },
        { status: 404 }
      );
    }

    if (packagesError) {
      console.error('[LIFF Booking User] Packages error:', packagesError);
    }

    // Find the first active simulator package (not coaching)
    let activePackage = null;
    if (packagesData && packagesData.length > 0) {
      const simulatorPackage = packagesData.find(
        (pkg: PackageFromRPC) =>
          pkg.package_category?.toLowerCase() !== 'coaching' &&
          pkg.remaining_hours !== null &&
          pkg.remaining_hours !== undefined &&
          pkg.remaining_hours > 0
      );

      if (simulatorPackage) {
        activePackage = {
          id: simulatorPackage.package_id,
          displayName: simulatorPackage.display_name || simulatorPackage.package_type_name,
          remainingHours: simulatorPackage.remaining_hours
        };
      }
    }

    const responseData = {
      status: 'linked' as const,
      profile: {
        id: profile.id,
        name: profile.display_name || customer.customer_name,
        email: profile.email || customer.email,
        phone: profile.phone_number || customer.contact_number,
        customerId: customer.id,
        customerCode: customer.customer_code
      },
      activePackage
    };

    // Cache for 30 seconds
    appCache.set(cacheKey, responseData, 30);
    console.log('[LIFF Booking User] Cache miss - data cached for', lineUserId);

    return NextResponse.json(responseData, {
      headers: {
        'Cache-Control': 'private, max-age=30, stale-while-revalidate=60',
        'X-Cache': 'MISS'
      }
    });

  } catch (error) {
    console.error('[LIFF Booking User] Unexpected error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
