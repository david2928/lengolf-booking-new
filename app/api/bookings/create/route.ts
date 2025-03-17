import { NextRequest, NextResponse } from 'next/server';
import { getToken } from 'next-auth/jwt';
import { createServerClient } from '@/utils/supabase/server';
import { formatBookingData } from '@/utils/booking-formatter';
import { executeParallel } from '@/utils/parallel-processing';
import { parse, addHours } from 'date-fns';
import { zonedTimeToUtc, formatInTimeZone } from 'date-fns-tz';
import { getOrCreateCrmMapping, normalizeCrmCustomerData } from '@/utils/customer-matching';
import { BAY_DISPLAY_NAMES, BAY_COLORS } from '@/lib/bayConfig';
import { BOOKING_CALENDARS } from '@/lib/bookingCalendarConfig';
import { calendar } from '@/lib/googleApiConfig';
import { v4 as uuidv4 } from 'uuid';

const TIMEZONE = 'Asia/Bangkok';

// Type definitions for the availability check
interface AvailabilityResult {
  available: boolean;
  bay?: string;
  allAvailableBays?: string[];
}

// Type definitions for the CRM mapping result
interface CrmMappingResult {
  profileId: string;
  crmCustomerId: string;
  stableHashId: string;
  crmCustomerData?: any;
  isNewMatch: boolean;
}

// Helper function to generate a booking ID
const generateBookingId = () => {
  const timestamp = new Date().toISOString().slice(2, 10).replace(/-/g, '');
  const randomNum = Math.random().toString(36).substring(2, 6).toUpperCase();
  return `BK${timestamp}${randomNum}`;
};

/**
 * Helper function to get package info for a customer
 * This centralizes the package info handling logic
 */
async function getPackageInfo(stableHashId: string | null): Promise<string> {
  // Default package info
  let packageInfo = 'Normal Bay Rate';
  
  // If we have a stable hash ID, try to get package info
  if (stableHashId) {
    try {
      const supabase = createServerClient();
      const { data: packages } = await supabase
        .from('crm_packages')
        .select('*')
        .eq('stable_hash_id', stableHashId)
        .gte('expiration_date', new Date().toISOString().split('T')[0]) // Only active packages
        .order('expiration_date', { ascending: true });
      
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
    } catch (error) {
      console.error('Error looking up packages:', error);
    }
  }
  
  return packageInfo;
}

// Helper function to send notifications
async function sendNotifications(formattedData: any, booking: any, bayDisplayName: string, crmCustomerId?: string, stableHashId?: string, packageInfo: string = 'Normal Bay Rate') {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
  
  // Start both notifications in parallel using our utility
  const notificationTasks = [
    // Email notification
    async () => {
      try {
        // ALWAYS use booking name for email notification recipient name
        const userName = booking.name;
        
        // For email subject, use CRM customer name unless it's a new customer
        const subjectName = crmCustomerId ? (formattedData.customerName || booking.name) : booking.name;
        
        const emailData = {
          userName,
          subjectName, // Add subject name separately for email subject
          email: formattedData.email || booking.email,
          date: formattedData.formattedDate || booking.date,
          startTime: booking.start_time,
          endTime: formattedData.endTime,
          duration: booking.duration,
          numberOfPeople: booking.number_of_people,
          bayNumber: bayDisplayName,
          userId: booking.user_id,
          crmCustomerId,
          stableHashId,
          skipCrmMatch: true,
          packageInfo,
          standardizedData: formattedData
        };
        
        const response = await fetch(`${baseUrl}/api/notifications/email`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(emailData),
        });
        return response;
      } catch (error) {
        console.error('Error sending email notification:', error);
        return null;
      }
    },
    
    // LINE notification
    async () => {
      try {
        // Use customerName from formattedData with fallbacks
        const customerNameForLine = formattedData.customerName || booking.name;
        
        // Always use "New Customer" for unmatched customers
        const lineCustomerName = crmCustomerId ? customerNameForLine : "New Customer";
        
        const lineData = {
          customerName: lineCustomerName,
          bookingName: formattedData.lineNotification?.bookingName || booking.name,
          email: booking.email,
          phoneNumber: booking.phone_number,
          bookingDate: formattedData.formattedDate || booking.date,
          bookingStartTime: booking.start_time,
          bookingEndTime: formattedData.endTime,
          bayNumber: bayDisplayName,
          duration: booking.duration,
          numberOfPeople: booking.number_of_people,
          profileId: booking.user_id,
          crmCustomerId,
          stableHashId,
          skipCrmMatch: true,
          packageInfo,
          standardizedData: formattedData
        };
        
        const response = await fetch(`${baseUrl}/api/notifications/line`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(lineData),
        });
        return response;
      } catch (error) {
        console.error('Error sending LINE notification:', error);
        return null;
      }
    }
  ];
  
  // Execute notifications in parallel with a timeout
  executeParallel(notificationTasks, { timeout: 10000 })
    .then(() => console.log('All notifications sent'))
    .catch(error => console.error('Error sending notifications:', error));
}

