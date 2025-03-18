import { NextRequest, NextResponse } from 'next/server';
import { getToken } from 'next-auth/jwt';
import { createServerClient } from '@/utils/supabase/server';
import { parse, addMinutes } from 'date-fns';
import { zonedTimeToUtc, formatInTimeZone } from 'date-fns-tz';

const TIMEZONE = 'Asia/Bangkok';

interface ScheduleReviewRequestBody {
  bookingId: string;
  userId: string;
  scheduledTime: string;
  provider: 'line' | 'email';
  contactInfo: string;
}

export async function POST(request: NextRequest) {
  try {
    // 1. Authenticate user
    const token = await getToken({ req: request as any });
    if (!token?.sub) {
      return NextResponse.json(
        { error: 'Unauthorized or session expired' },
        { status: 401 }
      );
    }

    // 2. Parse request body
    const body: ScheduleReviewRequestBody = await request.json();
    const { bookingId, userId, scheduledTime, provider, contactInfo } = body;

    // 3. Validate required fields
    if (!bookingId || !userId || !scheduledTime || !provider || !contactInfo) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    // 4. Create scheduled review request in database
    const supabase = createServerClient();
    const { data, error } = await supabase
      .from('scheduled_review_requests')
      .insert({
        booking_id: bookingId,
        user_id: userId,
        scheduled_time: scheduledTime,
        provider,
        contact_info: contactInfo,
        sent: false
      })
      .select()
      .single();

    if (error) {
      console.error('Error creating scheduled review request:', error);
      return NextResponse.json(
        { error: 'Failed to schedule review request' },
        { status: 500 }
      );
    }

    // 5. Return success response
    return NextResponse.json({
      success: true,
      scheduledReviewRequest: data
    });
  } catch (error) {
    console.error('Exception in scheduling review request:', error);
    return NextResponse.json(
      { error: 'An error occurred while scheduling the review request' },
      { status: 500 }
    );
  }
} 