import { NextRequest, NextResponse } from 'next/server';
import { getToken } from 'next-auth/jwt';
import { createServerClient } from '@/utils/supabase/server';
import { formatBookingData } from '@/utils/booking-formatter';
import { executeParallel } from '@/utils/parallel-processing';
import { parse, addHours, addMinutes } from 'date-fns';
import { zonedTimeToUtc, formatInTimeZone } from 'date-fns-tz';
import { getOrCreateCrmMapping, normalizeCrmCustomerData } from '@/utils/customer-matching';
import { BAY_DISPLAY_NAMES, BAY_COLORS } from '@/lib/bayConfig';
import { BOOKING_CALENDARS } from '@/lib/bookingCalendarConfig';
import { calendar } from '@/lib/googleApiConfig';
import { v4 as uuidv4 } from 'uuid';
import { nextTick } from 'node:process';
import { scheduleReviewRequest } from '@/lib/reviewRequestScheduler';

const TIMEZONE = 'Asia/Bangkok';

// Configuration for detailed booking process logging
const ENABLE_DETAILED_LOGGING = process.env.ENABLE_BOOKING_DETAILED_LOGGING === 'true';

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
async function sendNotifications(formattedData: any, booking: any, bayDisplayName: string, crmCustomerId?: string, stableHashId?: string, packageInfo: string = 'Normal Bay Rate', customerNotes?: string) {
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
          standardizedData: formattedData,
          customerNotes
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
          standardizedData: formattedData,
          customerNotes
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
  
  // Return the promise for all notifications completing
  return executeParallel(notificationTasks, { timeout: 10000 })
    .then(results => {
      console.log('All notifications sent');
      return { success: true, results };
    })
    .catch(error => {
      console.error('Error sending notifications:', error);
      return { success: false, error };
    });
}

// Function to log booking steps to Supabase
async function logBookingProcessStep({
  bookingId,
  userId,
  step,
  status,
  durationMs,
  totalDurationMs,
  metadata = {}
}: {
  bookingId: string;
  userId: string;
  step: string;
  status: 'success' | 'error' | 'info';
  durationMs: number;
  totalDurationMs: number;
  metadata?: Record<string, any>;
}) {
  if (!ENABLE_DETAILED_LOGGING) return;

  try {
    const supabase = createServerClient();
    await supabase
      .from('booking_process_logs')
      .insert({
        booking_id: bookingId,
        user_id: userId,
        step,
        status,
        duration_ms: durationMs,
        total_duration_ms: totalDurationMs,
        metadata
      });
  } catch (error) {
    // Don't let logging errors affect the booking process
    console.error('Error logging booking process step:', error);
  }
}