export async function POST(request: NextRequest) {
  try {
    // Performance tracking
    const apiStartTime = Date.now();
    let lastCheckpoint = apiStartTime;
    
    const logTiming = (step: string) => {
      const now = Date.now();
      console.log(`[Timing] ${step}: ${now - lastCheckpoint}ms (total: ${now - apiStartTime}ms)`);
      lastCheckpoint = now;
    };

    // 1. Authenticate user
    const token = await getToken({ req: request as any });
    if (!token?.sub) {
      return NextResponse.json(
        { error: 'Unauthorized or session expired' },
        { status: 401 }
      );
    }
    logTiming('Authentication');

    // 2. Parse request body
    const {
      name,
      email,
      phone_number,
      date,
      start_time,
      duration,
      number_of_people
    } = await request.json();

    // Validate required fields
    if (!name || !email || !phone_number || !date || !start_time || !duration || !number_of_people) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }
    logTiming('Request parsing');

    // 3. Format date and time for availability check
    const parsedDateTime = parse(`${date} ${start_time}`, 'yyyy-MM-dd HH:mm', new Date());
    const startDateTime = zonedTimeToUtc(parsedDateTime, TIMEZONE);
    const endDateTime = addHours(startDateTime, duration);
    logTiming('Date parsing');

    // 4. Get base URL for API calls
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

    // 5. Run bay availability check and CRM matching in parallel
    const [availabilityResult, crmMappingResult] = await Promise.all([
      // Bay availability check
      (async () => {
        try {
          // Format date and time
          const parsedDateTime = parse(`${date} ${start_time}`, 'yyyy-MM-dd HH:mm', new Date());
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
            return { available: false };
          }

          // Return the first available bay
          return {
            available: true,
            bay: availableBays[0].bay,
            allAvailableBays: availableBays.map(b => b.bay)
          };
        } catch (error) {
          console.error('Error checking bay availability:', error);
          return { available: false };
        }
      })(),
      
      // CRM matching - get complete mapping data including CRM customer data
      (async () => {
        if (!token.sub) return null;
        
        try {
          // First check for existing mapping
          const supabase = createServerClient();
          const { data: mapping, error: mappingError } = await supabase
            .from('crm_customer_mapping')
            .select('crm_customer_id, stable_hash_id, crm_customer_data')
            .eq('profile_id', token.sub)
            .eq('is_matched', true)
            .order('match_confidence', { ascending: false })
            .order('updated_at', { ascending: false })
            .maybeSingle();
          
          if (mappingError) {
            console.error('Error checking for CRM mapping:', mappingError);
            return null;
          }
          
          if (mapping) {
            return {
              profileId: token.sub,
              crmCustomerId: mapping.crm_customer_id,
              stableHashId: mapping.stable_hash_id,
              crmCustomerData: mapping.crm_customer_data,
              isNewMatch: false
            };
          }
          
          // If no mapping found, try creating one
          return await getOrCreateCrmMapping(token.sub, { source: 'booking' });
        } catch (error) {
          console.error('Error in CRM mapping:', error);
          return null;
        }
      })()
    ]).catch(error => {
      console.error('Error in parallel operations:', error);
      return [{ available: false }, null];
    });
    logTiming('Parallel operations (availability + CRM)');

    // 6. Handle availability result
    if (!availabilityResult || !availabilityResult.available) {
      return NextResponse.json(
        { error: 'No bays available for the selected time slot' },
        { status: 400 }
      );
    }

    // Get the assigned bay and its display name
    const availabilityResultWithBay = availabilityResult as AvailabilityResult & { bay: string };
    const availableBay = availabilityResultWithBay.bay;
    const bayDisplayName = BAY_DISPLAY_NAMES[availableBay] || availableBay;

    // 7. Handle CRM matching result
    let crmCustomerId = null;
    let stableHashId = null;
    let crmCustomerData = null;
    let customerName = null;

    if (crmMappingResult) {
      if ('crmCustomerId' in crmMappingResult) {
        crmCustomerId = crmMappingResult.crmCustomerId;
        stableHashId = crmMappingResult.stableHashId;
        
        // Extract CRM customer data if available
        if ('crmCustomerData' in crmMappingResult && crmMappingResult.crmCustomerData) {
          crmCustomerData = crmMappingResult.crmCustomerData;
          
          // Normalize the customer data
          const normalizedCrmData = normalizeCrmCustomerData(crmCustomerData);
          
          if (normalizedCrmData?.name) {
            customerName = normalizedCrmData.name;
          }
        }
      }
    }

    // 8. Create booking record in Supabase
    const supabase = createServerClient();
    const { data: booking, error: bookingError } = await supabase
      .from('bookings')
      .insert({
        id: generateBookingId(),
        name,
        email,
        phone_number,
        date,
        start_time,
        duration,
        number_of_people,
        user_id: token.sub,
        bay: availableBay,
        status: 'confirmed'
      })
      .select()
      .single();

    if (bookingError || !booking) {
      console.error('Error creating booking:', bookingError);
      return NextResponse.json(
        { error: 'Failed to create booking record' },
        { status: 500 }
      );
    }
    logTiming('Booking record creation');
    
    // If we don't have a customer name from CRM, use the booking name
    if (!customerName) {
      customerName = booking.name;
    }
    
    // Get package info using the centralized function
    const packageInfo = await getPackageInfo(stableHashId);
    logTiming('Customer data lookup');

    // Update booking with package info
    await supabase
      .from('bookings')
      .update({ package_info: packageInfo })
      .eq('id', booking.id);
    
    // Update the booking object with package info
    booking.package_info = packageInfo;

    // 9. Format booking data for all services
    const formattedData = formatBookingData({
      booking,
      crmData: crmCustomerId ? { 
        id: crmCustomerId,
        name: customerName  // Use the normalized CRM customer name
      } : null,
      bayInfo: {
        id: availableBay,
        displayName: bayDisplayName
      }
    });
    logTiming('Data formatting');
    
    // Send notifications in parallel with the necessary data
    sendNotifications(
      formattedData,
      booking,
      bayDisplayName,
      crmCustomerId || undefined,
      stableHashId || undefined,
      packageInfo
    );

    // 10. Trigger calendar creation and notifications in the background
    // These are non-blocking - we'll return to the user before they complete
    
    // Format date and time for calendar
    const calendarDateTime = parse(`${booking.date} ${booking.start_time}`, 'yyyy-MM-dd HH:mm', new Date());
    const calendarStartTime = zonedTimeToUtc(calendarDateTime, TIMEZONE);
    const calendarEndTime = addHours(calendarStartTime, booking.duration);
    
    // Trigger calendar creation with all required data (non-blocking)
    const calendarData = {
      bookingId: booking.id,
      booking,
      customerName,  // Use the normalized CRM customer name
      bayDisplayName,
      startDateTime: formatInTimeZone(calendarStartTime, TIMEZONE, "yyyy-MM-dd'T'HH:mm:ssxxx"),
      endDateTime: formatInTimeZone(calendarEndTime, TIMEZONE, "yyyy-MM-dd'T'HH:mm:ssxxx"),
      packageInfo
    };
    
    // Use setTimeout to make this non-blocking
    setTimeout(() => {
      fetch(`${baseUrl}/api/bookings/calendar/create`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': request.headers.get('Authorization') || ''
        },
        body: JSON.stringify(calendarData)
      })
      .then(response => {
        if (!response.ok) {
          throw new Error(`Calendar creation failed with status: ${response.status}`);
        }
        return response.json();
      })
      .then(data => {
        if (data.calendarEventId) {
          // Update booking with calendar event ID
          supabase
            .from('bookings')
            .update({ calendar_event_id: data.calendarEventId })
            .eq('id', booking.id);
        }
      })
      .catch(error => {
        console.error('Error in calendar creation:', error);
      });
    }, 0);

    // 11. Return success response to user immediately
    return NextResponse.json({
      success: true,
      booking,
      bookingId: booking.id,
      bay: availableBay,
      bayDisplayName,
      crmCustomerId,
      stableHashId,
      processingTime: Date.now() - apiStartTime
    });
  } catch (error) {
    console.error('Exception in booking creation:', error);
    return NextResponse.json(
      { error: 'An error occurred while creating the booking' },
      { status: 500 }
    );
  }
} 