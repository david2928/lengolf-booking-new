import { NextRequest, NextResponse } from 'next/server';
import { calendar } from '@/lib/googleApiConfig';
import { BOOKING_CALENDARS } from '@/lib/bookingCalendarConfig';
import { parse, addHours, isAfter } from 'date-fns';
import { zonedTimeToUtc, formatInTimeZone } from 'date-fns-tz';

const TIMEZONE = 'Asia/Bangkok';

export async function POST(request: NextRequest) {
  try {
    // Parse request body
    const { date, startTime, duration } = await request.json();
    
    if (!date || !startTime || !duration) {
      return NextResponse.json({ 
        error: 'Missing required parameters', 
        available: false 
      }, { status: 400 });
    }

    // Format date and time
    const parsedDateTime = parse(`${date} ${startTime}`, 'yyyy-MM-dd HH:mm', new Date());
    const startDateTime = zonedTimeToUtc(parsedDateTime, TIMEZONE);
    const endDateTime = addHours(startDateTime, duration);

    // Check availability for all bays
    const bayAvailability = await Promise.all(
      Object.entries(BOOKING_CALENDARS).map(async ([bay, calendarId]) => {
        try {
          const events = await calendar.events.list({
            calendarId,
            timeMin: formatInTimeZone(startDateTime, TIMEZONE, "yyyy-MM-dd'T'HH:mm:ssxxx"),
            timeMax: formatInTimeZone(endDateTime, TIMEZONE, "yyyy-MM-dd'T'HH:mm:ssxxx"),
            singleEvents: true,
            orderBy: 'startTime',
          });

          return {
            bay,
            available: !events.data.items || events.data.items.length === 0
          };
        } catch (error) {
          console.error(`Error checking availability for bay ${bay}:`, error);
          return { bay, available: false };
        }
      })
    );

    // Find available bays
    const availableBays = bayAvailability.filter(bay => bay.available);
    
    if (availableBays.length === 0) {
      return NextResponse.json({ 
        available: false, 
        message: 'No bays available for the selected time slot' 
      });
    }

    // Return the first available bay
    return NextResponse.json({
      available: true,
      bay: availableBays[0].bay,
      allAvailableBays: availableBays.map(b => b.bay)
    });
  } catch (error) {
    console.error('Error checking bay availability:', error);
    return NextResponse.json(
      { error: 'An error occurred while checking bay availability', available: false },
      { status: 500 }
    );
  }
} 