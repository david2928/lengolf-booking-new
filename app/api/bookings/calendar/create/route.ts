import { NextRequest, NextResponse } from 'next/server';
import { calendar } from '@/lib/googleApiConfig';
import { BOOKING_CALENDARS } from '@/lib/bookingCalendarConfig';
import { format } from 'date-fns';
import { formatInTimeZone } from 'date-fns-tz';
import { BAY_COLORS } from '@/lib/bayConfig';

const TIMEZONE = 'Asia/Bangkok';

interface CalendarResponse {
  data: {
    id: string;
    [key: string]: any;
  };
}

export async function POST(request: NextRequest) {
  try {
    // Parse request body
    const requestData = await request.json();
    
    // Require full data for calendar creation
    if (!requestData.booking || !requestData.startDateTime || !requestData.endDateTime) {
      return NextResponse.json({ error: 'Missing required data for calendar event' }, { status: 400 });
    }
    
    // Extract data
    const { booking, customerName, bayDisplayName, startDateTime, endDateTime, packageInfo = 'Normal Bay Rate' } = requestData;
    
    // Get calendar ID for the bay
    const bay = booking.bay || 'Bay 1';
    const calendarId = BOOKING_CALENDARS[bay as keyof typeof BOOKING_CALENDARS];
    
    if (!calendarId) {
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
Date: ${format(new Date(startDateTime), 'EEEE, MMMM d')}
Time: ${format(new Date(startDateTime), 'HH:mm')} - ${format(new Date(endDateTime), 'HH:mm')}
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

      // Return success response with calendar event ID
      return NextResponse.json({
        success: true,
        bookingId: booking.id,
        calendarEventId: calendarResponse.data.id,
        processingTime: Date.now()
      });
    } catch (error) {
      console.error('Failed to create calendar event:', error);
      return NextResponse.json(
        { error: 'Failed to create calendar event' },
        { status: 500 }
      );
    }
  } catch (error) {
    console.error('Error in calendar event creation:', error);
    return NextResponse.json(
      { error: 'An error occurred while creating the calendar event' },
      { status: 500 }
    );
  }
} 