export async function POST(request: NextRequest) {
  try {
    // Performance tracking
    const apiStartTime = Date.now();
    let lastCheckpoint = apiStartTime;
    let bookingId = 'pending'; // Will be updated once we have a booking ID
    let userId = ''; // Will be updated once we have authenticated
    
    const logTiming = (step: string, status: 'success' | 'error' | 'info' = 'info', metadata: Record<string, any> = {}) => {
      const now = Date.now();
      const stepDuration = now - lastCheckpoint;
      const totalDuration = now - apiStartTime;
      
      console.log(`[Timing] ${step}: ${stepDuration}ms (total: ${totalDuration}ms)`);
      
      // Log to Supabase if we have a user ID
      if (userId) {
        logBookingProcessStep({
          bookingId,
          userId,
          step,
          status,
          durationMs: stepDuration,
          totalDurationMs: totalDuration,
          metadata
        });
      }
      
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
    userId = token.sub;
    logTiming('Authentication', 'success');

    // 2. Parse request body
    const {
      name,
      email,
      phone_number,
      date,
      start_time,
      duration,
      number_of_people,
      customer_notes
    } = await request.json();

    // Validate required fields
    if (!name || !email || !phone_number || !date || !start_time || !duration || !number_of_people) {
      logTiming('Request validation', 'error', { 
        missing: [
          !name ? 'name' : null,
          !email ? 'email' : null,
          !phone_number ? 'phone_number' : null,
          !date ? 'date' : null,
          !start_time ? 'start_time' : null,
          !duration ? 'duration' : null,
          !number_of_people ? 'number_of_people' : null
        ].filter(Boolean)
      });
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }
    logTiming('Request parsing', 'success');

    // 3. Format date and time for availability check
    const parsedDateTime = parse(`${date} ${start_time}`, 'yyyy-MM-dd HH:mm', new Date());
    const startDateTime = zonedTimeToUtc(parsedDateTime, TIMEZONE);
    const endDateTime = addHours(startDateTime, duration);
    logTiming('Date parsing', 'success');

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
      logTiming('Parallel operations failure', 'error', { error: error.message });
      return [{ available: false }, null];
    });
    
    // Log more detailed info about the results
    logTiming('Parallel operations (availability + CRM)', 'success', {
      bayAvailability: availabilityResult?.available || false,
      availableBays: (availabilityResult as any)?.allAvailableBays || [],
      crmMatchFound: !!(crmMappingResult as any)?.crmCustomerId,
      isNewCrmMatch: !!(crmMappingResult as any)?.isNewMatch
    });

    // 6. Handle availability result
    if (!availabilityResult || !availabilityResult.available) {
      logTiming('Bay availability check', 'error', { available: false });
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
    let isNewCustomer = true; // Flag to identify new customers

    if (crmMappingResult) {
      if ('crmCustomerId' in crmMappingResult) {
        crmCustomerId = crmMappingResult.crmCustomerId;
        stableHashId = crmMappingResult.stableHashId;
        isNewCustomer = false; // Customer exists in CRM system
        
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
        customer_notes,
        user_id: token.sub,
        bay: availableBay,
        status: 'confirmed'
      })
      .select()
      .single();

    if (bookingError || !booking) {
      console.error('Error creating booking:', bookingError);
      logTiming('Booking record creation', 'error', { 
        error: bookingError?.message || 'Unknown error'
      });
      return NextResponse.json(
        { error: 'Failed to create booking record' },
        { status: 500 }
      );
    }
    
    // Update bookingId once we have it
    bookingId = booking.id;
    logTiming('Booking record creation', 'success', { bookingId });

    // If we don't have a customer name from CRM, use the booking name
    if (!customerName) {
      customerName = booking.name;
    }
    
    // Get package info using the centralized function
    const packageInfo = await getPackageInfo(stableHashId);
    logTiming('Customer data lookup', 'success');

    // Now log detailed CRM customer match information after package info is available
    if (crmMappingResult && 'crmCustomerId' in crmMappingResult) {
      // Log detailed CRM customer match information
      logTiming('CRM customer match', 'success', {
        crmCustomerId,
        stableHashId,
        matchedName: customerName,
        isNewMatch: (crmMappingResult as any)?.isNewMatch || false,
        confidence: (crmMappingResult as any)?.confidence,
        crmCustomerDetails: {
          name: crmCustomerData ? normalizeCrmCustomerData(crmCustomerData)?.name || null : null,
          phone: crmCustomerData ? normalizeCrmCustomerData(crmCustomerData)?.phone_number || null : null,
          email: crmCustomerData ? normalizeCrmCustomerData(crmCustomerData)?.email || null : null,
          hasActivePackage: !!packageInfo && packageInfo !== 'Normal Bay Rate'
        }
      });
    } else if (crmMappingResult) {
      // Log failed CRM match
      logTiming('CRM customer match', 'info', {
        matched: false,
        reason: 'No matching CRM customer found'
      });
    } else {
      // Log failure in CRM matching process
      logTiming('CRM customer match', 'error', {
        matched: false,
        reason: 'CRM matching process failed'
      });
    }

    // Update booking with package info
    await supabase
      .from('bookings')
      .update({ package_info: packageInfo })
      .eq('id', booking.id);
    
    logTiming('Package info update', 'success', { packageInfo });
    
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
    logTiming('Data formatting', 'success');
    
    // Send notifications in parallel and wait for them to complete
    const notificationResults = await sendNotifications(
      formattedData,
      booking,
      bayDisplayName,
      crmCustomerId || undefined,
      stableHashId || undefined,
      packageInfo,
      customer_notes
    );

    // Log each notification type separately instead of logging them together
    if (notificationResults.success) {
      // Check individual notification results (if available)
      if ('results' in notificationResults && Array.isArray(notificationResults.results)) {
        // Email notification (first item in the results array)
        const emailResult = notificationResults.results[0];
        logTiming('Email notification', emailResult ? 'success' : 'error', {
          success: !!emailResult,
          recipient: booking.email,
          statusCode: emailResult?.status
        });
        
        // LINE notification (second item in the results array)
        const lineResult = notificationResults.results[1];
        logTiming('LINE notification', lineResult ? 'success' : 'error', {
          success: !!lineResult,
          statusCode: lineResult?.status
        });
      } else {
        // If we don't have detailed results, log overall success
        logTiming('Notifications', 'success', {
          success: true
        });
      }
    } else {
      // Log notification failure
      logTiming('Notifications', 'error', {
        success: false,
        error: (notificationResults as any).error?.message
      });
    }
    
    // 10. Trigger calendar creation in the background (still non-blocking)
    // This is non-blocking - we'll return to the user before it completes
    
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
    
    // Log calendar creation initiation
    logTiming('Calendar creation initiated', 'info', {
      bookingId: booking.id,
      bay: availableBay,
      bayDisplayName,
      startDateTime: calendarData.startDateTime,
      endDateTime: calendarData.endDateTime
    });

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
          const eventId = data.calendarEventId;
          const bookingToUpdateId = booking.id; // Capture booking id for use in this scope
          
          // Update booking with calendar event ID using the existing Anon Key client
          // Add proper error handling
          supabase
            .from('bookings')
            .update({ calendar_event_id: eventId })
            .eq('id', bookingToUpdateId) // Essential: target the correct booking
            .then(({ error: updateError }) => {
              if (updateError) {
                console.error(`[Booking Create API - Async] Failed to update booking ${bookingToUpdateId} with event ID ${eventId}:`, updateError);
                // Log the error to booking_process_logs if needed
                if (ENABLE_DETAILED_LOGGING && userId) {
                     logBookingProcessStep({
                        bookingId: bookingToUpdateId,
                        userId,
                        step: 'Update booking with calendar_event_id',
                        status: 'error',
                        durationMs: 0, // Duration isn't tracked precisely here
                        totalDurationMs: Date.now() - apiStartTime,
                        metadata: { error: updateError.message, eventId: eventId }
                    });
                }
              } else {
                console.log(`[Booking Create API - Async] Successfully updated booking ${bookingToUpdateId} with event ID ${eventId}`);
                // Log successful calendar creation AND booking update
                if (ENABLE_DETAILED_LOGGING && userId) {
                  logBookingProcessStep({
                    bookingId: bookingToUpdateId,
                    userId,
                    step: 'Calendar creation completed & booking updated',
                    status: 'success',
                    durationMs: data.processingTime || 0, // From calendar API response
                    totalDurationMs: Date.now() - apiStartTime,
                    metadata: {
                      calendarEventId: eventId,
                      processingTime: data.processingTime
                    }
                  });
                }
              }
            });
        } else {
            // Handle case where calendarEventId is missing from the response
            console.error(`[Booking Create API - Async] Calendar API call succeeded but event ID was missing for booking ${booking.id}. Response data:`, data);
             if (ENABLE_DETAILED_LOGGING && userId) {
                logBookingProcessStep({
                    bookingId: booking.id,
                    userId,
                    step: 'Update booking with calendar_event_id',
                    status: 'error',
                    durationMs: 0,
                    totalDurationMs: Date.now() - apiStartTime,
                    metadata: { error: 'Calendar event ID missing in calendar API response', responseData: data }
                });
            }
        }
      })
      .catch(error => {
        console.error('Error in calendar creation:', error);
        
        // Log calendar creation error
        if (ENABLE_DETAILED_LOGGING) {
          logBookingProcessStep({
            bookingId: booking.id,
            userId,
            step: 'Calendar creation error',
            status: 'error',
            durationMs: 0,
            totalDurationMs: Date.now() - apiStartTime,
            metadata: {
              error: error.message
            }
          });
        }
      });
    }, 0);

    // After successful booking creation, schedule review request for new customers
    if (isNewCustomer && token.sub) {
      try {
        // Check if this is a LINE user by examining the profile
        const { data: profile } = await supabase
          .from('profiles')
          .select('provider, provider_id')
          .eq('id', token.sub)
          .single();
        
        // Determine the notification provider (LINE or email)
        const provider = profile?.provider === 'line' ? 'line' : 'email';
        
        // Get the appropriate contact info based on the provider
        // For LINE users, use provider_id (LINE user ID) instead of user_id
        const contactInfo = provider === 'line' 
          ? profile?.provider_id || '' // Use LINE provider_id
          : booking.email;             // Use booking email for non-LINE users
        
        // Make sure we have valid contact info
        if (!contactInfo) {
          console.error('Missing contact info for review request', { provider, profile });
          throw new Error('Missing contact info for review request');
        }
        
        // Schedule the review request to be sent 30 minutes after booking ends
        // The scheduler will calculate this based on booking details
        const scheduled = await scheduleReviewRequest({
          bookingId: booking.id,
          userId: token.sub,
          provider,
          contactInfo
          // No delayMinutes - use booking end time + 30 minutes
        });
        
        if (scheduled) {
          logTiming('Review request scheduling', 'success', { 
            provider, 
            bookingId: booking.id,
            bookingDuration: booking.duration
          });
        } else {
          logTiming('Review request scheduling', 'error', { error: 'Failed to schedule' });
        }
      } catch (reviewRequestError) {
        // Log error but don't fail the booking process
        logTiming('Review request scheduling', 'error', { 
          error: reviewRequestError instanceof Error ? reviewRequestError.message : 'Unknown error'
        });
      }
    }

    // 11. Return success response to user with notification status
    return NextResponse.json({
      success: true,
      booking,
      bookingId: booking.id,
      bay: availableBay,
      bayDisplayName,
      crmCustomerId,
      stableHashId,
      notificationsSuccess: notificationResults.success,
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