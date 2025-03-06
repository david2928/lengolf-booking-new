import { NextResponse } from 'next/server';
import { calendar } from '@/lib/googleApiConfig';
import { BOOKING_CALENDARS } from '@/lib/bookingCalendarConfig';
import { format, addHours, parse } from 'date-fns';
import { zonedTimeToUtc, formatInTimeZone } from 'date-fns-tz';
import { getToken } from 'next-auth/jwt';
import type { NextRequest } from 'next/server';
import { createServerClient } from '@/utils/supabase/server';
import { BAY_DISPLAY_NAMES, BAY_COLORS } from '@/lib/bayConfig';
import { matchProfileWithCrm } from '@/utils/customer-matching';
import http from 'http';
import https from 'https';

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

// Helper function to make internal HTTP requests
async function makeInternalRequest(url: string, options: any) {
  return new Promise((resolve, reject) => {
    const isHttps = url.startsWith('https');
    const httpModule = isHttps ? https : http;
    
    const req = httpModule.request(url, options, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => resolve(data));
    });
    
    req.on('error', reject);
    if (options.body) {
      req.write(JSON.stringify(options.body));
    }
    req.end();
  });
}

export async function POST(request: NextRequest) {
  try {
    // Get the authorization header
    const authHeader = request.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json(
        { error: 'Missing or invalid authorization header' },
        { status: 401 }
      );
    }

    // Authenticate via NextAuth
    const token = await getToken({ 
      req: request as any,
      secret: process.env.NEXTAUTH_SECRET 
    });

    if (!token) {
      return NextResponse.json(
        { error: 'Invalid or expired session' },
        { status: 401 }
      );
    }

    // Get user profile from Supabase
    const supabase = createServerClient();
    const { data: profile } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', token.sub)
      .single();

    if (!profile) {
      return NextResponse.json(
        { error: 'Profile not found' },
        { status: 404 }
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

    // Run customer profile check in the background - this doesn't modify the booking flow
    try {
      matchProfileWithCrm(token.sub as string).catch(e => {
        console.error('Background CRM match failed:', e);
      });
    } catch (e) {
      // Don't let this error affect the booking process
      console.log('Customer profile check failed, but continuing with booking');
    }

    // Get CRM customer mapping for profile
    const { data: crmMapping } = await supabase
      .from('crm_customer_mapping')
      .select('crm_customer_id, crm_customer_data')
      .eq('profile_id', token.sub)
      .eq('is_matched', true)
      .maybeSingle();
    
    // Get customer name from CRM if available, otherwise use profile name
    let customerName = profile.display_name || profile.name || profile.email;
    if (crmMapping?.crm_customer_data) {
      const crmData = crmMapping.crm_customer_data as any;
      if (crmData?.name) {
        customerName = crmData.name;
      }
    }

    // Get active packages for the customer
    const { data: packages } = await supabase
      .from('crm_packages')
      .select('*')
      .eq('stable_hash_id', crmMapping?.crm_customer_data?.stable_hash_id)
      .gte('expiration_date', new Date().toISOString())
      .order('expiration_date', { ascending: true });

    // Get the display name for the bay
    const bayDisplayName = BAY_DISPLAY_NAMES[availableBay] || availableBay;

    // Format package info for the event
    let packageInfo = 'Normal Bay Rate';
    if (packages && packages.length > 0) {
      const activePackage = packages[0]; // Use the first valid package
      packageInfo = `Package (${activePackage.package_type_name})`;
    }

    // Create calendar event with proper timezone handling
    const event = {
      summary: `${customerName} (${booking.phone_number}) (${booking.number_of_people}) - ${packageInfo} at ${bayDisplayName}`,
      description: `Customer Name: ${customerName}
Booking Name: ${booking.name}
Email: ${profile.email}
Phone: ${booking.phone_number}
People: ${booking.number_of_people}
Package: ${packageInfo}
Booking ID: ${bookingId}`,
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

    // Create calendar event
    const response = await calendar.events.insert({
      calendarId,
      requestBody: event,
    });

    if (response.status !== 200) {
      throw new Error(`Failed to create calendar event. Status: ${response.status}`);
    }

    // Return success immediately, handle notifications asynchronously
    const eventData = {
      success: true,
      eventId: response.data.id,
      bay: availableBay
    };

    // Get the base URL from environment or construct it
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

    // When making internal API calls, ensure the auth token is properly formatted
    const authToken = request.headers.get('Authorization') || '';
    
    // Send notifications in the background
    Promise.all([
      // Send LINE notification
      fetch(`${baseUrl}/api/notifications/line`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': authToken.startsWith('Bearer ') ? authToken : `Bearer ${authToken}`
        },
        body: JSON.stringify({
          customerName,
          email: profile.email,
          phoneNumber: booking.phone_number,
          bookingDate: date,
          bookingStartTime: startTime,
          bookingEndTime: formatInTimeZone(endDateTime, TIMEZONE, 'HH:mm'),
          bayNumber: availableBay,
          duration,
          numberOfPeople: booking.number_of_people,
          crmCustomerId: crmMapping?.crm_customer_id,
          profileId: token.sub
        })
      }),
      // Send email notification
      fetch(`${baseUrl}/api/notifications/email`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': authToken.startsWith('Bearer ') ? authToken : `Bearer ${authToken}`
        },
        body: JSON.stringify({
          userName: customerName,
          email: profile.email,
          phoneNumber: booking.phone_number,
          date: format(new Date(date), 'MMMM d, yyyy'),
          startTime,
          endTime: formatInTimeZone(endDateTime, TIMEZONE, 'HH:mm'),
          duration,
          numberOfPeople: booking.number_of_people,
          bayNumber: availableBay,
          userId: token.sub
        })
      })
    ]).catch(error => {
      console.error('Background notification tasks failed:', error);
    });

    return NextResponse.json(eventData);
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