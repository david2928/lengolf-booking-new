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
    // Create requests for all calendars in parallel
    const bayPromises = Object.entries(BOOKING_CALENDARS).map(async ([bay, calendarId]) => {
      try {
        const events = await calendar.events.list({
          calendarId,
          timeMin: formatInTimeZone(startDateTime, TIMEZONE, "yyyy-MM-dd'T'HH:mm:ssxxx"),
          timeMax: formatInTimeZone(endDateTime, TIMEZONE, "yyyy-MM-dd'T'HH:mm:ssxxx"),
          singleEvents: true,
          timeZone: TIMEZONE,
        });
        
        const hasConflict = (events.data.items || []).some(event => {
          const eventStart = new Date(event.start?.dateTime || '');
          const eventEnd = new Date(event.end?.dateTime || '');
          return startDateTime < eventEnd && endDateTime > eventStart;
        });
        
        return { bay, available: !hasConflict };
      } catch (error) {
        console.error(`Error checking availability for bay ${bay}:`, error);
        return { bay, available: false, error: true };
      }
    });
    
    // Wait for all checks to complete
    const results = await Promise.all(bayPromises);
    
    // Find the first available bay
    const firstAvailable = results.find(result => result.available);
    return firstAvailable ? firstAvailable.bay : null;
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
    // Early timing tracking to diagnose performance issues
    const startTime = Date.now();
    let lastCheckpoint = startTime;
    
    const logTiming = (step: string) => {
      const now = Date.now();
      console.log(`[Timing] ${step}: ${now - lastCheckpoint}ms (total: ${now - startTime}ms)`);
      lastCheckpoint = now;
    };

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
    logTiming('Auth token verification');

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
    logTiming('Profile fetch');

    if (!profile) {
      return NextResponse.json(
        { error: 'Profile not found' },
        { status: 404 }
      );
    }

    const { bookingId, date, startTime: bookingStartTime, duration, skipCrmMatch } = await request.json();

    if (!bookingId || !date || !bookingStartTime || !duration) {
      return NextResponse.json(
        { error: 'Missing required fields', details: { bookingId, date, bookingStartTime, duration } },
        { status: 400 }
      );
    }

    // Format start and end times with proper timezone handling
    const parsedDateTime = parse(`${date} ${bookingStartTime}`, 'yyyy-MM-dd HH:mm', new Date());
    const startDateTime = zonedTimeToUtc(parsedDateTime, TIMEZONE);
    const endDateTime = addHours(startDateTime, duration);

    // Find an available bay with a timeout
    let availableBay: string | null = null;
    try {
      // Set a timeout for the bay availability check
      const timeoutPromise = new Promise<null>((_, reject) => {
        setTimeout(() => reject(new Error('Bay availability check timed out')), 5000);
      });
      
      // Race the actual check against the timeout
      availableBay = await Promise.race([
        findAvailableBay(startDateTime, endDateTime),
        timeoutPromise
      ]);
    } catch (error) {
      console.error('Error or timeout finding available bay:', error);
      return NextResponse.json(
        { error: 'Failed to check bay availability - please try again' },
        { status: 500 }
      );
    }
    logTiming('Bay availability check');

    if (!availableBay) {
      return NextResponse.json(
        { error: 'No bays available for the selected time slot', details: { date, startTime: bookingStartTime, duration } },
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
    logTiming('Booking fetch');

    if (!booking) {
      return NextResponse.json(
        { error: 'Booking not found', details: { bookingId } },
        { status: 404 }
      );
    }

    // Run customer profile check if not skipped
    let crmCustomerId = null;
    let crmCustomerData = null;
    
    if (!skipCrmMatch) {
      try {
        const matchResult = await matchProfileWithCrm(token.sub as string);
        if (matchResult?.matched) {
          crmCustomerId = matchResult.crmCustomerId;
        }
      } catch (e) {
        // Don't let this error affect the booking process
        console.log('Customer profile check failed, but continuing with booking');
      }
    }
    logTiming('CRM match');

    // Get CRM customer mapping for profile
    const { data: crmMapping } = await supabase
      .from('crm_customer_mapping')
      .select('crm_customer_id, crm_customer_data')
      .eq('profile_id', token.sub)
      .eq('is_matched', true)
      .maybeSingle();
    
    if (crmMapping?.crm_customer_id) {
      crmCustomerId = crmMapping.crm_customer_id;
      crmCustomerData = crmMapping.crm_customer_data;
    }
    logTiming('CRM data fetch');
    
    // Get customer name from CRM if available, otherwise use profile name
    let customerName = profile.display_name || profile.name || profile.email;
    if (crmCustomerData?.name) {
      customerName = crmCustomerData.name;
    }

    // Get active packages for the customer
    let packageInfo = 'Normal Bay Rate';
    let activePackage = null;
    
    if (crmCustomerId) {
      const { data: packages } = await supabase
        .from('crm_packages')
        .select('*')
        .eq('crm_customer_id', crmCustomerId)
        .gte('expiration_date', new Date().toISOString().split('T')[0])
        .order('expiration_date', { ascending: true });

      if (packages && packages.length > 0) {
        // Filter out coaching packages
        const nonCoachingPackages = packages.filter(pkg => 
          !pkg.package_type_name.toLowerCase().includes('coaching')
        );
        
        if (nonCoachingPackages.length > 0) {
          activePackage = nonCoachingPackages[0];
          packageInfo = `Package (${activePackage.package_type_name})`;
        }
      }
    }
    logTiming('Package data fetch');

    // Get the display name for the bay
    const bayDisplayName = BAY_DISPLAY_NAMES[availableBay] || availableBay;

    // Create a calendar event with timeout protection
    let calendarEventResponse: any;
    try {
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Calendar event creation timed out')), 5000);
      });
      
      const createEventPromise = calendar.events.insert({
        calendarId,
        requestBody: {
          summary: `${customerName} (${booking.number_of_people}) - ${packageInfo}`,
          description: `Booking ID: ${booking.id}\nEmail: ${booking.email}\nPhone: ${booking.phone_number}\nCustomer ID: ${crmCustomerId || 'N/A'}`,
          start: {
            dateTime: formatInTimeZone(startDateTime, TIMEZONE, "yyyy-MM-dd'T'HH:mm:ssxxx"),
            timeZone: TIMEZONE
          },
          end: {
            dateTime: formatInTimeZone(endDateTime, TIMEZONE, "yyyy-MM-dd'T'HH:mm:ssxxx"),
            timeZone: TIMEZONE
          },
          colorId: availableBay && BAY_COLORS[availableBay as keyof typeof BAY_COLORS] || '1'
        }
      });
      
      calendarEventResponse = await Promise.race([
        createEventPromise,
        timeoutPromise
      ]);
    } catch (error) {
      console.error('Failed to create calendar event:', error);
      return NextResponse.json(
        { error: 'Failed to create calendar event - please try again' },
        { status: 500 }
      );
    }
    logTiming('Calendar event creation');

    // Return success with the assigned bay and additional data for notifications
    return NextResponse.json({
      bay: bayDisplayName,
      bayCode: availableBay,
      eventId: calendarEventResponse.data.id,
      calendarId,
      warning: null,
      crmCustomerId,
      packageInfo
    });
  } catch (error) {
    console.error('Error creating calendar event:', error);
    return NextResponse.json(
      { error: 'Failed to create calendar event' },
      { status: 500 }
    );
  }
} 