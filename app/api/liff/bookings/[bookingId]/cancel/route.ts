import { NextResponse, NextRequest } from 'next/server';
import { createAdminClient } from '@/utils/supabase/admin';
import { sendVipCancellationNotification } from '@/lib/lineNotifyService';
import type { NotificationBookingData } from '@/lib/lineNotifyService';
import { format } from 'date-fns';

interface CancelPayload {
  lineUserId: string;
  cancellation_reason?: string | null;
}

interface CancelRouteContextParams {
  bookingId: string;
}

interface CancelRouteContext {
  params: Promise<CancelRouteContextParams>;
}

/**
 * LIFF Booking Cancellation Endpoint
 * Allows LINE users to cancel their bookings via the LIFF membership page
 */
export async function POST(request: NextRequest, context: CancelRouteContext) {
  const params = await context.params;
  const { bookingId } = params;

  let payload: CancelPayload;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON payload' }, { status: 400 });
  }

  const { lineUserId, cancellation_reason } = payload;

  if (!lineUserId) {
    return NextResponse.json({ error: 'lineUserId is required' }, { status: 400 });
  }

  if (cancellation_reason !== undefined && cancellation_reason !== null && typeof cancellation_reason !== 'string') {
    return NextResponse.json({ error: 'cancellation_reason must be a string or null' }, { status: 400 });
  }

  const supabase = createAdminClient();

  try {
    // Get profile by LINE userId to find customer_id
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('id, display_name, email, customer_id')
      .eq('provider', 'line')
      .eq('provider_id', lineUserId)
      .single();

    if (profileError || !profile) {
      return NextResponse.json({ error: 'User profile not found' }, { status: 404 });
    }

    if (!profile.customer_id) {
      return NextResponse.json({ error: 'User account not linked to customer' }, { status: 403 });
    }

    // Fetch the booking
    const { data: currentBooking, error: fetchError } = await supabase
      .from('bookings')
      .select('*')
      .eq('id', bookingId)
      .single();

    if (fetchError || !currentBooking) {
      console.error(`[LIFF Cancel] Error fetching booking ${bookingId}:`, fetchError);
      return NextResponse.json({ error: 'Booking not found' }, { status: 404 });
    }

    // Check if user has access to this booking via customer_id
    if (currentBooking.customer_id !== profile.customer_id) {
      return NextResponse.json({ error: 'Access denied. You do not own this booking.' }, { status: 403 });
    }

    if (currentBooking.status === 'cancelled') {
      return NextResponse.json({
        success: true,
        message: 'Booking is already cancelled.',
        booking: currentBooking
      }, { status: 200 });
    }

    if (currentBooking.status !== 'confirmed') {
      return NextResponse.json({ error: 'Only confirmed bookings can be cancelled.' }, { status: 409 });
    }

    // Validate if the booking is in the future
    const [year, month, day] = currentBooking.date.split('-').map(Number);
    const [hours, minutes] = currentBooking.start_time.split(':').map(Number);
    const bookingDateTime = new Date(year, month - 1, day, hours, minutes);
    const currentDateTime = new Date();

    if (bookingDateTime.getTime() <= currentDateTime.getTime()) {
      return NextResponse.json({ error: 'Booking must be in the future to be cancelled.' }, { status: 409 });
    }

    // Fetch customer data for notifications
    let customerName: string | null = null;
    let customerPhone: string | null = null;
    let customerEmail: string | null = profile.email;

    const { data: customerData, error: customerError } = await supabase
      .from('customers')
      .select('customer_name, contact_number, email')
      .eq('id', profile.customer_id)
      .single();

    if (!customerError && customerData) {
      customerName = customerData.customer_name;
      customerPhone = customerData.contact_number;
      if (customerData.email) {
        customerEmail = customerData.email;
      }
    }

    // Update the booking
    const updatePayload = {
      status: 'cancelled',
      cancelled_by_type: 'user',
      cancelled_by_identifier: customerName || profile.display_name || 'LIFF User',
      cancellation_reason: cancellation_reason || null
    };

    const { data: cancelledBooking, error: updateError } = await supabase
      .from('bookings')
      .update(updatePayload)
      .eq('id', bookingId)
      .select('*')
      .single();

    if (updateError || !cancelledBooking) {
      console.error(`[LIFF Cancel] Error updating booking ${bookingId}:`, updateError);
      return NextResponse.json({ error: 'Failed to cancel booking' }, { status: 500 });
    }

    // Create booking history entry
    const oldBookingSnapshot = { ...currentBooking };
    const newBookingSnapshot = { ...cancelledBooking };

    let changesSummary = `Booking cancelled by LIFF user.`;
    if (cancellation_reason) {
      changesSummary += ` Reason: ${cancellation_reason}`;
    }

    const { error: historyError } = await supabase
      .from('booking_history')
      .insert({
        booking_id: bookingId,
        action_type: 'CANCEL_BOOKING_USER',
        changed_by_type: 'user',
        changed_by_identifier: lineUserId,
        changes_summary: changesSummary,
        old_booking_snapshot: oldBookingSnapshot,
        new_booking_snapshot: newBookingSnapshot,
        notes: cancellation_reason ? `Cancellation Reason: ${cancellation_reason}` : 'Cancelled by LIFF user'
      });

    if (historyError) {
      console.error(`[LIFF Cancel] Failed to create booking history for ${bookingId}:`, historyError);
    }

    // Prepare async notification tasks
    const asyncTasks: Promise<unknown>[] = [];

    // LINE notification
    const notificationData: NotificationBookingData = {
      id: cancelledBooking.id,
      name: customerName || profile.display_name || 'LIFF User',
      phone_number: customerPhone,
      date: cancelledBooking.date,
      start_time: cancelledBooking.start_time,
      duration: cancelledBooking.duration,
      bay: cancelledBooking.bay,
      number_of_people: cancelledBooking.number_of_people,
      customer_notes: cancelledBooking.customer_notes,
      cancelled_by_identifier: cancelledBooking.cancelled_by_identifier,
      cancellation_reason: cancelledBooking.cancellation_reason
    };

    asyncTasks.push(
      sendVipCancellationNotification(notificationData)
        .catch(err => console.error(`[LIFF Cancel] Error sending LINE notification for ${bookingId}:`, err))
    );

    // Email notification
    if (customerEmail) {
      const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
      const userName = customerName || profile.display_name || 'LIFF User';

      let endTime = '';
      try {
        const [h, m] = cancelledBooking.start_time.split(':').map(Number);
        const startDate = new Date();
        startDate.setHours(h, m, 0, 0);
        const endDate = new Date(startDate.getTime() + (cancelledBooking.duration * 60 * 60 * 1000));
        endTime = endDate.toTimeString().slice(0, 5);
      } catch {
        console.warn('[LIFF Cancel] Could not calculate end time');
      }

      const formattedDate = format(new Date(cancelledBooking.date), 'MMMM d, yyyy');

      asyncTasks.push(
        fetch(`${baseUrl}/api/notifications/email/cancellation`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email: customerEmail,
            userName,
            subjectName: userName,
            bookingId: cancelledBooking.id,
            bookingDate: formattedDate,
            startTime: cancelledBooking.start_time,
            endTime,
            duration: cancelledBooking.duration,
            numberOfPeople: cancelledBooking.number_of_people || 1,
            bayName: cancelledBooking.bay,
            cancellationReason: cancelledBooking.cancellation_reason
          }),
        })
          .then(async response => {
            if (!response.ok) {
              const body = await response.text();
              console.error(`[LIFF Cancel] Failed to send email for ${bookingId}:`, body);
            }
          })
          .catch(err => console.error(`[LIFF Cancel] Error sending email for ${bookingId}:`, err))
      );
    }

    // Fire and forget notifications
    setImmediate(() => {
      Promise.all(asyncTasks)
        .then(() => console.log(`[LIFF Cancel] All notifications sent for booking ${bookingId}`))
        .catch(err => console.error(`[LIFF Cancel] Notification error for ${bookingId}:`, err));
    });

    return NextResponse.json({
      success: true,
      message: 'Booking cancelled successfully.',
      booking: {
        id: cancelledBooking.id,
        date: cancelledBooking.date,
        startTime: cancelledBooking.start_time,
        duration: cancelledBooking.duration,
        numberOfPeople: cancelledBooking.number_of_people,
        status: cancelledBooking.status
      }
    });

  } catch (error) {
    console.error(`[LIFF Cancel] Unexpected error for booking ${bookingId}:`, error);
    return NextResponse.json({
      error: 'An unexpected error occurred.',
      details: error instanceof Error ? error.message : String(error)
    }, { status: 500 });
  }
}
