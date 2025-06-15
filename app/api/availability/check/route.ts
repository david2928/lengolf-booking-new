import { NextResponse } from 'next/server';
import { getToken } from 'next-auth/jwt';
import type { NextRequest } from 'next/server';
import { createServerClient } from '@/utils/supabase/server';

export async function POST(request: NextRequest) {
  try {
    // 1. Authenticate via NextAuth
    const token = await getToken({ req: request as any });
    if (!token) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // 2. Parse request body
    const { date, startTime, duration } = await request.json();
    
    if (!date || !startTime || !duration) {
      return NextResponse.json({ 
        error: 'Missing required parameters', 
        available: false 
      }, { status: 400 });
    }

    // 3. Use native database function instead of Google Calendar
    const supabase = createServerClient();
    
    // Convert duration from hours to match database function expectation
    const durationHours = typeof duration === 'number' ? duration : parseFloat(duration);
    
    const { data: bayAvailability, error } = await supabase.rpc('check_all_bays_availability', {
      p_date: date,
      p_start_time: startTime,
      p_duration: durationHours
    });

    if (error) {
      console.error('Database function error:', error);
      return NextResponse.json(
        { error: 'An error occurred while checking bay availability', available: false },
        { status: 500 }
      );
    }

    // 4. Transform database response to match expected format
    if (!bayAvailability || typeof bayAvailability !== 'object') {
      return NextResponse.json({ 
        available: false, 
        message: 'No availability data returned' 
      });
    }

    // Find available bays
    const availableBays = Object.entries(bayAvailability)
      .filter(([_, isAvailable]) => isAvailable === true)
      .map(([bayName, _]) => bayName);
    
    if (availableBays.length === 0) {
      return NextResponse.json({ 
        available: false, 
        message: 'No bays available for the selected time slot' 
      });
    }

    // Return the first available bay
    return NextResponse.json({
      available: true,
      bay: availableBays[0],
      allAvailableBays: availableBays
    });
  } catch (error) {
    console.error('Error checking bay availability:', error);
    return NextResponse.json(
      { error: 'An error occurred while checking bay availability', available: false },
      { status: 500 }
    );
  }
} 