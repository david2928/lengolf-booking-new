import { NextResponse } from 'next/server';
import { calendar } from '@/lib/googleApiConfig';
import { BOOKING_CALENDARS } from '@/lib/bookingCalendarConfig';
import { format, addHours, parse } from 'date-fns';
import { zonedTimeToUtc, formatInTimeZone } from 'date-fns-tz';
import { getToken } from 'next-auth/jwt';
import type { NextRequest } from 'next/server';
import { createServerClient } from '@/utils/supabase/server';
import { BAY_DISPLAY_NAMES, BAY_COLORS } from '@/lib/bayConfig';
import http from 'http';
import https from 'https';
import { crmLogger } from '@/utils/logging';
import { getOrCreateCrmMapping } from '@/utils/customer-matching';

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
  // Generate a unique request ID for this booking
  const requestId = crmLogger.newRequest();
  
  try {
    // Early timing tracking to diagnose performance issues
    const startTime = Date.now();
    let lastCheckpoint = startTime;
    
    const logTiming = (step: string) => {
      const now = Date.now();
      console.log(`[Timing] ${step}: ${now - lastCheckpoint}ms (total: ${now - startTime}ms)`);
      lastCheckpoint = now;
    };

    // Get token and check authorization
    const token = await getToken({ req: request as any });
    if (!token?.sub) {
      return NextResponse.json(
        { error: 'Unauthorized or session expired' },
        { status: 401 }
      );
    }
    logTiming('Auth token validation');

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

    // Parse the request body
    const { bookingId, date, startTime: bookingStartTime, duration } = await request.json();

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
    const [bookingResult, profileCrmResult] = await Promise.all([
      supabase
        .from('bookings')
        .select('*')
        .eq('id', bookingId)
        .single(),
      getOrCreateCrmMapping(token.sub, {
        requestId: crmLogger.newRequest(),
        source: 'calendar',
        logger: crmLogger
      }).catch(error => {
        // Log but don't fail if CRM mapping fails
        crmLogger.error(
          'Error getting CRM mapping for booking',
          { error, profileId: token.sub },
          { requestId, profileId: token.sub, source: 'calendar' }
        );
        return null;
      })
    ]);
    
    const { data: booking } = bookingResult;
    
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
    let stableHashId = null;
    
    // Use the data from the efficient CRM lookup
    if (profileCrmResult) {
      crmCustomerId = profileCrmResult.crmCustomerId;
      stableHashId = profileCrmResult.stableHashId;
      
      // Fetch the full customer data if needed
      if (crmCustomerId) {
        const { data: mappingData } = await supabase
          .from('crm_customer_mapping')
          .select('crm_customer_data')
          .eq('crm_customer_id', crmCustomerId)
          .eq('profile_id', token.sub)
          .single();
          
        if (mappingData?.crm_customer_data) {
          crmCustomerData = mappingData.crm_customer_data;
        }
      }
    }
    
    logTiming('CRM data processing');

    // Get customer name from CRM if available, otherwise use profile name
    let customerName = profile.display_name || profile.name || profile.email;
    if (crmCustomerData?.name) {
      customerName = crmCustomerData.name;
    }

    // Retrieve CRM mappings and customer data
    let profileId = null;
    
    if (stableHashId) {
      profileId = booking.userId || null;
      
      crmLogger.info(
        `Found stable_hash_id from mapping`, 
        { stableHashId, profileId, phone: booking.phone_number },
        { requestId, profileId, stableHashId, crmCustomerId, source: 'calendar' }
      );
    } else {
      crmLogger.warn(
        `No stable_hash_id found in mapping or customer data`,
        { profileId: booking.userId, phone: booking.phone_number },
        { requestId, profileId: booking.userId, source: 'calendar' }
      );
    }
    
    // Start calendar event creation and package fetch in parallel
    const packagePromise = stableHashId ? 
      (async () => {
        try {
          crmLogger.debug(
            `Starting package query for customer`,
            { stableHashId },
            { requestId, profileId, stableHashId, crmCustomerId, source: 'calendar' }
          );
          
          // Query by stable_hash_id
          const result = await supabase
            .from('crm_packages')
            .select('*')
            .eq('stable_hash_id', stableHashId)
            .order('expiration_date', { ascending: false });
          
          if (result.error) {
            crmLogger.error(
              `Error in package query`,
              { error: result.error, stableHashId },
              { requestId, profileId, stableHashId, crmCustomerId, source: 'calendar' }
            );
          } else {
            crmLogger.info(
              `Package query successful`,
              { 
                packageCount: result.data?.length || 0,
                packages: result.data,
                stableHashId 
              },
              { requestId, profileId, stableHashId, crmCustomerId, source: 'calendar' }
            );
          }
          
          return result;
        } catch (error) {
          crmLogger.error(
            `Exception in package query`,
            { error, stableHashId },
            { requestId, profileId, stableHashId, crmCustomerId, source: 'calendar' }
          );
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
      
      crmLogger.debug(
        `Processing package results`,
        { 
          packageCount: packages.length, 
          packages,
          stableHashId 
        },
        { requestId, profileId, stableHashId, crmCustomerId, source: 'calendar' }
      );
      
      if (packages && packages.length > 0) {
        // Filter out coaching packages
        const nonCoachingPackages = packages.filter((pkg: any) => 
          !pkg.package_type_name.toLowerCase().includes('coaching')
        );
        
        crmLogger.debug(
          `Filtered out coaching packages`,
          { 
            originalCount: packages.length,
            filteredCount: nonCoachingPackages.length,
            filteredPackages: nonCoachingPackages
          },
          { requestId, profileId, stableHashId, crmCustomerId, source: 'calendar' }
        );
        
        if (nonCoachingPackages.length > 0) {
          const activePackage = nonCoachingPackages[0];
          packageInfo = `Package (${activePackage.package_type_name})`;
          
          crmLogger.info(
            `Using package for booking`,
            { 
              packageType: activePackage.package_type_name,
              packageId: activePackage.id,
              expirationDate: activePackage.expiration_date
            },
            { requestId, profileId, stableHashId, crmCustomerId, source: 'calendar' }
          );
        } else {
          crmLogger.info(
            `No non-coaching packages found after filtering`,
            { originalPackageCount: packages.length },
            { requestId, profileId, stableHashId, crmCustomerId, source: 'calendar' }
          );
        }
      } else {
        crmLogger.info(
          `No packages found for customer`,
          { stableHashId },
          { requestId, profileId, stableHashId, crmCustomerId, source: 'calendar' }
        );
      }
    } else {
      crmLogger.info(
        `No packages found or error fetching packages`,
        { 
          status: packageResult.status,
          error: packageResult.status === 'rejected' ? packageResult.reason : null 
        },
        { requestId, profileId, stableHashId, crmCustomerId, source: 'calendar' }
      );
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
      id: bookingId,
      calendarEventId: calendarEventResponse?.id,
      bayDisplayName
    };
    
    // Log the final values being sent to notifications
    console.log('Data for notifications:', {
      bayNumber: bayDisplayName, // The formatted bay name for display
      rawBay: booking.bay, // The raw bay value
      availableBay, // The assigned bay from availability check
      packageInfo, // The package information that was determined
      customerName
    });
    
    // Notification Section: Send all notifications after successful booking creation
    
    // Prepare and send email notification
    try {
      // Log the data we're sending to email notifications for debugging
      crmLogger.debug('Sending email notification with data', {
        bayNumber: availableBay,
        bayDisplayName,
        packageInfo,
        customerName
      }, { requestId, source: 'calendar' });

      // Format end time to match start time format
      const formattedEndTime = typeof endDateTime === 'string' ? 
        endDateTime : // If already a string, use as is
        (endDateTime instanceof Date ? 
          format(endDateTime, 'HH:mm') : // Format as HH:mm if it's a Date object
          endDateTime); // Fallback to whatever it is

      // Format the date in a human-readable format
      const formattedDate = format(new Date(booking.date), 'MMMM d, yyyy');

      // Use environment variable or fallback to localhost
      const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

      // Send email notification with absolute URL
      const emailNotificationResponse = await fetch(
        `${baseUrl}/api/notifications/email`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            userName: customerName,
            email: booking.email,
            date: formattedDate, // Use the formatted date
            startTime: booking.start_time,
            endTime: formattedEndTime,
            duration: booking.duration,
            numberOfPeople: booking.number_of_people,
            bayNumber: bayDisplayName,
            phoneNumber: booking.phone_number,
            packageInfo,
            // Additional fields for internal use
            userId: profileId,
            crmCustomerId,
            stableHashId,
            crmCustomerData,
            skipCrmMatch: true
          }),
        }
      );
      
      crmLogger.info('Email notification sent', 
        { status: emailNotificationResponse.status }, 
        { requestId, source: 'calendar' }
      );
    } catch (error) {
      crmLogger.error('Error sending email notification:', 
        { error }, 
        { requestId, source: 'calendar' }
      );
    }
    
    // Send LINE notification
    try {
      // Log exactly what we're sending to LINE notification
      crmLogger.debug(
        'Sending LINE notification with data',
        {
          packageInfo,
          bayNumber: bayDisplayName,
          customerName
        },
        { requestId, source: 'calendar' }
      );

      // Format end time to match start time format (reusing the same formatting)
      const formattedEndTime = typeof endDateTime === 'string' ? 
        endDateTime : // If already a string, use as is
        (endDateTime instanceof Date ? 
          format(endDateTime, 'HH:mm') : // Format as HH:mm if it's a Date object
          endDateTime); // Fallback to whatever it is

      // Format the date in a human-readable format (reuse the same formatting)
      const formattedDate = format(new Date(booking.date), 'MMMM d, yyyy');

      // Use environment variable or fallback to localhost
      const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

      // Send LINE notification with absolute URL
      const lineNotificationResponse = await fetch(
        `${baseUrl}/api/notifications/line`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            customerName,
            email: booking.email,
            phoneNumber: booking.phone_number,
            bookingDate: formattedDate, // Use the formatted date
            bookingStartTime: booking.start_time,
            bookingEndTime: formattedEndTime,
            bayNumber: bayDisplayName,
            duration: booking.duration,
            numberOfPeople: booking.number_of_people,
            // Use exact name from booking form (not CRM name or customer display name)
            bookingName: booking.name,
            profileId,
            crmCustomerId,
            stableHashId,
            crmCustomerData,
            packageInfo,
            skipCrmMatch: true
          }),
        }
      );
      crmLogger.info('LINE notification sent', 
        { status: lineNotificationResponse.status }, 
        { requestId, source: 'calendar' }
      );
    } catch (error) {
      crmLogger.error('Error sending LINE notification:', 
        { error }, 
        { requestId, source: 'calendar' }
      );
    }

    return NextResponse.json(response);
  } catch (error) {
    crmLogger.error(
      `Exception in calendar route`,
      { error },
      { requestId, source: 'calendar' }
    );
    return NextResponse.json(
      { error: 'An error occurred while creating the calendar event' },
      { status: 500 }
    );
  }
} 