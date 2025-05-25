import { NextResponse, NextRequest } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/app/api/auth/options';
import { createClient } from '@supabase/supabase-js';
import type { Session as NextAuthSession, User as NextAuthUser } from 'next-auth';
import { sendVipCancellationNotification } from '@/lib/lineNotifyService';
import type { NotificationBookingData } from '@/lib/lineNotifyService';
import { deleteCalendarEventForBooking } from '@/lib/calendarService';
// import { callAvailabilityCheck } from '@/lib/availabilityService'; // Placeholder for actual availability check call
// import { triggerCalendarUpdate, triggerStaffNotification } from '@/lib/notificationService'; // Placeholders

// Define a type for our session that includes the accessToken and a well-defined user
interface VipBookingOpSessionUser extends NextAuthUser {
  id: string;
}
interface VipBookingOpSession extends NextAuthSession {
  accessToken?: string;
  user: VipBookingOpSessionUser;
}

// Interface for the cancellation payload
interface CancelPayload {
  cancellation_reason?: string | null;
}

interface ModifyRouteContextParams {
  bookingId: string;
}

interface ModifyRouteContext {
  params: Promise<ModifyRouteContextParams>;
}

// Helper to map Bay Name (e.g., "Bay 1") to bay_id (e.g., "bay_1")
// This is a simplistic assumption, a more robust mapping might be needed
// based on how BOOKING_CALENDARS keys are structured or if a separate mapping exists.
function mapBayNameToBayId(bayName: string): string {
  return bayName.toLowerCase().replace(' ', '_');
}

async function triggerCalendarUpdate(bookingId: string, details: any) {
  // Placeholder: Implement actual Google Calendar update logic (VIP-BE-013)
  console.log(`ASYNC_TASK: Triggering Google Calendar update for booking ${bookingId}`, details);
}

async function triggerStaffNotification(bookingId: string, details: any) {
  // Placeholder: Implement actual Staff Notification logic (VIP-BE-012)
  console.log(`ASYNC_TASK: Triggering Staff Notification for booking ${bookingId}`, details);
}

