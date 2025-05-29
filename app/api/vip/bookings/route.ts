import { NextResponse, NextRequest } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/app/api/auth/options';
import { createClient } from '@supabase/supabase-js';
import type { Session as NextAuthSession, User as NextAuthUser } from 'next-auth';
import { formatInTimeZone } from 'date-fns-tz';

interface VipBookingsSessionUser extends NextAuthUser {
  id: string;
}

interface VipBookingsSession extends NextAuthSession {
  accessToken?: string;
  user: VipBookingsSessionUser;
}

// Helper function to safely execute Supabase queries
async function safeSupabaseQuery(query: any) {
  const { data, error } = await query;
  if (error) {
    console.error('Supabase query error:', error);
    // Decide if you want to throw or return null/error object
    // For this context, returning null might be simpler to handle in the main logic
    return null; 
  }
  return data;
}

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions) as VipBookingsSession | null;

  if (!session?.user?.id || !session.accessToken) {
    return NextResponse.json({ error: 'Unauthorized or missing token' }, { status: 401 });
  }

  const profileId = session.user.id;
  const userAccessToken = session.accessToken;
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    console.error('[VIP Bookings API GET] Supabase URL or Anon Key is not set.');
    return NextResponse.json({ error: 'Server configuration error: Supabase connection details missing.' }, { status: 500 });
  }

  // Add detailed logging for profileId being processed
  // console.log(`[VIP Bookings API GET] Processing request for profileId: ${profileId}`);

  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    global: {
      headers: {
        Authorization: `Bearer ${userAccessToken}`
      }
    }
  });

  const { searchParams } = new URL(request.url);
  const page = parseInt(searchParams.get('page') || '1', 10);
  const limit = parseInt(searchParams.get('limit') || '10', 10);
  const filter = searchParams.get('filter') || 'all'; // 'future', 'past', 'all'

  const offset = (page - 1) * limit;

  try {
    let userStableHashId: string | null = null;

    // Get current date and time in Asia/Bangkok
    const nowInBangkok = new Date();
    const serverTimeZone = 'Asia/Bangkok';
    const todayDate = formatInTimeZone(nowInBangkok, serverTimeZone, 'yyyy-MM-dd');
    const currentTime = formatInTimeZone(nowInBangkok, serverTimeZone, 'HH:mm');
    
    // console.log(`[VIP Bookings API GET] Current server datetime in ${serverTimeZone}: ${todayDate} ${currentTime}`);

    // 1. Try to get stable_hash_id from profiles -> vip_customer_data
    const profileData = await safeSupabaseQuery(
      supabase
        .from('profiles')
        .select('vip_customer_data_id')
        .eq('id', profileId)
        .single()
    );

    if (profileData && profileData.vip_customer_data_id) {
      const vipCustomerData = await safeSupabaseQuery(
        supabase
          .from('vip_customer_data')
          .select('stable_hash_id')
          .eq('id', profileData.vip_customer_data_id)
          .single()
      );
      if (vipCustomerData && vipCustomerData.stable_hash_id) {
        userStableHashId = vipCustomerData.stable_hash_id;
      }
    }

    // 2. If not found, try to get from crm_customer_mapping
    if (!userStableHashId) {
      const crmMappingData = await safeSupabaseQuery(
        supabase
          .from('crm_customer_mapping')
          .select('stable_hash_id, is_matched')
          .eq('profile_id', profileId)
          .single()
      );
      if (crmMappingData && crmMappingData.is_matched && crmMappingData.stable_hash_id) {
        userStableHashId = crmMappingData.stable_hash_id;
      }
    }

    // 3. Query bookings using stable_hash_id OR profile_id
    // Build query to search both by stable_hash_id (if available) and by user_id (profile_id)
    let baseQuery = supabase
      .from('bookings')
      .select('id, date, start_time, duration, bay, status, number_of_people, customer_notes, booking_type, created_at', { count: 'exact' });

    // Query by stable_hash_id AND/OR user_id to capture bookings from before and after CRM matching
    if (userStableHashId) {
      // If user has stable_hash_id, query both by stable_hash_id AND user_id to get all bookings
      baseQuery = baseQuery.or(`stable_hash_id.eq.${userStableHashId},user_id.eq.${profileId}`);
    } else {
      // If no stable_hash_id, query only by user_id (profile_id)
      baseQuery = baseQuery.eq('user_id', profileId);
    }

    // For future bookings, we need to fetch all records first, then sort by status, then paginate
    // This ensures confirmed bookings appear first across all pages
    let allBookingsData = [];
    let totalCount = 0;

    if (filter === 'future') {
      // Fetch ALL future bookings first (without pagination)
      const allFutureQuery = supabase
        .from('bookings')
        .select('id, date, start_time, duration, bay, status, number_of_people, customer_notes, booking_type, created_at', { count: 'exact' });

      // Apply user filtering - same logic as above
      if (userStableHashId) {
        allFutureQuery.or(`stable_hash_id.eq.${userStableHashId},user_id.eq.${profileId}`);
      } else {
        allFutureQuery.eq('user_id', profileId);
      }

      // Apply future date/time filter
      allFutureQuery.or(`date.gt.${todayDate},and(date.eq.${todayDate},start_time.gte.${currentTime})`);

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
        baseQuery = baseQuery.or(`date.lt.${todayDate},and(date.eq.${todayDate},start_time.lt.${currentTime})`)
                     .order('date', { ascending: false })
                     .order('start_time', { ascending: false });
      } else { // 'all' or any other value
        baseQuery = baseQuery.order('date', { ascending: false }).order('start_time', { ascending: false });
      }

      baseQuery = baseQuery.range(offset, offset + limit - 1);

      const { data: bookingsData, error, count } = await baseQuery;

      if (error) {
        console.error('Error fetching bookings:', error);
        return NextResponse.json({ error: 'Failed to fetch bookings.' }, { status: 500 });
      }

      allBookingsData = bookingsData || [];
      totalCount = count || 0;
    }

    let processedBookingsData = allBookingsData;
    
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