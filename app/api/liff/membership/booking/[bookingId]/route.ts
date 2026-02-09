import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/utils/supabase/admin';
import { appCache } from '@/lib/cache';

const BOOKING_ID_REGEX = /^BK\d{6}[A-Za-z0-9]{4}$/;

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ bookingId: string }> }
) {
  try {
    const { bookingId } = await params;
    const searchParams = request.nextUrl.searchParams;
    const lineUserId = searchParams.get('lineUserId');

    if (!lineUserId) {
      return NextResponse.json(
        { error: 'lineUserId is required' },
        { status: 400 }
      );
    }

    if (!bookingId || !BOOKING_ID_REGEX.test(bookingId)) {
      return NextResponse.json(
        { error: 'Invalid booking ID format' },
        { status: 400 }
      );
    }

    // Check cache
    const cacheKey = `booking_detail_${lineUserId}_${bookingId}`;
    const cachedData = appCache.get(cacheKey);
    if (cachedData) {
      return NextResponse.json(cachedData, {
        headers: {
          'Cache-Control': 'private, max-age=30',
          'X-Cache': 'HIT'
        }
      });
    }

    const supabase = createAdminClient();

    // Get profile by LINE userId
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('id, customer_id')
      .eq('provider', 'line')
      .eq('provider_id', lineUserId)
      .maybeSingle();

    if (profileError) {
      console.error('[LIFF Booking Detail] Profile query error:', profileError);
      return NextResponse.json(
        { error: 'Database error' },
        { status: 500 }
      );
    }

    if (!profile || !profile.customer_id) {
      return NextResponse.json(
        { error: 'Account not linked' },
        { status: 404 }
      );
    }

    // Fetch the booking
    const { data: booking, error: bookingError } = await supabase
      .from('bookings')
      .select('id, date, start_time, duration, bay, status, number_of_people, customer_notes, package_id, booking_type, customer_id, created_at, cancellation_reason')
      .eq('id', bookingId)
      .maybeSingle();

    if (bookingError) {
      console.error('[LIFF Booking Detail] Booking query error:', bookingError);
      return NextResponse.json(
        { error: 'Database error' },
        { status: 500 }
      );
    }

    if (!booking) {
      return NextResponse.json(
        { error: 'Booking not found' },
        { status: 404 }
      );
    }

    // Verify ownership
    if (booking.customer_id !== profile.customer_id) {
      return NextResponse.json(
        { error: 'Access denied' },
        { status: 403 }
      );
    }

    // Compute end time
    const [hours, minutes] = booking.start_time.split(':').map(Number);
    const endHours = hours + booking.duration;
    const endTime = `${endHours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;

    // Compute bay type
    const bayLower = (booking.bay || '').toLowerCase();
    const bayType = (bayLower.includes('ai') || bayLower === 'bay 4' || bayLower === 'bay_4')
      ? 'ai' : 'social';

    // Check if booking can be cancelled
    const [year, month, day] = booking.date.split('-').map(Number);
    const [bHours, bMinutes] = booking.start_time.split(':').map(Number);
    const bookingDateTime = new Date(year, month - 1, day, bHours, bMinutes);
    const isCoaching = (booking.booking_type || '').toLowerCase().includes('coaching');
    const canCancel = booking.status === 'confirmed' && bookingDateTime.getTime() > Date.now() && !isCoaching;

    const responseData = {
      id: booking.id,
      date: booking.date,
      startTime: booking.start_time,
      endTime,
      duration: booking.duration,
      bay: booking.bay,
      bayType,
      status: booking.status,
      numberOfPeople: booking.number_of_people,
      notes: booking.customer_notes,
      packageId: booking.package_id,
      bookingType: booking.booking_type,
      createdAt: booking.created_at,
      cancellationReason: booking.cancellation_reason,
      canCancel,
    };

    // Cache for 30 seconds
    appCache.set(cacheKey, responseData, 30);

    return NextResponse.json(responseData, {
      headers: {
        'Cache-Control': 'private, max-age=30',
        'X-Cache': 'MISS'
      }
    });

  } catch (error) {
    console.error('[LIFF Booking Detail] Unexpected error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
