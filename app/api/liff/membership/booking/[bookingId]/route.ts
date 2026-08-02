import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/utils/supabase/admin';
import { appCache } from '@/lib/cache';
import { parseBangkokDate } from '@/utils/date';
import { MIN_EDIT_NOTICE_HOURS, computeEditability, computeEndTime } from '@/lib/booking-edit-rules';

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

    // Check cache. `?fresh=1` bypasses it, which the edit flow uses on return:
    // the cache is per-lambda-instance, so an edit cannot reliably evict the
    // entry that serves the next request.
    const cacheKey = `booking_detail_${lineUserId}_${bookingId}`;
    const wantsFresh = searchParams.get('fresh') === '1';
    const cachedData = wantsFresh ? null : appCache.get(cacheKey);
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

    // Minute arithmetic, so a 1.5 h booking ends at 20:30 rather than at the
    // "20.5:00" that adding a fractional duration to the hour produces.
    const endTime = computeEndTime(booking.start_time, booking.duration);

    // Compute bay type
    const bayLower = (booking.bay || '').toLowerCase();
    const bayType = (bayLower.includes('ai') || bayLower === 'bay 4' || bayLower === 'bay_4')
      ? 'ai' : 'social';

    // `new Date(y, m-1, d, h, m)` builds the instant in the RUNTIME's zone, but
    // these are Bangkok wall-clock values — on Vercel (UTC) that made a booking
    // look future-dated for seven hours after it started, so a customer could
    // cancel a session they had already had. `parseBangkokDate` anchors at +07.
    const bookingDateTime = parseBangkokDate(booking.date, booking.start_time);
    const isCoaching = (booking.booking_type || '').toLowerCase().includes('coaching');
    const canCancel = booking.status === 'confirmed' && bookingDateTime.getTime() > Date.now() && !isCoaching;

    // Editing shares the cancel rules and adds no others today (the notice
    // window is zero), but it goes through the shared resolver so the button and
    // the endpoint can never disagree about who may edit.
    const editability = computeEditability({
      status: booking.status,
      date: booking.date,
      start_time: booking.start_time,
      booking_type: booking.booking_type,
    });

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
      canEdit: editability.canEdit,
      editBlockedReason: editability.reason ?? null,
      minEditNoticeHours: MIN_EDIT_NOTICE_HOURS,
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
