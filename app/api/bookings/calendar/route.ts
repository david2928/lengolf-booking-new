import { NextResponse } from 'next/server';
import { calendar } from '@/lib/googleApiConfig';
import { BOOKING_CALENDARS } from '@/lib/bookingCalendarConfig';
import { format, addHours, parse } from 'date-fns';
import { zonedTimeToUtc, formatInTimeZone } from 'date-fns-tz';
import { createClient } from '@/utils/supabase/server';
import { BAY_DISPLAY_NAMES, BAY_COLORS } from '@/lib/bayConfig';

const TIMEZONE = 'Asia/Bangkok';

async function findAvailableBay(startDateTime: Date, endDateTime: Date) {
  try {
    for (const [bay, calendarId] of Object.entries(BOOKING_CALENDARS)) {
      // Check if bay is available for the requested time slot
      const events = await calendar.events.list({
        calendarId,
        timeMin: formatInTimeZone(startDateTime, TIMEZONE, "yyyy-MM-dd'T'HH:mm:ssxxx"),
        timeMax: formatInTimeZone(endDateTime, TIMEZONE, "yyyy-MM-dd'T'HH:mm:ssxxx"),
        singleEvents: true,
        timeZone: TIMEZONE,
      });

      // If no events during this time slot, bay is available
      const hasConflict = (events.data.items || []).some(event => {
        const eventStart = new Date(event.start?.dateTime || '');
        const eventEnd = new Date(event.end?.dateTime || '');
        return startDateTime < eventEnd && endDateTime > eventStart;
      });

      if (!hasConflict) {
        return bay;
      }
    }
    return null;
  } catch (error) {
    console.error('Error checking bay availability:', error);
    throw error;
  }
}

export async function POST(request: Request) {
  try {
    // Create Supabase client and check session
    const supabase = await createClient();
    const { data: { user }, error: sessionError } = await supabase.auth.getUser();
    
    if (sessionError || !user) {
      return NextResponse.json(
        { error: 'Unauthorized', details: sessionError?.message },
        { status: 401 }
      );
    }

    const { bookingId, date, startTime, duration } = await request.json();

    if (!bookingId || !date || !startTime || !duration) {
      return NextResponse.json(
        { error: 'Missing required fields', details: { bookingId, date, startTime, duration } },
        { status: 400 }
      );
    }

    // Format start and end times with proper timezone handling
    const parsedDateTime = parse(`${date} ${startTime}`, 'yyyy-MM-dd HH:mm', new Date());
    const startDateTime = zonedTimeToUtc(parsedDateTime, TIMEZONE);
    const endDateTime = addHours(startDateTime, duration);

    // Find an available bay
    const availableBay = await findAvailableBay(startDateTime, endDateTime);
    if (!availableBay) {
      return NextResponse.json(
        { error: 'No bays available for the selected time slot', details: { date, startTime, duration } },
        { status: 400 }
      );
    }

    // Get the calendar ID for the selected bay
    const calendarId = BOOKING_CALENDARS[availableBay as keyof typeof BOOKING_CALENDARS];

    // Get booking details
    const { data: booking } = await supabase
      .from('bookings')
      .select('*')
      .eq('id', bookingId)
      .single();

    if (!booking) {
      return NextResponse.json(
        { error: 'Booking not found', details: { bookingId } },
        { status: 404 }
      );
    }

    // Get the display name for the bay
    const bayDisplayName = BAY_DISPLAY_NAMES[availableBay] || availableBay;

    // Create calendar event with proper timezone handling
    const event = {
      summary: `${user.user_metadata?.name || user.email} (${booking.phone_number}) (${booking.number_of_people}) - ${bayDisplayName}`,
      description: `Name: ${user.user_metadata?.name || user.email}\nEmail: ${user.email}\nPhone: ${booking.phone_number}\nPeople: ${booking.number_of_people}\nBooking ID: ${bookingId}`,
      colorId: BAY_COLORS[bayDisplayName],
      start: {
        dateTime: formatInTimeZone(startDateTime, TIMEZONE, "yyyy-MM-dd'T'HH:mm:ssxxx"),
        timeZone: TIMEZONE,
      },
      end: {
        dateTime: formatInTimeZone(endDateTime, TIMEZONE, "yyyy-MM-dd'T'HH:mm:ssxxx"),
        timeZone: TIMEZONE,
      },
    };

    const response = await calendar.events.insert({
      calendarId,
      requestBody: event,
    });

    if (response.status !== 200) {
      throw new Error(`Failed to create calendar event. Status: ${response.status}`);
    }

    return NextResponse.json({ 
      success: true, 
      eventId: response.data.id,
      bay: availableBay // Keep the simple bay name for the database
    });
  } catch (error) {
    console.error('Error creating calendar event:', error);
    return NextResponse.json(
      { 
        error: 'Failed to create calendar event', 
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
} 