// Changed from PUT to POST
export async function POST(request: NextRequest, context: ModifyRouteContext) {
  const session = await getServerSession(authOptions) as VipBookingOpSession | null;

  if (!session?.user?.id || !session.accessToken) {
    return NextResponse.json({ error: 'Unauthorized or missing token' }, { status: 401 });
  }

  const profileId = session.user.id;
  const userAccessToken = session.accessToken;
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    console.error('[VIP Booking Modify(Cancel) API POST] Supabase URL or Anon Key is not set.');
    return NextResponse.json({ error: 'Server configuration error: Supabase connection details missing.' }, { status: 500 });
  }
  
  const params = await context.params;
  const { bookingId } = params;
  let payload: CancelPayload = {};

  try {
    const requestBody = await request.text();
    if (requestBody) {
      payload = JSON.parse(requestBody);
      console.log('[VIP Modify(Cancel)] Parsed payload:', payload);
    }
  } catch (error) {
    console.warn('[VIP Modify(Cancel)] Could not parse JSON payload or no payload provided. Proceeding without cancellation_reason.', error);
  }

  const cancellationReason = payload.cancellation_reason;
  if (cancellationReason !== undefined && cancellationReason !== null && typeof cancellationReason !== 'string') {
    return NextResponse.json({ error: 'cancellation_reason must be a string or null if provided' }, { status: 400 });
  }
  
  const supabaseUserClient = createClient(supabaseUrl, supabaseAnonKey, {
    global: {
      headers: {
        Authorization: `Bearer ${userAccessToken}`
      }
    }
  });

  try {
    const { data: currentBooking, error: fetchError } = await supabaseUserClient
      .from('bookings_vip_staging')
      .select('*') // Select all fields for oldBookingSnapshot and pre-checks
      .eq('id', bookingId)
      .single();

    if (fetchError || !currentBooking) {
      console.error(`[VIP Modify(Cancel)] Error fetching booking ${bookingId} or booking not found:`, JSON.stringify(fetchError, null, 2));
      const status = fetchError?.code === 'PGRST116' || !currentBooking ? 404 : 500;
      const message = status === 404 ? `Booking with ID ${bookingId} not found or access denied.` : 'Failed to fetch booking details';
      return NextResponse.json({ error: message, details: fetchError?.message }, { status });
    }

    if (currentBooking.user_id !== profileId) {
      console.warn(`[VIP Modify(Cancel)] RLS Mismatch/Forbidden: User ${profileId} attempted to cancel booking ${bookingId} owned by ${currentBooking.user_id}.`);
      return NextResponse.json({ error: 'Access denied. You do not own this booking.' }, { status: 403 });
    }
    
    if (currentBooking.status === 'cancelled') {
      return NextResponse.json({ message: `Booking ${bookingId} is already cancelled.`, booking: currentBooking }, { status: 200 });
    }

    if (currentBooking.status !== 'confirmed') {
      return NextResponse.json({ error: 'Only confirmed bookings can be cancelled.' }, { status: 409 });
    }

    // Validate if the booking is in the future considering both date and time
    const [year, month, day] = currentBooking.date.split('-').map(Number);
    const [hours, minutes] = currentBooking.start_time.split(':').map(Number);
    
    // Construct Date object for the exact booking date and time in server's local timezone
    const bookingDateTime = new Date(year, month - 1, day, hours, minutes);
    const currentDateTime = new Date(); // Current date and time

    if (bookingDateTime.getTime() <= currentDateTime.getTime()) {
      console.log(`[VIP Modify(Cancel)] Attempt to cancel booking ${bookingId} that is not in the future. Booking: ${bookingDateTime.toISOString()}, Current: ${currentDateTime.toISOString()}`);
      return NextResponse.json({ error: 'Booking must be in the future to be cancelled.' }, { status: 409 });
    }

    const updatePayload = {
      status: 'cancelled',
      cancelled_by_type: 'user',
      cancelled_by_identifier: profileId,
      cancellation_reason: cancellationReason || null
    };

    const { data: cancelledBooking, error: updateError } = await supabaseUserClient
      .from('bookings_vip_staging')
      .update(updatePayload)
      .eq('id', bookingId)
      .select(`
        *,
        profiles_vip_staging (display_name, phone_number)
      `)
      .single();

    if (updateError || !cancelledBooking) {
      console.error(`[VIP Modify(Cancel)] Supabase error updating booking ${bookingId} to cancelled:`, JSON.stringify(updateError, null, 2));
      return NextResponse.json({ error: 'Failed to cancel booking in database', details: updateError?.message }, { status: 500 });
    }
    
    const oldBookingSnapshot = { ...currentBooking };
    const newBookingSnapshotForHistory = { ...cancelledBooking };
    delete (newBookingSnapshotForHistory as any).profiles_vip_staging; // Remove joined data before history insert

    let changesSummary = `Booking cancelled by user (via modify endpoint): ${profileId}.`;
    if (cancellationReason) {
      changesSummary += ` Reason: ${cancellationReason}`;
    }

    const historyEntry = {
      booking_id: bookingId,
      action_type: 'CANCEL_BOOKING_USER_VIA_MODIFY',
      changed_by_type: 'user',
      changed_by_identifier: profileId,
      changes_summary: changesSummary,
      old_booking_snapshot: oldBookingSnapshot,
      new_booking_snapshot: newBookingSnapshotForHistory,
      notes: cancellationReason ? `Cancellation Reason: ${cancellationReason}` : 'Cancelled by user via modify endpoint'
    };

    const { error: historyError } = await supabaseUserClient
        .from('booking_history_vip_staging')
        .insert(historyEntry);

    if (historyError) {
        console.error(`[VIP Modify(Cancel)] Failed to create booking history entry for ${bookingId}:`, JSON.stringify(historyError, null, 2));
    }

    const notificationData: NotificationBookingData = {
      id: cancelledBooking.id,
      name: (cancelledBooking.profiles_vip_staging as any)?.display_name || 'VIP User',
      phone_number: (cancelledBooking.profiles_vip_staging as any)?.phone_number || null,
      date: cancelledBooking.date,
      start_time: cancelledBooking.start_time,
      duration: cancelledBooking.duration,
      bay: cancelledBooking.bay,
      number_of_people: cancelledBooking.number_of_people,
      customer_notes: cancelledBooking.customer_notes,
      cancelled_by_identifier: cancelledBooking.cancelled_by_identifier,
      cancellation_reason: cancelledBooking.cancellation_reason
    };

    // Prepare async tasks for notifications and calendar operations
    const asyncTasks = [];

    // LINE notification task
    asyncTasks.push(
      sendVipCancellationNotification(notificationData)
        .catch(err => console.error('[VIP Modify(Cancel)] Failed to send VIP cancellation notification:', err))
    );
    
    // Calendar deletion task
    const googleCalendarEventId = currentBooking.calendar_events?.google_calendar_event_id;
    if (googleCalendarEventId && currentBooking.bay) {
      asyncTasks.push(
        deleteCalendarEventForBooking(bookingId, googleCalendarEventId, currentBooking.bay)
          .catch(err => console.error('[VIP Modify(Cancel)] Failed to delete calendar event:', err))
      );
    } else {
        console.warn(`[VIP Modify(Cancel)] Missing Google Calendar Event ID or bay for booking ${bookingId}, skipping calendar deletion.`);
    }

    // Execute all async tasks in parallel (non-blocking)
    Promise.all(asyncTasks)
      .then(() => console.log(`[VIP Modify(Cancel)] All async tasks completed for booking ${bookingId}`))
      .catch(err => console.error(`[VIP Modify(Cancel)] Error in async tasks for booking ${bookingId}:`, err));
    
    return NextResponse.json({ 
        success: true, 
        message: 'Booking cancelled successfully (simulated modify).',
        booking: cancelledBooking 
    });

  } catch (error: any) {
    console.error(`[VIP Modify(Cancel)] Unexpected error for booking ${bookingId}:`, JSON.stringify(error, null, 2));
    return NextResponse.json({ error: 'An unexpected error occurred during cancellation.', details: error.message || String(error) }, { status: 500 });
  }
} 