import { NextResponse, NextRequest } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/app/api/auth/options';
import { createServerClient } from '@/utils/supabase/server';
import { createAdminClient } from '@/utils/supabase/admin';
import type { Session as NextAuthSession, User as NextAuthUser } from 'next-auth';
import { formatInTimeZone } from 'date-fns-tz';

interface VipBookingsSessionUser extends NextAuthUser {
  id: string;
}

interface VipBookingsSession extends NextAuthSession {
  user: VipBookingsSessionUser;
}


export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions) as VipBookingsSession | null;

  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const profileId = session.user.id;
  const supabase = createServerClient();
  const adminSupabase = createAdminClient();

  const { searchParams } = new URL(request.url);
  const page = parseInt(searchParams.get('page') || '1', 10);
  const limit = parseInt(searchParams.get('limit') || '10', 10);
  const filter = searchParams.get('filter') || 'all'; // 'future', 'past', 'all'

  const offset = (page - 1) * limit;

  try {

    // Get current date and time in Asia/Bangkok
    const nowInBangkok = new Date();
    const serverTimeZone = 'Asia/Bangkok';
    const todayDate = formatInTimeZone(nowInBangkok, serverTimeZone, 'yyyy-MM-dd');
    const currentTime = formatInTimeZone(nowInBangkok, serverTimeZone, 'HH:mm');
    
    // console.log(`[VIP Bookings API GET] Current server datetime in ${serverTimeZone}: ${todayDate} ${currentTime}`);

    // Get customer ID from profile
    const { data: profileData, error: profileError } = await supabase
      .from('profiles')
      .select('customer_id')
      .eq('id', profileId)
      .single();

    if (profileError) {
      console.error('Error fetching profile:', profileError);
      return NextResponse.json({ error: 'Failed to fetch profile' }, { status: 500 });
    }

    let userCustomerId: string | null = null;
    if (profileData && profileData.customer_id) {
      userCustomerId = profileData.customer_id;
    }
    
    console.log(`[VIP Bookings API] Profile ${profileId} has customer_id: ${userCustomerId}`);
    console.log(`[VIP Bookings API] Filter: ${filter}, Page: ${page}, Limit: ${limit}`);
    console.log(`[VIP Bookings API] Current date: ${todayDate}, Current time: ${currentTime}`);
    
    // Debug: Check total bookings for this user/customer
    if (userCustomerId) {
      const { count: totalBookingsByCustomer } = await adminSupabase
        .from('bookings')
        .select('*', { count: 'exact', head: true })
        .eq('customer_id', userCustomerId);
      
      const { count: totalBookingsByUser } = await adminSupabase
        .from('bookings')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', profileId);
        
      console.log(`[VIP Bookings API] Total bookings by customer_id ${userCustomerId}: ${totalBookingsByCustomer}`);
      console.log(`[VIP Bookings API] Total bookings by user_id ${profileId}: ${totalBookingsByUser}`);
      
      // Additional debug: Check if bookings exist for customer code CUS-1872
      const { data: customerInfo } = await supabase
        .from('customers')
        .select('customer_code')
        .eq('id', userCustomerId)
        .single();
      
      if (customerInfo?.customer_code) {
        console.log(`[VIP Bookings API] Customer code: ${customerInfo.customer_code}`);
        
        // Check if any bookings reference this customer code in different fields
        const { count: bookingsByName } = await adminSupabase
          .from('bookings')
          .select('*', { count: 'exact', head: true })
          .ilike('name', `%${customerInfo.customer_code}%`);
          
        const { count: bookingsByEmail } = await adminSupabase
          .from('bookings')
          .select('*', { count: 'exact', head: true })
          .eq('email', 'dgeiermann@gmail.com');
          
        console.log(`[VIP Bookings API] Bookings with customer code in name: ${bookingsByName}`);
        console.log(`[VIP Bookings API] Bookings with email dgeiermann@gmail.com: ${bookingsByEmail}`);
      }
    }

    // Query bookings using customer_id and/or profile_id
    // Build query to search both by customer_id (if available) and by user_id (profile_id)
    let baseQuery = adminSupabase
      .from('bookings')
      .select('id, date, start_time, duration, bay, status, number_of_people, customer_notes, booking_type, created_at', { count: 'exact' });

    // Query by customer_id to get ALL bookings for this customer
    if (userCustomerId) {
      baseQuery = baseQuery.eq('customer_id', userCustomerId);
      console.log(`[VIP Bookings API] Using customer_id filter: ${userCustomerId}`);
    } else {
      // If no customer_id, query only by user_id (profile_id) as fallback
      baseQuery = baseQuery.eq('user_id', profileId);
      console.log(`[VIP Bookings API] Using user_id filter: ${profileId}`);
    }

    // For future bookings, we need to fetch all records first, then sort by status, then paginate
    // This ensures confirmed bookings appear first across all pages
    let allBookingsData = [];
    let totalCount = 0;

    if (filter === 'future') {
      // Fetch ALL future bookings first (without pagination)
      let allFutureQuery = adminSupabase
        .from('bookings')
        .select('id, date, start_time, duration, bay, status, number_of_people, customer_notes, booking_type, created_at', { count: 'exact' });

      // Apply customer filtering - same logic as above
      if (userCustomerId) {
        allFutureQuery = allFutureQuery.eq('customer_id', userCustomerId);
      } else {
        allFutureQuery = allFutureQuery.eq('user_id', profileId);
      }

      // Apply future date/time filter
      allFutureQuery = allFutureQuery.or(`date.gt.${todayDate},and(date.eq.${todayDate},start_time.gte.${currentTime})`);

      const { data: allFutureBookings, error: futureError, count } = await allFutureQuery;

      if (futureError) {
        console.error('Error fetching future bookings:', futureError);
        return NextResponse.json({ error: 'Failed to fetch bookings.' }, { status: 500 });
      }

      allBookingsData = allFutureBookings || [];
      totalCount = count || 0;

      // Apply custom sorting: confirmed first, then by date/time
      allBookingsData.sort((a, b) => {
        // Prioritize 'confirmed' status
        if (a.status === 'confirmed' && b.status !== 'confirmed') {
          return -1; // a comes first
        }
        if (a.status !== 'confirmed' && b.status === 'confirmed') {
          return 1; // b comes first
        }

        // If both are 'confirmed' or both are not 'confirmed', sort by date and time
        const dateComparison = new Date(a.date).getTime() - new Date(b.date).getTime();
        if (dateComparison !== 0) {
          return dateComparison;
        }
        // If dates are the same, compare by start_time (HH:mm format)
        return a.start_time.localeCompare(b.start_time);
      });

      // Apply pagination manually after sorting
      allBookingsData = allBookingsData.slice(offset, offset + limit);

    } else {
      // For past and all bookings, use the original approach with database-level sorting
      if (filter === 'past') {
        const pastFilter = `date.lt.${todayDate},and(date.eq.${todayDate},start_time.lt.${currentTime})`;
        baseQuery = baseQuery.or(pastFilter)
                     .order('date', { ascending: false })
                     .order('start_time', { ascending: false });
        console.log(`[VIP Bookings API] Added past filter: ${pastFilter}`);
      } else { // 'all' or any other value
        baseQuery = baseQuery.order('date', { ascending: false }).order('start_time', { ascending: false });
        console.log(`[VIP Bookings API] Using 'all' filter - no date restriction`);
      }

      baseQuery = baseQuery.range(offset, offset + limit - 1);
      console.log(`[VIP Bookings API] Using pagination: offset ${offset}, limit ${limit}`);

      const { data: bookingsData, error, count } = await baseQuery;

      if (error) {
        console.error('[VIP Bookings API] Error fetching bookings:', error);
        return NextResponse.json({ error: 'Failed to fetch bookings.' }, { status: 500 });
      }

      console.log(`[VIP Bookings API] Query returned ${bookingsData?.length || 0} bookings, total count: ${count}`);
      if (bookingsData && bookingsData.length > 0) {
        console.log(`[VIP Bookings API] Sample booking:`, JSON.stringify(bookingsData[0], null, 2));
      }

      allBookingsData = bookingsData || [];
      totalCount = count || 0;
    }

    const processedBookingsData = allBookingsData;
    
    const bookings = processedBookingsData.map(b => ({
        id: b.id,
        date: b.date,
        startTime: b.start_time,
        duration: b.duration,
        bay: b.bay,
        status: b.status,
        numberOfPeople: b.number_of_people,
        notes: b.customer_notes,
        bookingType: b.booking_type,
        createdAt: b.created_at
    })) || [];

    const totalPages = Math.ceil(totalCount / limit);

    return NextResponse.json({
      bookings,
      pagination: {
        currentPage: page,
        totalPages,
        totalCount,
        limit,
      },
    });

  } catch (e) {
    console.error('Unexpected error in GET /api/vip/bookings:', e);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
} 