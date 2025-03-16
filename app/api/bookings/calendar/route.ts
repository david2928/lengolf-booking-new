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
import { getOrCreateCrmMapping, normalizeCrmCustomerData } from '@/utils/customer-matching';

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
        
        // Check if there are any events during this time
        const hasOverlap = events.data.items && events.data.items.length > 0;
        
        // If no overlapping events, this bay is available
        return { bay, available: !hasOverlap };
      } catch (error) {
        console.error(`Error checking calendar ${bay}:`, error);
        // If we can't check availability, mark as unavailable to be safe
        return { bay, available: false };
      }
    });
    
    // Wait for all results
    const bayResults = await Promise.all(bayPromises);
    
    // Find the first available bay
    const availableBay = bayResults.find(result => result.available);
    
    // Log how long the check took
    console.log(`[Bay Availability Check] Completed in ${Date.now() - startTime}ms for ${Object.keys(BOOKING_CALENDARS).length} bays`);
    
    return availableBay ? availableBay.bay : null;
  } catch (error) {
    console.error("Error in findAvailableBay:", error);
    return null;
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
        source: 'calendar'
      }).catch(error => {
        // Log but don't fail if CRM mapping fails
        console.error('Error getting CRM mapping for booking:', error);
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
      
      console.log('CRM mapping found:', {
        crmCustomerId,
        stableHashId,
        confidence: profileCrmResult.confidence
      });
      
      // Fetch the full customer data if needed
      if (crmCustomerId) {
        const { data: mappingData, error: mappingError } = await supabase
          .from('crm_customer_mapping')
          .select('crm_customer_data')
          .eq('crm_customer_id', crmCustomerId)
          .eq('profile_id', token.sub)
          .single();
          
        if (mappingError) {
          console.error('Error fetching CRM mapping data:', mappingError);
        }
          
        if (mappingData?.crm_customer_data) {
          // Normalize the CRM customer data to ensure consistency
          crmCustomerData = normalizeCrmCustomerData(mappingData.crm_customer_data);
          console.log('CRM customer data found:', {
            name: crmCustomerData?.name,
            customerName: crmCustomerData?.customer_name,
            hasData: !!crmCustomerData,
            dataKeys: crmCustomerData ? Object.keys(crmCustomerData) : [],
            rawData: crmCustomerData ? JSON.stringify(crmCustomerData).substring(0, 200) + '...' : null // Log first 200 chars
          });
        } else {
          console.log('No CRM customer data found for mapping');
        }
      }
    } else {
      console.log('No CRM mapping found for profile');
    }
    
    logTiming('CRM data processing');

    // Get customer name from CRM if available, otherwise use "New Customer"
    let customerName = "New Customer";
    let isNewCustomer = true;
    
    // If we have CRM data, use that name
    if (crmCustomerData) {
      // Both name and customer_name should be set in normalized data
      if (crmCustomerData.name) {
        customerName = crmCustomerData.name;
        isNewCustomer = false;
        console.log('Using CRM customer name:', customerName);
      } else {
        console.log('CRM data found but no name available, using "New Customer"');
      }
    } else {
      console.log('No CRM data found, using "New Customer"');
    }
    
    // Retrieve CRM mappings and customer data
    let profileId = null;
    
    if (stableHashId) {
      profileId = booking.userId || null;
    }
    
    // Start calendar event creation and package fetch in parallel
    const packagePromise = stableHashId ? 
      (async () => {
        try {
          // Execute package query using stable hash ID
          const { data, error } = await supabase
            .from('crm_packages')
            .select('*')
            .eq('stable_hash_id', stableHashId)
            .gte('expiration_date', new Date().toISOString().split('T')[0]) // Only active packages
            .order('expiration_date', { ascending: true });
          
          if (error) {
            return { data: null, error };
          }
          
          return { data, error: null };
        } catch (error) {
          return { data: null, error };
        }
      })() :
      Promise.resolve({ data: null, error: null });
    
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
      
      // For new customers, use booking name in the calendar title instead of "New Customer"
      const calendarTitle = isNewCustomer ? booking.name : customerName;
      
      console.log('Creating calendar event with title:', {
        calendarTitle,
        isNewCustomer,
        originalCustomerName: customerName,
        bookingName: booking.name
      });
      
      const createEventPromise = calendar.events.insert({
        calendarId,
        requestBody: {
          summary: `${calendarTitle} (${booking.phone_number}) (${booking.number_of_people}) - ${packageInfo} at ${bayDisplayName}`,
          description: `Customer Name: ${customerName}
Booking Name: ${booking.name}
Contact: ${booking.phone_number}
Email: ${booking.email}
Type: ${packageInfo}
Pax: ${booking.number_of_people}
Bay: ${bayDisplayName}
Date: ${format(startDateTime, 'EEEE, MMMM d')}
Time: ${format(startDateTime, 'HH:mm')} - ${format(endDateTime, 'HH:mm')}
Via: Website
Booking ID: ${booking.id}`,
          start: {
            dateTime: formatInTimeZone(startDateTime, TIMEZONE, "yyyy-MM-dd'T'HH:mm:ssxxx"),
            timeZone: TIMEZONE
          },
          end: {
            dateTime: formatInTimeZone(endDateTime, TIMEZONE, "yyyy-MM-dd'T'HH:mm:ssxxx"),
            timeZone: TIMEZONE
          },
          colorId: BAY_COLORS[bayDisplayName as keyof typeof BAY_COLORS] || '1'
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
    
    // Notification Section: Send all notifications after successful booking creation
    
    // Prepare and send email notification
    try {
      // Calculate end time properly in local timezone
      // First parse the start time in local timezone
      const localStartTime = parse(`${booking.date} ${booking.start_time}`, 'yyyy-MM-dd HH:mm', new Date());
      // Then add the duration to get the end time, still in local timezone
      const localEndTime = addHours(localStartTime, booking.duration);
      // Format both times consistently
      const formattedEndTime = format(localEndTime, 'HH:mm');

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
            // For new customers, use booking name instead of "New Customer"
            userName: isNewCustomer ? booking.name : customerName,
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
      
    } catch (error) {
      console.error('Error sending email notification:', error);
    }
    
    // Send LINE notification
    try {
      // Reuse the same end time calculation for consistency
      const localStartTime = parse(`${booking.date} ${booking.start_time}`, 'yyyy-MM-dd HH:mm', new Date());
      const localEndTime = addHours(localStartTime, booking.duration);
      const formattedEndTime = format(localEndTime, 'HH:mm');

      // Format the date in a human-readable format (reuse the same formatting)
      const formattedDate = format(new Date(booking.date), 'MMMM d, yyyy');

      // Use environment variable or fallback to localhost
      const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
      
      console.log('Sending LINE notification with data:', {
        customerName,
        bookingName: booking.name,
        email: booking.email,
        phoneNumber: booking.phone_number,
        bayNumber: bayDisplayName,
        hasCrmData: !!crmCustomerData,
        crmDataType: crmCustomerData ? typeof crmCustomerData : 'none',
        crmDataKeys: crmCustomerData ? Object.keys(crmCustomerData) : []
      });

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
            // Pass the normalized CRM data
            crmCustomerData: crmCustomerData,
            packageInfo,
            skipCrmMatch: true
          }),
        }
      );
      
      // Log the response from the LINE notification API
      const lineResponseData = await lineNotificationResponse.json().catch(e => ({ error: e.message }));
      console.log('LINE notification response:', {
        status: lineNotificationResponse.status,
        ok: lineNotificationResponse.ok,
        data: lineResponseData
      });
    } catch (error) {
      console.error('Error sending LINE notification:', error);
    }

    return NextResponse.json(response);
  } catch (error) {
    console.error('Exception in calendar route:', error);
    return NextResponse.json(
      { error: 'An error occurred while creating the calendar event' },
      { status: 500 }
    );
  }
} 