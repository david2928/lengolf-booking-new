import { createClient } from '@supabase/supabase-js';
import type { Database } from '@/types/supabase';

interface RetryCalendarEvent {
  bookingId: string;
  maxRetries?: number;
  retryDelay?: number;
}

// Create Supabase client for calendar retry operations
function getSupabaseAdminClient() {
  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
        detectSessionInUrl: false
      }
    }
  );
}

/**
 * Retry failed calendar event creation with exponential backoff
 */
export async function retryFailedCalendarEvent({ 
  bookingId, 
  maxRetries = 3, 
  retryDelay = 5000 
}: RetryCalendarEvent): Promise<boolean> {
  const supabase = getSupabaseAdminClient();
  
  try {
    // Get booking details
    const { data: booking, error: bookingError } = await supabase
      .from('bookings')
      .select('*')
      .eq('id', bookingId)
      .single();

    if (bookingError || !booking) {
      console.error(`[Calendar Retry] Booking not found: ${bookingId}`, bookingError);
      return false;
    }

    // Only retry if calendar creation failed
    if (booking.google_calendar_sync_status !== 'failed' && booking.google_calendar_sync_status !== 'pending') {
      console.log(`[Calendar Retry] Booking ${bookingId} does not need retry (status: ${booking.google_calendar_sync_status})`);
      return true;
    }

    // If calendar events already exist, no need to retry
    if (booking.calendar_events && booking.calendar_events.length > 0) {
      console.log(`[Calendar Retry] Booking ${bookingId} already has calendar events`);
      
      // Update sync status to synced
      await supabase
        .from('bookings')
        .update({ google_calendar_sync_status: 'synced' })
        .eq('id', bookingId);
      
      return true;
    }

    console.log(`[Calendar Retry] Attempting to retry calendar creation for booking ${bookingId}`);

    // Prepare calendar data (similar to the original booking creation)
    const calendarData = {
      bookingId: booking.id,
      booking,
      customerName: booking.name, // Use booking name as fallback
      bayDisplayName: `Bay ${booking.bay?.split(' ')[1] || booking.bay}`,
      startDateTime: `${booking.date}T${booking.start_time}:00+07:00`,
      endDateTime: calculateEndDateTime(booking.date, booking.start_time, booking.duration),
      packageInfo: booking.package_name || 'Normal Bay Rate'
    };

    // Retry logic with exponential backoff
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        console.log(`[Calendar Retry] Attempt ${attempt}/${maxRetries} for booking ${bookingId}`);
        
        const response = await fetch(`${process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'}/api/bookings/calendar/create`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(calendarData),
          // Use longer timeout for retries
          signal: AbortSignal.timeout(90000) // 90 seconds
        });

        if (!response.ok) {
          throw new Error(`Calendar API responded with ${response.status}`);
        }

        const result = await response.json();
        
        if (result.calendarEventId) {
          // Success! Update booking with calendar event
          const calendarEvents = [{
            eventId: result.calendarEventId,
            calendarId: getCalendarIdForBay(booking.bay),
            status: "confirmed"
          }];

          await supabase
            .from('bookings')
            .update({ 
              calendar_events: calendarEvents,
              google_calendar_sync_status: 'synced'
            })
            .eq('id', bookingId);

          console.log(`[Calendar Retry] Successfully created calendar event for booking ${bookingId}`);
          return true;
        }
      } catch (error: any) {
        console.error(`[Calendar Retry] Attempt ${attempt} failed for booking ${bookingId}:`, error.message);
        
        if (attempt === maxRetries) {
          // Final attempt failed
          await supabase
            .from('bookings')
            .update({ google_calendar_sync_status: 'retry_failed' })
            .eq('id', bookingId);
          
          console.error(`[Calendar Retry] All retry attempts failed for booking ${bookingId}`);
          return false;
        }
        
        // Wait before next attempt (exponential backoff)
        const waitTime = retryDelay * Math.pow(2, attempt - 1);
        console.log(`[Calendar Retry] Waiting ${waitTime}ms before next attempt for booking ${bookingId}`);
        await new Promise(resolve => setTimeout(resolve, waitTime));
      }
    }

    return false;
  } catch (error: any) {
    console.error(`[Calendar Retry] Error retrying calendar for booking ${bookingId}:`, error);
    return false;
  }
}

/**
 * Calculate end date time for calendar event
 */
function calculateEndDateTime(date: string, startTime: string, durationHours: number): string {
  const start = new Date(`${date}T${startTime}:00+07:00`);
  const end = new Date(start.getTime() + (durationHours * 60 * 60 * 1000));
  return end.toISOString().replace('Z', '+07:00');
}

/**
 * Get calendar ID for a bay
 */
function getCalendarIdForBay(bay: string | null): string {
  const BOOKING_CALENDARS = {
    'Bay 1': process.env.BOOKING_CALENDAR_BAY1_ID!,
    'Bay 2': process.env.BOOKING_CALENDAR_BAY2_ID!,
    'Bay 3': process.env.BOOKING_CALENDAR_BAY3_ID!,
  };
  
  return BOOKING_CALENDARS[bay as keyof typeof BOOKING_CALENDARS] || BOOKING_CALENDARS['Bay 1'];
}

/**
 * Batch retry multiple failed calendar events
 */
export async function batchRetryFailedCalendarEvents(limit: number = 10): Promise<{ success: number; failed: number }> {
  const supabase = getSupabaseAdminClient();
  
  try {
    // Get bookings with failed calendar sync
    const { data: failedBookings, error } = await supabase
      .from('bookings')
      .select('id')
      .in('google_calendar_sync_status', ['failed', 'pending'])
      .is('calendar_events', null)
      .eq('status', 'confirmed')
      .limit(limit);

    if (error) {
      console.error('[Calendar Retry] Error fetching failed bookings:', error);
      return { success: 0, failed: 0 };
    }

    if (!failedBookings || failedBookings.length === 0) {
      console.log('[Calendar Retry] No failed bookings found');
      return { success: 0, failed: 0 };
    }

    console.log(`[Calendar Retry] Found ${failedBookings.length} bookings to retry`);

    let successCount = 0;
    let failedCount = 0;

    // Process bookings in parallel with a limit
    const CONCURRENT_LIMIT = 3;
    for (let i = 0; i < failedBookings.length; i += CONCURRENT_LIMIT) {
      const batch = failedBookings.slice(i, i + CONCURRENT_LIMIT);
      
      const results = await Promise.allSettled(
        batch.map(booking => retryFailedCalendarEvent({ bookingId: booking.id }))
      );

      results.forEach(result => {
        if (result.status === 'fulfilled' && result.value) {
          successCount++;
        } else {
          failedCount++;
        }
      });

      // Small delay between batches
      if (i + CONCURRENT_LIMIT < failedBookings.length) {
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }

    console.log(`[Calendar Retry] Batch completed: ${successCount} successful, ${failedCount} failed`);
    return { success: successCount, failed: failedCount };

  } catch (error: any) {
    console.error('[Calendar Retry] Error in batch retry:', error);
    return { success: 0, failed: 0 };
  }
} 