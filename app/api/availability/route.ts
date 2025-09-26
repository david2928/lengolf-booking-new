import { NextResponse } from 'next/server';
import { getToken } from 'next-auth/jwt';
import type { NextRequest } from 'next/server';
import { createServerClient } from '@/utils/supabase/server';

export async function POST(request: NextRequest) {
  try {
    // 1. Authenticate via NextAuth
    const token = await getToken({ req: request });
    if (!token) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // 2. Parse incoming JSON
    const body = await request.json();
    const { date, currentTimeInBangkok } = body;
    if (!date || !currentTimeInBangkok) {
      return NextResponse.json({ error: 'Invalid request parameters' }, { status: 400 });
    }

    // 3. Use native database function instead of Google Calendar
    const supabase = createServerClient();
    
    const { data: slots, error } = await supabase.rpc('get_available_slots_with_max_hours', {
      p_date: date,
      p_current_time_bangkok: currentTimeInBangkok,
      p_start_hour: 10,
      p_end_hour: 23
    });

    if (error) {
      console.error('Database function error:', error);
      return NextResponse.json({ error: 'Failed to fetch availability' }, { status: 500 });
    }

    return NextResponse.json({ slots: slots || [] });
  } catch (error) {
    console.error('Availability API error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
} 