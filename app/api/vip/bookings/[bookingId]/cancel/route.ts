import { NextResponse, NextRequest } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/app/api/auth/options';
import { createClient } from '@supabase/supabase-js';
import type { Session as NextAuthSession, User as NextAuthUser } from 'next-auth';
import { sendVipCancellationNotification } from '@/lib/lineNotifyService';
import type { NotificationBookingData } from '@/lib/lineNotifyService';

import { format } from 'date-fns';

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
    console.error('Supabase configuration missing');
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
    }
  } catch (error) {
    console.warn('[VIP Cancel] Could not parse JSON payload or no payload provided. Proceeding without cancellation_reason from payload.');
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
      .from('bookings')
      .select(`
        *,
        profiles!inner (display_name)
      `)
      .eq('id', bookingId)
      .single();

    if (fetchError || !currentBooking) {
      console.error(`Error fetching booking ${bookingId}:`, fetchError);
      const status = fetchError?.code === 'PGRST116' || !currentBooking ? 404 : 500;
      const message = status === 404 ? `Booking with ID ${bookingId} not found or access denied.` : 'Failed to fetch booking details';
      return NextResponse.json({ error: message, details: fetchError?.message }, { status });
    }

    if (currentBooking.user_id !== profileId) {
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
      return NextResponse.json({ error: 'Booking must be in the future to be cancelled.' }, { status: 409 });
    }

    const updatePayload = {
      status: 'cancelled',
      cancelled_by_type: 'user',
      cancelled_by_identifier: (currentBooking.profiles as any)?.display_name || 'Customer', // Customer's display name
      cancellation_reason: cancellationReason || null
    };

    // Use admin client for the booking update to avoid schema permission issues
    // The check_new_customer trigger tries to access pos.lengolf_sales which requires elevated permissions
    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const { data: cancelledBooking, error: updateError } = await supabaseAdmin
      .from('bookings')
      .update(updatePayload)
      .eq('id', bookingId)
      .eq('user_id', profileId) // Ensure user can only cancel their own bookings
      .select(`
        *,
        profiles (display_name, phone_number, vip_customer_data_id)
      `)
      .single();

    if (updateError || !cancelledBooking) {
      console.error(`Supabase error updating booking ${bookingId} to cancelled:`, updateError);
      return NextResponse.json({ error: 'Failed to cancel booking in database', details: updateError?.message }, { status: 500 });
    }

    // Get phone number and email with priority: VIP customer data > profiles
    let finalPhoneNumber = (cancelledBooking.profiles as any)?.phone_number || null;
    let finalEmail = null;
    
    // Check if user has VIP customer data for enhanced contact info
    const vipCustomerDataId = (cancelledBooking.profiles as any)?.vip_customer_data_id;
    if (vipCustomerDataId) {
      const { data: vipData, error: vipError } = await supabaseUserClient
        .from('vip_customer_data')
        .select('vip_phone_number, vip_email')
        .eq('id', vipCustomerDataId)
        .single();

      if (!vipError && vipData) {
        // Use VIP phone number if available, otherwise keep profiles phone
        if (vipData.vip_phone_number) {
          finalPhoneNumber = vipData.vip_phone_number;
        }
        finalEmail = vipData.vip_email;
      }
    }
    
    // Fallback to profiles email if no VIP email
    if (!finalEmail) {
      const { data: profileData, error: profileError } = await supabaseUserClient
        .from('profiles')
        .select('email')
        .eq('id', profileId)
        .single();

      if (!profileError && profileData) {
        finalEmail = profileData.email;
      }
    }
    
    const oldBookingSnapshot = { ...currentBooking };
    // Remove profiles from snapshots as it's a joined prop, not part of bookings table
    delete (oldBookingSnapshot as any).profiles;
    const newBookingSnapshotForHistory = { ...cancelledBooking };
    delete (newBookingSnapshotForHistory as any).profiles;

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
        .from('booking_history')
        .insert(historyEntry);

    if (historyError) {
        console.error(`[VIP Cancel] Failed to create booking history entry for ${bookingId}:`, historyError);
    }

    // Prepare data for LINE notification
    const notificationData: NotificationBookingData = {
      id: cancelledBooking.id,
      name: (cancelledBooking.profiles as any)?.display_name || 'VIP User',
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

    // Prepare async tasks for notifications and calendar operations
    const asyncTasks: Promise<any>[] = [];

    // LINE notification task
    asyncTasks.push(
      sendVipCancellationNotification(notificationData)
        .catch(err => console.error(`[VIP Cancel] Error sending VIP cancellation LINE notification for ${bookingId}:`, err))
    );
    
    // Email notification task
    if (finalEmail) {
      const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
      const userName = (cancelledBooking.profiles as any)?.display_name || 'VIP User';
      
      // Calculate end time
      let endTimeCalc = ''; // Renamed to avoid conflict
      try {
        const [hours, minutes] = cancelledBooking.start_time.split(':').map(Number);
        const startDate = new Date(); // Use a relevant date if needed, or just for time calculation
        startDate.setHours(hours, minutes, 0, 0);
        const endDate = new Date(startDate.getTime() + (cancelledBooking.duration * 60 * 60 * 1000));
        endTimeCalc = endDate.toTimeString().slice(0, 5); // HH:mm format
      } catch (error) {
        console.warn('Could not calculate end time:', error);
      }
      
      // Format date to match booking confirmation email format (e.g., "May 26, 2025")
      const formattedDate = format(new Date(cancelledBooking.date), 'MMMM d, yyyy');
      
      const emailPayload = { // Renamed for clarity
        email: finalEmail,
        userName,
        subjectName: userName, // subjectName will be the same as userName
        bookingId: cancelledBooking.id,
        bookingDate: formattedDate, // Use formatted date to match booking confirmation
        startTime: cancelledBooking.start_time,
        endTime: endTimeCalc,
        duration: cancelledBooking.duration,
        numberOfPeople: cancelledBooking.number_of_people || 1,
        bayName: cancelledBooking.bay, // Ensure bayName is populated correctly
        cancellationReason: cancelledBooking.cancellation_reason
      };
      
      const emailUrl = `${baseUrl}/api/notifications/email/cancellation`;
      
      asyncTasks.push(
        fetch(emailUrl, {
          method: 'POST',
          headers: { 
            'Content-Type': 'application/json',
            'Cache-Control': 'no-cache'
          },
          body: JSON.stringify(emailPayload),
        })
        .then(async response => {
          if (!response.ok) {
            const responseBody = await response.text();
            console.error(`[VIP Cancel] Failed to send cancellation email for ${bookingId}:`, responseBody);
          }
        })
        .catch(err => {
          console.error(`[VIP Cancel] Error sending cancellation email for ${bookingId}:`, err);
        })
      );
    } else {
      console.warn('[VIP Cancel] No email address available for cancellation notification');
    }
    
    // Calendar integration has been removed

    // Execute all async tasks in parallel (truly non-blocking - fire and forget)
    setImmediate(() => {
      Promise.all(asyncTasks)
        .then(() => console.log(`[VIP Cancel] All async tasks completed for booking ${bookingId}`))
        .catch(err => console.error(`[VIP Cancel] Error in async tasks for booking ${bookingId}:`, err));
    });
    
    // Return immediately without waiting for async tasks
    return NextResponse.json({ success: true, message: 'Booking cancelled successfully.', booking: cancelledBooking });

  } catch (error: any) {
    console.error(`Unexpected error for booking ${bookingId}:`, error);
    return NextResponse.json({ error: 'An unexpected error occurred during cancellation.', details: error.message || String(error) }, { status: 500 });
  }
}

 