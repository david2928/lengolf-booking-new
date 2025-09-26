import { NextResponse, NextRequest } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/app/api/auth/options';
import { createServerClient } from '@/utils/supabase/server';
import { createAdminClient } from '@/utils/supabase/admin';

interface ModifyBookingRequest {
  date?: string;
  start_time?: string;
  duration?: number;
  number_of_people?: number;
  customer_notes?: string;
}

interface ModifyRouteContext {
  params: Promise<{ bookingId: string }>;
}

export async function PUT(request: NextRequest, context: ModifyRouteContext) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { bookingId } = await context.params;
  const supabase = createServerClient();
  const adminSupabase = createAdminClient();

  try {
    const body: ModifyBookingRequest = await request.json();
    const { date, start_time, duration, number_of_people, customer_notes } = body;

    // First get user's customer_id to check if they can access this booking
    const { data: userProfile, error: profileError } = await supabase
      .from('profiles')
      .select('customer_id')
      .eq('id', session.user.id)
      .single();

    if (profileError || !userProfile) {
      return NextResponse.json({ error: 'User profile not found' }, { status: 404 });
    }

    // Use admin client to fetch booking by ID, then verify access
    const { data: currentBooking, error: fetchError } = await adminSupabase
      .from('bookings')
      .select('*')
      .eq('id', bookingId)
      .single();

    if (fetchError || !currentBooking) {
      return NextResponse.json({ error: 'Booking not found' }, { status: 404 });
    }

    // Check if user has access to this booking (either by user_id or customer_id)
    const hasDirectAccess = currentBooking.user_id === session.user.id;
    const hasCustomerAccess = userProfile.customer_id && currentBooking.customer_id === userProfile.customer_id;
    
    if (!hasDirectAccess && !hasCustomerAccess) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    if (currentBooking.status !== 'confirmed') {
      return NextResponse.json({ error: 'Only confirmed bookings can be modified' }, { status: 409 });
    }

    // Check if booking is in the future
    const bookingDateTime = new Date(`${currentBooking.date}T${currentBooking.start_time}`);
    if (bookingDateTime <= new Date()) {
      return NextResponse.json({ error: 'Cannot modify past bookings' }, { status: 409 });
    }

    // Build update payload with only provided fields
    const updatePayload: Record<string, unknown> = {};
    if (date) updatePayload.date = date;
    if (start_time) updatePayload.start_time = start_time;
    if (duration) updatePayload.duration = duration;
    if (number_of_people) updatePayload.number_of_people = number_of_people;
    if (customer_notes !== undefined) updatePayload.customer_notes = customer_notes;

    if (Object.keys(updatePayload).length === 0) {
      return NextResponse.json({ error: 'No fields to update' }, { status: 400 });
    }

    // If date/time is being changed, check availability
    if (date || start_time || duration) {
      const checkDate = date || currentBooking.date;
      const checkStartTime = start_time || currentBooking.start_time;
      const checkDuration = duration || currentBooking.duration;

      const { data: conflictingBookings } = await adminSupabase
        .from('bookings')
        .select('id')
        .eq('date', checkDate)
        .eq('status', 'confirmed')
        .neq('id', bookingId)
        .gte('start_time', checkStartTime)
        .lt('start_time', `${parseInt(checkStartTime.split(':')[0]) + checkDuration}:${checkStartTime.split(':')[1]}`);

      if (conflictingBookings && conflictingBookings.length > 0) {
        return NextResponse.json({ error: 'Time slot not available' }, { status: 409 });
      }
    }

    // Update booking
    const { data: updatedBooking, error: updateError } = await adminSupabase
      .from('bookings')
      .update(updatePayload)
      .eq('id', bookingId)
      .select('*')
      .single();

    if (updateError) {
      return NextResponse.json({ error: 'Failed to update booking' }, { status: 500 });
    }

    // Log the change
    const changedFields = Object.keys(updatePayload).join(', ');
    await supabase
      .from('booking_history')
      .insert({
        booking_id: bookingId,
        action_type: 'MODIFY_BOOKING',
        changed_by_type: 'user',
        changed_by_identifier: session.user.id,
        changes_summary: `Modified fields: ${changedFields}`,
        old_booking_snapshot: currentBooking,
        new_booking_snapshot: updatedBooking,
        notes: `User modified booking via VIP portal`
      });

    return NextResponse.json({
      success: true,
      message: 'Booking updated successfully',
      booking: updatedBooking
    });

  } catch (error) {
    console.error('Error modifying booking:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}