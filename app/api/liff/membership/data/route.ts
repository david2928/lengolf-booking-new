import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/utils/supabase/admin';
import { formatInTimeZone } from 'date-fns-tz';
import { appCache } from '@/lib/cache';

interface PackageFromRPC {
  package_id: string;
  display_name?: string;
  package_type_name?: string;
  package_category?: string;
  purchase_date?: string;
  expiration_date: string;
  total_hours?: number | null;
  remaining_hours?: number | null;
  used_hours?: number | null;
  package_status: string;
}

interface BookingFromDB {
  id: string;
  date: string;
  start_time: string;
  duration: number;
  bay: string | null;
  status: string;
  number_of_people: number;
  customer_notes?: string | null;
  package_id?: string | null;
  booking_type: string;
}

/**
 * Unified LIFF Membership Data Endpoint
 * Combines status check + dashboard data into a single API call
 * Returns either { status: 'not_linked' } or { status: 'linked', profile, packages, bookings }
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
    const cacheKey = `membership_data_${lineUserId}`;
    const cachedData = appCache.get(cacheKey);
    if (cachedData) {
      console.log('[LIFF Data] Cache hit for', lineUserId);
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
      .select('id, display_name, email, phone_number, picture_url, customer_id')
      .eq('provider', 'line')
      .eq('provider_id', lineUserId)
      .maybeSingle();

    if (profileError) {
      console.error('[LIFF Data] Profile query error:', profileError);
      return NextResponse.json(
        { error: 'Database error' },
        { status: 500 }
      );
    }

    // If no profile or no customer_id, user is not linked
    if (!profile || !profile.customer_id) {
      const notLinkedResponse = { status: 'not_linked' };
      // Cache not_linked status for 30 seconds
      appCache.set(cacheKey, notLinkedResponse, 30);
      return NextResponse.json(notLinkedResponse, {
        headers: {
          'Cache-Control': 'private, max-age=30',
          'X-Cache': 'MISS'
        }
      });
    }

    // User is linked - fetch all data in parallel
    const serverTimeZone = 'Asia/Bangkok';
    const todayDate = formatInTimeZone(new Date(), serverTimeZone, 'yyyy-MM-dd');

    const [
      { data: customer, error: customerError },
      { data: activePackagesData, error: activePackagesError },
      { data: allPackagesData, error: allPackagesError },
      { data: bookingsData, error: bookingsError },
      { count: totalUpcoming }
    ] = await Promise.all([
      supabase
        .from('customers')
        .select('id, customer_code, customer_name, email, contact_number')
        .eq('id', profile.customer_id)
        .single(),
      supabase.rpc('get_customer_packages', { customer_id_param: profile.customer_id }),
      supabase.rpc('get_all_customer_packages', { customer_id_param: profile.customer_id }),
      supabase
        .from('bookings')
        .select('id, date, start_time, duration, bay, status, number_of_people, customer_notes, package_id, booking_type')
        .eq('customer_id', profile.customer_id)
        .gte('date', todayDate)
        .order('date', { ascending: true })
        .order('start_time', { ascending: true })
        .limit(5),
      supabase
        .from('bookings')
        .select('*', { count: 'exact', head: true })
        .eq('customer_id', profile.customer_id)
        .gte('date', todayDate)
    ]);

    if (customerError || !customer) {
      console.error('[LIFF Data] Customer query error:', customerError);
      return NextResponse.json(
        { error: 'Customer not found' },
        { status: 404 }
      );
    }

    if (activePackagesError) {
      console.error('[LIFF Data] Active packages error:', activePackagesError);
    }

    if (allPackagesError) {
      console.error('[LIFF Data] All packages error:', allPackagesError);
    }

    if (bookingsError) {
      console.error('[LIFF Data] Bookings query error:', bookingsError);
    }

    // Process packages - separate active from past
    const allPackages = allPackagesData || [];
    const now = new Date();

    const activePackages = (activePackagesData || []).map((pkg: PackageFromRPC) => ({
      id: pkg.package_id,
      packageName: pkg.display_name || pkg.package_type_name,
      packageCategory: pkg.package_category,
      purchaseDate: pkg.purchase_date,
      expiryDate: pkg.expiration_date,
      totalHours: pkg.total_hours,
      remainingHours: pkg.remaining_hours,
      usedHours: pkg.used_hours,
      status: pkg.package_status
    }));

    const pastPackages = allPackages
      .filter((pkg: PackageFromRPC) => {
        const expirationDate = new Date(pkg.expiration_date);
        const isExpired = expirationDate <= now;
        const isDepleted = pkg.remaining_hours !== null && pkg.remaining_hours !== undefined && pkg.remaining_hours <= 0;
        return isExpired || isDepleted;
      })
      .map((pkg: PackageFromRPC) => ({
        id: pkg.package_id,
        packageName: pkg.display_name || pkg.package_type_name,
        packageCategory: pkg.package_category,
        purchaseDate: pkg.purchase_date,
        expiryDate: pkg.expiration_date,
        totalHours: pkg.total_hours,
        remainingHours: pkg.remaining_hours,
        usedHours: pkg.used_hours,
        status: pkg.package_status
      }));

    const upcomingBookings = (bookingsData || []).map((booking: BookingFromDB) => ({
      id: booking.id,
      date: booking.date,
      startTime: booking.start_time,
      duration: booking.duration,
      bay: booking.bay,
      status: booking.status,
      numberOfPeople: booking.number_of_people,
      notes: booking.customer_notes
    }));

    const responseData = {
      status: 'linked',
      profile: {
        id: profile.id,
        name: profile.display_name,
        email: profile.email || customer.email,
        phone: profile.phone_number || customer.contact_number,
        pictureUrl: profile.picture_url,
        customerCode: customer.customer_code
      },
      packages: {
        active: activePackages,
        past: pastPackages
      },
      bookings: {
        upcoming: upcomingBookings,
        total: totalUpcoming || 0
      }
    };

    // Cache for 30 seconds
    appCache.set(cacheKey, responseData, 30);
    console.log('[LIFF Data] Cache miss - data cached for', lineUserId);

    return NextResponse.json(responseData, {
      headers: {
        'Cache-Control': 'private, max-age=30, stale-while-revalidate=60',
        'X-Cache': 'MISS'
      }
    });

  } catch (error) {
    console.error('[LIFF Data] Unexpected error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
