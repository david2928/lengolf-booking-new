import { NextResponse, NextRequest } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/app/api/auth/options';
import { createClient } from '@supabase/supabase-js';
import type { Session as NextAuthSession, User as NextAuthUser } from 'next-auth';

interface VipBookingsSessionUser extends NextAuthUser {
  id: string;
}

interface VipBookingsSession extends NextAuthSession {
  accessToken?: string;
  user: VipBookingsSessionUser;
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
    let query = supabase
      .from('bookings_vip_staging')
      .select('id, date, start_time, duration, bay, status, number_of_people, customer_notes, booking_type, created_at', { count: 'exact' })
      .eq('user_id', profileId);

    const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD

    if (filter === 'future') {
      query = query.gte('date', today).order('date', { ascending: true }).order('start_time', { ascending: true });
    } else if (filter === 'past') {
      query = query.lt('date', today).order('date', { ascending: false }).order('start_time', { ascending: false });
    } else { // 'all' or any other value
      query = query.order('date', { ascending: false }).order('start_time', { ascending: false });
    }

    query = query.range(offset, offset + limit - 1);

    const { data: bookingsData, error, count } = await query;

    if (error) {
      console.error('Error fetching bookings:', error);
      return NextResponse.json({ error: 'Failed to fetch bookings.' }, { status: 500 });
    }
    
    const bookings = bookingsData?.map(b => ({
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

    const totalCount = count || 0;
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