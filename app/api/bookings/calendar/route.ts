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
    // Add some console logs for performance debugging
    const startTime = Date.now();
    
    // Create requests for all calendars in parallel
    const bayPromises = Object.entries(BOOKING_CALENDARS).map(async ([bay, calendarId]) => {
      try {
        const events = await calendar.events.list({
          calendarId,
          timeMin: formatInTimeZone(startDateTime, TIMEZONE, "yyyy-MM-dd'T'HH:mm:ssxxx"),
          timeMax: formatInTimeZone(endDateTime, TIMEZONE, "yyyy-MM-dd'T'HH:mm:ssxxx"),
          singleEvents: true,
          timeZone: TIMEZONE,
          // Optimize the response - we only need start/end dates and status
          fields: "items(id,start,end,status)",
          // Limit maximum results to improve performance
          maxResults: 10
        });
        
        // Use a more optimized comparison - convert dates just once
        const startTimestamp = startDateTime.getTime();
        const endTimestamp = endDateTime.getTime();
        
        // Fast path: if no events, bay is available
        if (!events.data.items || events.data.items.length === 0) {
          return { bay, available: true };
        }
        
        // Fast conflict check using timestamps
        const hasConflict = events.data.items.some(event => {
          // Skip events that are cancelled
          if (event.status === 'cancelled') return false;
          
          const eventStart = new Date(event.start?.dateTime || '').getTime();
          const eventEnd = new Date(event.end?.dateTime || '').getTime();
          
          // Conflict check using timestamps is faster than Date object comparison
          return startTimestamp < eventEnd && endTimestamp > eventStart;
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
    
    // Log the total time taken for all bay checks
    console.log(`[Bay Availability Check] Completed in ${Date.now() - startTime}ms for ${Object.keys(BOOKING_CALENDARS).length} bays`);
    
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

    // Fetch booking details and CRM mapping in parallel
    const [bookingResult, crmMappingResult] = await Promise.all([
      supabase
        .from('bookings')
        .select('*')
        .eq('id', bookingId)
        .single(),
      supabase
        .from('crm_customer_mapping')
        .select('crm_customer_id, crm_customer_data')
        .eq('profile_id', token.sub)
        .eq('is_matched', true)
        .maybeSingle()
    ]);
    
    const { data: booking } = bookingResult;
    const { data: crmMapping } = crmMappingResult;
    
    logTiming('Parallel data fetch');

    if (!booking) {
      return NextResponse.json(
        { error: 'Booking not found', details: { bookingId } },
        { status: 404 }
      );
    }

    // Process CRM data
    let crmCustomerId = null;
    let crmCustomerData = null;
    
    // Only run the expensive matching process if specifically requested AND no mapping exists
    if (!crmMapping?.crm_customer_id && !skipCrmMatch) {
      try {
        // This is the expensive operation (~500ms) that we want to avoid if possible
        const matchResult = await matchProfileWithCrm(token.sub as string);
        if (matchResult?.matched) {
          crmCustomerId = matchResult.crmCustomerId;
          
          // Refresh mapping data after match
          const { data: updatedMapping } = await supabase
            .from('crm_customer_mapping')
            .select('crm_customer_id, crm_customer_data')
            .eq('profile_id', token.sub)
            .eq('is_matched', true)
            .maybeSingle();
            
          if (updatedMapping) {
            crmCustomerData = updatedMapping.crm_customer_data;
          }
        }
      } catch (e) {
        // Don't let this error affect the booking process
        console.log('Customer profile check failed, but continuing with booking');
      }
    } else if (crmMapping?.crm_customer_id) {
      // Use the existing mapping (fast path)
      crmCustomerId = crmMapping.crm_customer_id;
      crmCustomerData = crmMapping.crm_customer_data;
    }
    logTiming('CRM data processing');
    
    // Get customer name from CRM if available, otherwise use profile name
    let customerName = profile.display_name || profile.name || profile.email;
    if (crmCustomerData?.name) {
      customerName = crmCustomerData.name;
    }

    // Get the stable_hash_id from the CRM mapping which is needed for package lookup
    let stableHashId = null;
    if (crmCustomerData && typeof crmCustomerData === 'object') {
      stableHashId = (crmCustomerData as any).stable_hash_id;
    }
    
    // Start calendar event creation and package fetch in parallel
    const packagePromise = stableHashId ? 
      (async () => {
        try {
          const result = await supabase
            .from('crm_packages')
            .select('*')
            .eq('stable_hash_id', stableHashId)
            .gte('expiration_date', new Date().toISOString().split('T')[0])
            .order('expiration_date', { ascending: true });
          
          return result;
        } catch (error) {
          console.error(`Error in package query:`, error);
          return { data: null, error };
        }
      })() :
      Promise.resolve({ data: null });
    
    // Get the display name for the bay
    const bayDisplayName = BAY_DISPLAY_NAMES[availableBay] || availableBay;

    // Start both operations in parallel
    const [calendarResult, packageResult] = await Promise.allSettled([
      // Calendar event creation with timeout - we'll create it after we determine packageInfo
      Promise.resolve(),
      // Package fetch
      packagePromise
    ]);
    
    // Process package result first
    let packageInfo = 'Normal Bay Rate';
    if (packageResult.status === 'fulfilled' && packageResult.value.data) {
      const packages = packageResult.value.data;
      
      if (packages && packages.length > 0) {
        // Filter out coaching packages
        const nonCoachingPackages = packages.filter((pkg: any) => 
          !pkg.package_type_name.toLowerCase().includes('coaching')
        );
        
        if (nonCoachingPackages.length > 0) {
          const activePackage = nonCoachingPackages[0];
          packageInfo = `Package (${activePackage.package_type_name})`;
        }
      }
    }
    
    // Now create calendar event with the package info
    let calendarEventResponse: any;
    try {
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Calendar event creation timed out')), 5000);
      });
      
      const createEventPromise = calendar.events.insert({
        calendarId,
        requestBody: {
          summary: `${customerName} (${booking.phone_number}) (${booking.number_of_people}) - ${packageInfo} at ${bayDisplayName}`,
          description: `Customer Name: ${customerName}
Booking Name: ${booking.name}
Contact: ${booking.phone_number}
Email: ${booking.email}
Type: ${packageInfo}
Pax: ${booking.number_of_people}
Bay: ${bayDisplayName}
Date: ${format(startDateTime, 'EEEE, MMMM d')}
Time: ${format(startDateTime, 'HH:mm')} - ${format(endDateTime, 'HH:mm')}
Booked by: ${profile.display_name || profile.name || 'Website User'}
Via: Website
Booking ID: ${booking.id}
CRM ID: ${crmCustomerId || 'N/A'}`,
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
    logTiming('Calendar operations completed');
    
    // Return success with the assigned bay and additional data for notifications
    const response = {
      bay: bayDisplayName,
      bayCode: availableBay,
      eventId: calendarEventResponse.data.id,
      calendarId,
      warning: null,
      crmCustomerId,
      packageInfo
    };
    
    return NextResponse.json(response);
  } catch (error) {
    console.error('Error creating calendar event:', error);
    return NextResponse.json(
      { error: 'Failed to create calendar event' },
      { status: 500 }
    );
  }
} 