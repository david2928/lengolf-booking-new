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

export async function POST(request: NextRequest) {
  try {
    // Authenticate via NextAuth
    const token = await getToken({ req: request as any });
    if (!token) {
      return NextResponse.json(
        { error: 'Unauthorized' },
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
      await matchProfileWithCrm(token.sub as string);
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
      bay: availableBay
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