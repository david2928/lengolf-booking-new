import { NextRequest, NextResponse } from 'next/server';
import { calendar } from '@/lib/googleApiConfig';
import { BOOKING_CALENDARS } from '@/lib/bookingCalendarConfig';
import { format, parseISO } from 'date-fns';
import { formatInTimeZone } from 'date-fns-tz';
import { BAY_COLORS } from '@/lib/bayConfig';
import { createServerClient } from '@/utils/supabase/server';

const TIMEZONE = 'Asia/Bangkok';
const ENABLE_DETAILED_LOGGING = process.env.ENABLE_BOOKING_DETAILED_LOGGING === 'true';

interface CalendarResponse {
  data: {
    id: string;
    [key: string]: any;
  };
}

// Helper function to log calendar creation steps to Supabase
async function logCalendarCreationStep({
  bookingId,
  step,
  status,
  durationMs,
  metadata = {}
}: {
  bookingId: string;
  step: string;
  status: 'success' | 'error' | 'info';
  durationMs: number;
  metadata?: Record<string, any>;
}) {
  if (!ENABLE_DETAILED_LOGGING) return;
  
  try {
    const supabase = createServerClient();
    await supabase
      .from('booking_process_logs')
      .insert({
        booking_id: bookingId,
        user_id: '00000000-0000-0000-0000-000000000000', // System user as a fallback
        step,
        status,
        duration_ms: durationMs,
        total_duration_ms: durationMs, // For this endpoint, we just use the same value
        metadata
      });
  } catch (error) {
    // Don't let logging errors affect the calendar creation process
    console.error('Error logging calendar creation step:', error);
  }
}

export async function POST(request: NextRequest) {
  const startTime = Date.now();
  let bookingId = 'unknown';
  
  try {
    // Parse request body
    const requestData = await request.json();
    
    // Require full data for calendar creation
    if (!requestData.booking || !requestData.startDateTime || !requestData.endDateTime) {
      return NextResponse.json({ error: 'Missing required data for calendar event' }, { status: 400 });
    }
    
    // Extract data
    const { booking, customerName, bayDisplayName, startDateTime, endDateTime, packageInfo = 'Normal Bay Rate' } = requestData;
    
    // Set bookingId for logging
    bookingId = booking.id || requestData.bookingId || 'unknown';
    
    // Log the start of calendar creation
    if (ENABLE_DETAILED_LOGGING) {
      await logCalendarCreationStep({
        bookingId,
        step: 'Calendar API request started',
        status: 'info',
        durationMs: Date.now() - startTime,
        metadata: {
          bay: booking.bay,
          bayDisplayName,
          startDateTime,
          endDateTime
        }
      });
    }
    
    // Get calendar ID for the bay
    const bay = booking.bay || 'Bay 1';
    const calendarId = BOOKING_CALENDARS[bay as keyof typeof BOOKING_CALENDARS];
    
    if (!calendarId) {
      if (ENABLE_DETAILED_LOGGING) {
        await logCalendarCreationStep({
          bookingId,
          step: 'Calendar ID lookup',
          status: 'error',
          durationMs: Date.now() - startTime,
          metadata: { bay, error: 'Invalid bay ID' }
        });
      }
      return NextResponse.json({ error: 'Invalid bay ID' }, { status: 400 });
    }

    try {
      // Log input data for debugging
      console.log('Calendar event creation input:', {
        customerName,
        bookingName: booking.name,
        isSameName: customerName === booking.name
      });
      
      // For calendar title/summary: Use CRM customer name if available, otherwise booking name
      const calendarTitle = customerName !== booking.name ? customerName : booking.name;
      
      // For customer name in description: Use "New Customer" if no CRM mapping exists
      const descriptionCustomerName = customerName === booking.name ? 'New Customer' : customerName;
      
      console.log('Calendar event names used:', {
        calendarTitle,
        descriptionCustomerName
      });
      
      // Track time for Google Calendar API operation
      const calendarApiStart = Date.now();
      
      const calendarResponse = await calendar.events.insert({
        calendarId,
        requestBody: {
          summary: `${calendarTitle} (${booking.phone_number}) (${booking.number_of_people}) - ${packageInfo} at ${bayDisplayName}`,
          description: `Customer Name: ${descriptionCustomerName}
Booking Name: ${booking.name}
Contact: ${booking.phone_number}
Email: ${booking.email}
Type: ${packageInfo}
Pax: ${booking.number_of_people}
Bay: ${bayDisplayName}
Date: ${formatInTimeZone(parseISO(startDateTime), TIMEZONE, 'EEEE, MMMM d')}
Time: ${formatInTimeZone(parseISO(startDateTime), TIMEZONE, 'HH:mm')} - ${formatInTimeZone(parseISO(endDateTime), TIMEZONE, 'HH:mm')}
Via: Website
Booking ID: ${booking.id}`,
          start: {
            dateTime: startDateTime,
            timeZone: TIMEZONE
          },
          end: {
            dateTime: endDateTime,
            timeZone: TIMEZONE
          },
          colorId: BAY_COLORS[bayDisplayName as keyof typeof BAY_COLORS] || '1'
        }
      }) as CalendarResponse;
      
      const calendarApiDuration = Date.now() - calendarApiStart;
      const totalDuration = Date.now() - startTime;
      
      // Log successful calendar API operation
      if (ENABLE_DETAILED_LOGGING) {
        await logCalendarCreationStep({
          bookingId,
          step: 'Google Calendar API operation',
          status: 'success',
          durationMs: calendarApiDuration,
          metadata: {
            calendarId,
            calendarEventId: calendarResponse.data.id,
            apiDurationMs: calendarApiDuration
          }
        });
      }

      // Return success response with calendar event ID
      return NextResponse.json({
        success: true,
        bookingId: booking.id,
        calendarEventId: calendarResponse.data.id,
        processingTime: totalDuration
      });
    } catch (error: any) {
      console.error('Failed to create calendar event:', error);
      
      // Log Google Calendar API error
      if (ENABLE_DETAILED_LOGGING) {
        await logCalendarCreationStep({
          bookingId,
          step: 'Google Calendar API operation',
          status: 'error',
          durationMs: Date.now() - startTime,
          metadata: {
            error: error.message || 'Unknown error',
            errorCode: error.code || '',
            errorStatus: error.status || '',
            calendarId
          }
        });
      }
      
      return NextResponse.json(
        { error: 'Failed to create calendar event' },
        { status: 500 }
      );
    }
  } catch (error: any) {
    console.error('Error in calendar event creation:', error);
    
    // Log general error
    if (ENABLE_DETAILED_LOGGING) {
      await logCalendarCreationStep({
        bookingId,
        step: 'Calendar creation error',
        status: 'error',
        durationMs: Date.now() - startTime,
        metadata: {
          error: error.message || 'Unknown error'
        }
      });
    }
    
    return NextResponse.json(
      { error: 'An error occurred while creating the calendar event' },
      { status: 500 }
    );
  }
} 