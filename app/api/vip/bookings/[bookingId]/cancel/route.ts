import { NextResponse, NextRequest } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/app/api/auth/options';
import { createClient } from '@supabase/supabase-js';
import type { Session as NextAuthSession, User as NextAuthUser } from 'next-auth';
import { sendVipCancellationNotification } from '@/lib/lineNotifyService';
import type { NotificationBookingData } from '@/lib/lineNotifyService';
import { deleteCalendarEventForBooking } from '@/lib/calendarService';

// Define a type for our session that includes the accessToken and a well-defined user
interface VipBookingOpSessionUser extends NextAuthUser {
  id: string;
}
interface VipBookingOpSession extends NextAuthSession {
  accessToken?: string;
  user: VipBookingOpSessionUser;
}

interface CancelPayload {
  cancellation_reason?: string | null;
}

interface CancelRouteContextParams {
  bookingId: string;
}

interface CancelRouteContext {
  params: Promise<CancelRouteContextParams>;
}

export async function POST(request: NextRequest, context: CancelRouteContext) {
  const session = await getServerSession(authOptions) as VipBookingOpSession | null;

  if (!session?.user?.id || !session.accessToken) {
    return NextResponse.json({ error: 'Unauthorized or missing token' }, { status: 401 });
  }

  const profileId = session.user.id;
  const userAccessToken = session.accessToken; // Store for clarity
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    console.error('[VIP Booking Cancel API POST] Supabase URL or Anon Key is not set.');
    return NextResponse.json({ error: 'Server configuration error: Supabase connection details missing.' }, { status: 500 });
  }
  
  const params = await context.params;
  const { bookingId } = params;
  let payload: CancelPayload = {};

  // Try to parse payload, but make it optional for VIP user cancellation
  try {
    const requestBody = await request.text();
    if (requestBody) { // Only parse if there's a body
      payload = JSON.parse(requestBody);
      console.log('[VIP Cancel] Parsed payload:', payload);
    }
  } catch (error) {
    console.warn('[VIP Cancel] Could not parse JSON payload or no payload provided. Proceeding without cancellation_reason from payload.', error);
    // Do not error out, cancellation_reason is optional for user
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
      .select(`
        *, 
        profiles_vip_staging!inner (display_name)
      `)
      .eq('id', bookingId)
      .single();

    if (fetchError || !currentBooking) {
      console.error(`[VIP Cancel] Error fetching booking ${bookingId} or booking not found:`, fetchError);
      const status = fetchError?.code === 'PGRST116' || !currentBooking ? 404 : 500;
      const message = status === 404 ? `Booking with ID ${bookingId} not found or access denied.` : 'Failed to fetch booking details';
      return NextResponse.json({ error: message, details: fetchError?.message }, { status });
    }

    if (currentBooking.user_id !== profileId) {
      console.warn(`[VIP Cancel] RLS Mismatch/Forbidden: User ${profileId} attempted to cancel booking ${bookingId} owned by ${currentBooking.user_id}.`);
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
      console.log(`[VIP Cancel] Attempt to cancel booking ${bookingId} that is not in the future. Booking: ${bookingDateTime.toISOString()}, Current: ${currentDateTime.toISOString()}`);
      return NextResponse.json({ error: 'Booking must be in the future to be cancelled.' }, { status: 409 });
    }

    const updatePayload = {
      status: 'cancelled',
      cancelled_by_type: 'user', // User initiated cancellation
      cancelled_by_identifier: profileId, // VIP User's ID
      cancellation_reason: cancellationReason || null
    };

    const { data: cancelledBooking, error: updateError } = await supabaseUserClient
      .from('bookings_vip_staging')
      .update(updatePayload)
      .eq('id', bookingId)
      .select(`
        *,
        profiles_vip_staging (display_name, phone_number, vip_customer_data_id)
      `)
      .single();

    if (updateError || !cancelledBooking) {
      console.error(`[VIP Cancel] Supabase error updating booking ${bookingId} to cancelled:`, updateError);
      return NextResponse.json({ error: 'Failed to cancel booking in database', details: updateError?.message }, { status: 500 });
    }

    // Get phone number and email with priority: VIP customer data > profiles_vip_staging
    let finalPhoneNumber = (cancelledBooking.profiles_vip_staging as any)?.phone_number || null;
    let finalEmail = null;
    
    // If we have vip_customer_data_id, try to get phone and email from there
    const vipCustomerDataId = (cancelledBooking.profiles_vip_staging as any)?.vip_customer_data_id;
    if (vipCustomerDataId) {
      try {
        const { data: vipData } = await supabaseUserClient
          .from('vip_customer_data')
          .select('vip_phone_number, vip_email')
          .eq('id', vipCustomerDataId)
          .single();
        
        if (vipData?.vip_phone_number) {
          finalPhoneNumber = vipData.vip_phone_number;
        }
        if (vipData?.vip_email) {
          finalEmail = vipData.vip_email;
        }
      } catch (error) {
        console.warn('[VIP Cancel] Could not fetch VIP customer data:', error);
      }
    }
    
    // Fallback to profiles_vip_staging email if no VIP email
    if (!finalEmail) {
      try {
        const { data: profileData } = await supabaseUserClient
          .from('profiles_vip_staging')
          .select('email')
          .eq('id', profileId)
          .single();
        
        if (profileData?.email) {
          finalEmail = profileData.email;
        }
      } catch (error) {
        console.warn('[VIP Cancel] Could not fetch profile email:', error);
      }
    }
    
    const oldBookingSnapshot = { ...currentBooking };
    // Remove profiles_vip_staging from snapshots as it's a joined prop, not part of bookings table
    delete (oldBookingSnapshot as any).profiles_vip_staging;
    const newBookingSnapshotForHistory = { ...cancelledBooking };
    delete (newBookingSnapshotForHistory as any).profiles_vip_staging;

    let changesSummary = `Booking cancelled by user: ${profileId}.`;
    if (cancellationReason) {
      changesSummary += ` Reason: ${cancellationReason}`;
    }

    const historyEntry = {
      booking_id: bookingId,
      action_type: 'CANCEL_BOOKING_USER',
      changed_by_type: 'user',
      changed_by_identifier: profileId,
      changes_summary: changesSummary,
      old_booking_snapshot: oldBookingSnapshot,
      new_booking_snapshot: newBookingSnapshotForHistory,
      notes: cancellationReason ? `Cancellation Reason: ${cancellationReason}` : 'Cancelled by user'
    };

    const { error: historyError } = await supabaseUserClient
        .from('booking_history_vip_staging')
        .insert(historyEntry);

    if (historyError) {
        console.error(`[VIP Cancel] Failed to create booking history entry for ${bookingId}:`, JSON.stringify(historyError, null, 2));
    }

    // Prepare data for LINE notification
    const notificationData: NotificationBookingData = {
      id: cancelledBooking.id,
      name: (cancelledBooking.profiles_vip_staging as any)?.display_name || 'VIP User',
      phone_number: finalPhoneNumber,
      date: cancelledBooking.date,
      start_time: cancelledBooking.start_time,
      duration: cancelledBooking.duration,
      bay: cancelledBooking.bay,
      number_of_people: cancelledBooking.number_of_people,
      customer_notes: cancelledBooking.customer_notes,
      cancelled_by_identifier: cancelledBooking.cancelled_by_identifier,
      cancellation_reason: cancelledBooking.cancellation_reason
    };

    sendVipCancellationNotification(notificationData)
      .catch(err => console.error('[VIP Cancel] Failed to send VIP cancellation notification:', err));
    
    // Send cancellation email notification
    if (finalEmail) {
      const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
      const userName = (cancelledBooking.profiles_vip_staging as any)?.display_name || 'VIP User';
      
      // Calculate end time
      let endTime = '';
      try {
        const [hours, minutes] = cancelledBooking.start_time.split(':').map(Number);
        const startDate = new Date();
        startDate.setHours(hours, minutes, 0, 0);
        const endDate = new Date(startDate.getTime() + (cancelledBooking.duration * 60 * 60 * 1000));
        endTime = endDate.toTimeString().slice(0, 5); // HH:mm format
      } catch (error) {
        console.warn('[VIP Cancel] Could not calculate end time:', error);
      }
      
      const emailData = {
        email: finalEmail,
        userName,
        subjectName: userName,
        bookingId: cancelledBooking.id,
        bookingDate: cancelledBooking.date,
        startTime: cancelledBooking.start_time,
        endTime,
        duration: cancelledBooking.duration,
        numberOfPeople: cancelledBooking.number_of_people || 1,
        bayName: cancelledBooking.bay,
        cancellationReason: cancelledBooking.cancellation_reason
      };
      
      console.log('[VIP Cancel] Sending cancellation email to:', finalEmail, 'with data:', JSON.stringify(emailData, null, 2));
      
      fetch(`${baseUrl}/api/notifications/email/cancellation`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(emailData),
      })
      .then(async response => {
        const responseText = await response.text();
        if (response.ok) {
          console.log('[VIP Cancel] Cancellation email sent successfully:', responseText);
        } else {
          console.error('[VIP Cancel] Failed to send cancellation email. Status:', response.status, 'Response:', responseText);
        }
      })
      .catch(err => {
        console.error('[VIP Cancel] Failed to send cancellation email - network/fetch error:', err);
      });
    } else {
      console.warn('[VIP Cancel] No email address available for cancellation notification. finalEmail is:', finalEmail);
    }
    
    // Calendar deletion
    const googleCalendarEventId = currentBooking.calendar_events && currentBooking.calendar_events[0]?.eventId;
    const googleCalendarId = currentBooking.calendar_events && currentBooking.calendar_events[0]?.calendarId;

    // Ensure bay is also present as it is used in deleteCalendarEventForBooking
    if (googleCalendarEventId && googleCalendarId && currentBooking.bay) { 
      deleteCalendarEventForBooking(bookingId, googleCalendarEventId, currentBooking.bay)
        .catch(err => console.error('[VIP Cancel] Failed to delete calendar event:', err));
    } else {
        console.warn(`[VIP Cancel] Missing Google Calendar Event ID, Calendar ID, or bay for booking ${bookingId}, skipping calendar deletion. EventID: ${googleCalendarEventId}, CalendarID: ${googleCalendarId}, Bay: ${currentBooking.bay}`);
    }
    
    // The triggerCalendarUpdateForCancel seems to be from the example, not used in current VIP logic.
    // If needed, it can be added back.

    return NextResponse.json({ success: true, message: 'Booking cancelled successfully.', booking: cancelledBooking });

  } catch (error: any) {
    console.error(`[VIP Cancel] Unexpected error for booking ${bookingId}:`, error);
    return NextResponse.json({ error: 'An unexpected error occurred during cancellation.', details: error.message || String(error) }, { status: 500 });
  }
}

// Removed unused triggerCalendarUpdateForCancel from this file as it was from example

async function triggerCalendarUpdateForCancel(bookingId: string, details: any) {
  console.log(`ASYNC_TASK: Triggering Google Calendar update for booking CANCELLATION ${bookingId}`, details);
} 