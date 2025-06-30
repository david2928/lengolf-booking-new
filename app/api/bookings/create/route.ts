import { NextRequest, NextResponse } from 'next/server';
import { getToken } from 'next-auth/jwt';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/types/supabase';
import { formatBookingData } from '@/utils/booking-formatter';
import { executeParallel } from '@/utils/parallel-processing';
import { parse, addHours, addMinutes } from 'date-fns';
import { zonedTimeToUtc, formatInTimeZone } from 'date-fns-tz';
import { getOrCreateCrmMappingV2, normalizeCrmCustomerData } from '@/utils/customer-matching';
import { BAY_DISPLAY_NAMES, BAY_COLORS } from '@/lib/bayConfig';
import { BOOKING_CALENDARS } from '@/lib/bookingCalendarConfig';
import { calendar } from '@/lib/googleApiConfig';
import { v4 as uuidv4 } from 'uuid';
import { nextTick } from 'node:process';
import { scheduleReviewRequest } from '@/lib/reviewRequestScheduler';

// Create a dedicated Supabase client instance for admin operations within this route
// This client will use the Service Role Key.
let supabaseAdminClient: SupabaseClient<Database> | null = null;
const getSupabaseAdminClient = () => {
  if (!supabaseAdminClient) {
    supabaseAdminClient = createClient<Database>(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!, // CRITICAL: Use the Service Role Key
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
          detectSessionInUrl: false
        }
      }
    );
  }
  return supabaseAdminClient;
};

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
 * This centralizes the package info handling logic and uses the same 
 * sophisticated package selection as the VIP API
 */
async function getPackageInfo(stableHashId: string | null): Promise<string> {
  // Default package info
  let packageInfo = 'Normal Bay Rate';
  
  // If we have a stable hash ID, try to get package info
  if (stableHashId) {
    try {
      const supabase = getSupabaseAdminClient();
      const { data: packages, error: packagesError } = await supabase
        .schema('backoffice' as any)
        .rpc('get_packages_by_hash_id', { p_stable_hash_id: stableHashId });
      
      if (packagesError) {
        console.error('Error fetching packages:', packagesError);
        return packageInfo;
      }
      
      if (packages && packages.length > 0) {
        const now = new Date();
        
        // Filter for active, non-coaching packages using VIP logic
        const activePackages = packages.filter((pkg: any) => {
          // Skip coaching packages (using backoffice function field names)
          if (pkg.package_type_from_def?.toLowerCase().includes('coaching') || 
              pkg.package_name_from_def?.toLowerCase().includes('coaching')) {
            return false;
          }
          
          // Check if package is not expired
          const expirationDate = new Date(pkg.expiration_date || '');
          const isNotExpired = expirationDate > now;
          
          // Check if package has remaining capacity
          // Package is active if:
          // 1. Not expired, AND
          // 2. Either has remaining hours > 0 OR has no remaining_hours field (unlimited/session-based packages)
          const hasRemainingCapacity = pkg.calculated_remaining_hours === undefined || 
                                      pkg.calculated_remaining_hours === null || 
                                      pkg.calculated_remaining_hours > 0;
          
          return isNotExpired && hasRemainingCapacity;
        });
        
        if (activePackages.length > 0) {
          // Sort active packages to pick the best one:
          // 1. Packages with more remaining hours first
          // 2. Then by later expiration date
          const sortedPackages = activePackages.sort((a: any, b: any) => {
            // First, prioritize by remaining hours (more remaining hours = higher priority)
            const aRemainingHours = a.calculated_remaining_hours ?? Infinity; // Treat unlimited as highest priority
            const bRemainingHours = b.calculated_remaining_hours ?? Infinity;
            
            if (aRemainingHours !== bRemainingHours) {
              return bRemainingHours - aRemainingHours; // Descending order (more hours first)
            }
            
            // If remaining hours are equal, prioritize by later expiration date
            const aExpiration = new Date(a.expiration_date || '1970-01-01').getTime();
            const bExpiration = new Date(b.expiration_date || '1970-01-01').getTime();
            
            return bExpiration - aExpiration; // Descending order (later expiration first)
          });
          
          const selectedPackage = sortedPackages[0];
          
          // Use package_name which contains the full descriptive name like "Gold (30H)"
          const packageName = selectedPackage.package_name_from_def || 
                             selectedPackage.package_display_name_from_def || 
                             selectedPackage.package_type_from_def || 
                             'Package';
          packageInfo = `Package (${packageName})`;
          
          console.log(`[getPackageInfo] Selected package for ${stableHashId}:`, {
            packageName,
            remainingHours: selectedPackage.calculated_remaining_hours,
            expirationDate: selectedPackage.expiration_date,
            totalActivePackages: activePackages.length
          });
        } else {
          console.log(`[getPackageInfo] No active packages found for ${stableHashId}. Total packages: ${packages.length}`);
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
  // const internalApiBasePath = ''; // No longer using relative paths for internal calls
  
  const notificationTasks = [
    // Email notification
    async () => {
      try {
        console.log('[CreateBooking Email Notify Task] Starting email notification task.');
        const userName = booking.name;
        const subjectName = crmCustomerId ? (formattedData.customerName || booking.name) : booking.name;
        
        const emailData = {
          userName,
          subjectName,
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
          customerNotes,
          bookingId: booking.id
        };

        console.log('[CreateBooking Email Notify Task] Prepared emailData:', JSON.stringify(emailData, null, 2));
        
        const response = await fetch(`${baseUrl}/api/notifications/email`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(emailData),
        });

        console.log(`[CreateBooking Email Notify Task] Response status from /api/notifications/email: ${response.status}`);
        if (!response.ok) {
          const errorBody = await response.text();
          console.error(`[CreateBooking Email Notify Task] Error from /api/notifications/email: ${response.status}`, errorBody);
          // Throw an error to be caught by executeParallel or handled in its .then()
          throw new Error(`Email notification failed: ${response.status} - ${errorBody}`);
        }
        return response; // Return the original Response object on success
      } catch (error) {
        console.error('[CreateBooking Email Notify Task] Error sending email notification:', error);
        // Throw the error to be handled by executeParallel
        throw error;
      }
    },
    
    // LINE notification
    async () => {
      try {
        console.log('[CreateBooking LINE Notify Task] Starting LINE notification task.');
        const customerNameForLine = formattedData.customerName || booking.name;
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
          customerNotes,
          bookingId: booking.id
        };
        
        console.log('[CreateBooking LINE Notify Task] Prepared lineData:', JSON.stringify(lineData, null, 2));
        
        const response = await fetch(`${baseUrl}/api/notifications/line`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(lineData),
        });

        console.log(`[CreateBooking LINE Notify Task] Response status from /api/notifications/line: ${response.status}`);
        
        if (!response.ok) {
          const errorBody = await response.text();
          console.error(`[CreateBooking LINE Notify Task] Error from /api/notifications/line: ${response.status}`, errorBody);
          // Throw an error to be caught by executeParallel or handled in its .then()
          throw new Error(`LINE notification failed: ${response.status} - ${errorBody}`);
        }
        return response; // Return the original Response object on success

      } catch (error) {
        console.error('[CreateBooking LINE Notify Task] Error sending LINE notification:', error);
        // Throw the error to be handled by executeParallel
        throw error;
      }
    }
  ];
  
  // Return the promise for all notifications completing
  return executeParallel(notificationTasks, { timeout: 10000 })
    .then(results => {
      console.log('All notification tasks attempted. Results count:', results.length);
      results.forEach((result, index) => {
        if (result instanceof Error) {
          console.warn(`[CreateBooking Notify Task ${index === 0 ? 'Email' : 'LINE'}] Task failed:`, result.message);
        } else if (result && !result.ok) {
          // This case might be redundant if !response.ok throws an error, but good for safety
          console.warn(`[CreateBooking Notify Task ${index === 0 ? 'Email' : 'LINE'}] Task HTTP error: Status ${result.status}`);
        } else {
          console.log(`[CreateBooking Notify Task ${index === 0 ? 'Email' : 'LINE'}] Task completed, status: ${result?.status}`);
        }
      });
      // Determine overall success based on whether any task threw an error or returned a non-ok response
      const allSucceeded = results.every(result => !(result instanceof Error) && result?.ok);
      return { success: allSucceeded, results };
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
    const supabase = getSupabaseAdminClient();
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
      customer_notes,
      stable_hash_id: clientSentStableHashId
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

    // Get base URL for API calls that might be used outside sendNotifications if any
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
      
      // CRM matching V2 - streamlined approach using only V2 architecture
      (async () => {
        if (!token.sub) return null;
        
        try {
          console.log(`[CRM Matching V2] Attempting match for profile ${userId} with booking phone: ${phone_number}`);
          const v2Result = await getOrCreateCrmMappingV2(userId, { 
            source: 'booking',
            phoneNumberToMatch: phone_number
          });
          
          if (v2Result) {
            console.log(`[CRM Matching V2] Match result - Customer: ${v2Result.crmCustomerId}, New: ${v2Result.isNewMatch}`);
            return {
              ...v2Result,
              dataSource: 'v2_architecture'
            };
          }
          
          return null;
        } catch (error) {
          console.error('Error in CRM matching V2:', error);
          return null;
        }
      })()
    ]).catch(error => {
      console.error('Error in parallel operations:', error);
      logTiming('Parallel operations failure', 'error', { error: error.message });
      return [{ available: false }, null];
    });
    
    // Log more detailed info about the results
    logTiming('Parallel operations (availability + CRM V2)', 'success', {
      bayAvailability: availabilityResult?.available || false,
      availableBays: (availabilityResult as any)?.allAvailableBays || [],
      crmMatchFound: !!(crmMappingResult as any)?.crmCustomerId,
      isNewCrmMatch: !!(crmMappingResult as any)?.isNewMatch,
      dataSource: (crmMappingResult as any)?.dataSource || 'unknown'
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
    let stableHashId: string | null = null;
    let crmCustomerData = null;
    let customerName = null;
    let isNewCustomer = true; // Flag to identify new customers

    if (crmMappingResult) {
      // Explicitly type crmMappingResult for clarity if not already strongly typed
      const typedCrmMappingResult = crmMappingResult as ({ profileId: string; crmCustomerId: string; stableHashId: string; crmCustomerData?: any; isNewMatch: boolean; } | null);
      
      if (typedCrmMappingResult && typedCrmMappingResult.crmCustomerId) { // Check for crmCustomerId to ensure it's a full match object
        crmCustomerId = typedCrmMappingResult.crmCustomerId;
        stableHashId = typedCrmMappingResult.stableHashId; // This is the CRM-derived stableHashId
        isNewCustomer = typedCrmMappingResult.isNewMatch; // isNewMatch is more accurate than just setting to false
        
        if (typedCrmMappingResult.crmCustomerData) {
          crmCustomerData = typedCrmMappingResult.crmCustomerData;
          const normalizedCrmData = normalizeCrmCustomerData(crmCustomerData);
          if (normalizedCrmData?.name) {
            customerName = normalizedCrmData.name;
          }
        }
      }
    }
    logTiming('CRM data processing', 'success', { crmCustomerIdObtained: !!crmCustomerId, stableHashIdObtained: !!stableHashId });

    // --- BEGIN: V2 Architecture - Update profile stable_hash_id only ---
    if (stableHashId && crmCustomerId) {
      try {
        const supabase = getSupabaseAdminClient();

        // Update profile with stable_hash_id (V2 architecture handles profile links automatically)
        const { data: profile, error: profileError } = await supabase
          .from('profiles')
          .select('display_name, phone_number, email')
          .eq('id', userId)
          .single();

        if (profile?.display_name) {
          await supabase
            .from('profiles')
            .update({ stable_hash_id: stableHashId })
            .eq('id', userId)
            .select();
          logTiming('UpdatedProfilesStableHashId V2', 'info', { userId, stableHashId });
        }
        
      } catch (propagationError) {
        console.error('[CreateBooking API V2] Error updating profile stable_hash_id:', propagationError);
        logTiming('PropagationErrorStableHashId V2', 'error', { userId, error: (propagationError as Error).message });
      }
    }
    // --- END: V2 Architecture profile update ---

    // Determine the final stable_hash_id to be saved with the booking
    // Prioritize server-derived (CRM-verified) stableHashId
    const finalStableHashIdForBooking = stableHashId || clientSentStableHashId || null;
    
    // Log what stable_hash_id we're actually using for the booking
    console.log(`[CreateBooking API] Final stable_hash_id for booking: ${finalStableHashIdForBooking} (server-derived: ${stableHashId}, client-sent: ${clientSentStableHashId})`);

    // 8. Create the booking record with initial calendar sync status
    const supabase = getSupabaseAdminClient();
    const { data: booking, error: bookingError } = await supabase
      .from('bookings')
      .insert({
        id: generateBookingId(),
        user_id: userId,
        name: name,
        email: email,
        phone_number: phone_number,
        date: date,
        start_time: start_time,
        duration: parseFloat(duration),
        number_of_people: parseInt(number_of_people),
        bay: availableBay,
        status: 'confirmed',
        customer_notes: customer_notes,
        stable_hash_id: finalStableHashIdForBooking,
        google_calendar_sync_status: 'pending'
      })
      .select()
      .single();

    if (bookingError) {
      console.error('Error creating booking:', bookingError);
      logTiming('Booking creation', 'error', { error: bookingError.message });
      return NextResponse.json(
        { error: 'Failed to create booking' },
        { status: 500 }
      );
    }

    // Update bookingId once we have it
    bookingId = booking.id;
    console.log('✅ Booking created successfully:', booking);
    logTiming('Booking creation', 'success', { 
      bookingId: booking.id, 
      bay: availableBay,
      calendarSyncStatus: 'pending'
    });

    // If we don't have a customer name from CRM, use the booking name
    if (!customerName) {
      customerName = booking.name;
    }
    
    // Get package info using the centralized function
    // Pass the stableHashId we know to be correct to avoid re-querying
    const packageInfo = await getPackageInfo(finalStableHashIdForBooking);
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

    // Derive booking_type and package_name from packageInfo string
    let derivedBookingType: string;
    let derivedPackageName: string | null = null;

    const packagePrefix = 'Package (';
    if (packageInfo.startsWith(packagePrefix) && packageInfo.endsWith(')')) {
      derivedBookingType = 'Package';
      derivedPackageName = packageInfo.substring(packagePrefix.length, packageInfo.length - 1);
    } else {
      derivedBookingType = packageInfo; // e.g., "Normal Bay Rate", "Coaching", etc.
      // derivedPackageName remains null
    }

    // Update booking with booking_type and package_name
    const { error: updateBookingTypeError } = await supabase
      .from('bookings')
      .update({ 
        booking_type: derivedBookingType,
        package_name: derivedPackageName
      })
      .eq('id', booking.id);

    if (updateBookingTypeError) {
      console.error('Error updating booking with type and package name:', updateBookingTypeError);
      logTiming('Booking type/package update', 'error', { error: updateBookingTypeError.message });
      // Decide if this is a critical error to stop the process
    } else {
      logTiming('Booking type/package update', 'success', { booking_type: derivedBookingType, package_name: derivedPackageName });
    }
    
    // Update the local booking object with these details
    // Also, set package_info on the local object for compatibility with formatBookingData if it expects it.
    // This assumes 'booking' type might need casting or is flexible.
    booking.booking_type = derivedBookingType;
    booking.package_name = derivedPackageName;
    (booking as any).package_info = packageInfo; // For downstream compatibility (e.g. formatBookingData)

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
      finalStableHashIdForBooking || undefined,
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
      const calendarCreationStartTime = Date.now();
      
      // Create an AbortController for proper request cancellation
      const abortController = new AbortController();
      
      // Add a timeout for the calendar creation request - increased to 60 seconds
      const calendarPromise = fetch(`${baseUrl}/api/bookings/calendar/create`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': request.headers.get('Authorization') || ''
        },
        body: JSON.stringify(calendarData),
        signal: abortController.signal
      });

      // Add a timeout wrapper - increased to 60 seconds
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => {
          abortController.abort();
          reject(new Error('Calendar creation timeout after 60 seconds'));
        }, 60000);
      });

      Promise.race([calendarPromise, timeoutPromise])
      .then((response: any) => {
        if (!response.ok) {
          throw new Error(`Calendar creation failed with status: ${response.status}`);
        }
        return response.json();
      })
      .then(async (data) => {
        const calendarCreationDuration = Date.now() - calendarCreationStartTime;
        
        if (data.calendarEventId) {
          const eventId = data.calendarEventId;
          const bookingToUpdateId = booking.id; // Capture booking id for use in this scope
          
          // Determine calendarId based on the booking's bay
          // booking.bay should be available here from the earlier insert/select
          const bookedBay = booking.bay; // Assuming booking object is in scope and has .bay
          const calendarIdForUpdate = bookedBay ? BOOKING_CALENDARS[bookedBay as keyof typeof BOOKING_CALENDARS] : undefined;

          if (!calendarIdForUpdate) {
            console.error(`[Booking Create API - Async] Could not determine calendarId for booking ${bookingToUpdateId} with bay ${bookedBay}. Cannot update calendar_events.`);
            if (ENABLE_DETAILED_LOGGING && userId) {
              logBookingProcessStep({
                bookingId: bookingToUpdateId,
                userId,
                step: 'Update booking with calendar_events',
                status: 'error',
                durationMs: calendarCreationDuration,
                totalDurationMs: Date.now() - apiStartTime,
                metadata: { error: 'Could not determine calendarId for update', eventId: eventId, bay: bookedBay }
              });
            }
            return; // Stop if no calendarId can be found
          }

          const newCalendarEventsEntry = [{
            eventId: eventId,
            calendarId: calendarIdForUpdate,
            status: "confirmed"
          }];
          
          // Update booking with the new calendar_events field
          console.log(`[Booking Create API - Async] Attempting to update booking ${bookingToUpdateId} with calendar_events:`, newCalendarEventsEntry);
          
          try {
            const response = await getSupabaseAdminClient()
              .from('bookings')
              .update({ 
                calendar_events: newCalendarEventsEntry,
                google_calendar_sync_status: 'synced'
              })
              .eq('id', bookingToUpdateId);
              
            const updateDuration = Date.now() - calendarCreationStartTime;
            const { error: updateError, data: updateData } = response;
            
            if (updateError) {
              console.error(`[Booking Create API - Async] Failed to update booking ${bookingToUpdateId} with calendar_events. Error:`, JSON.stringify(updateError, null, 2), "Payload:", newCalendarEventsEntry);
              
              // Log to booking_process_logs table with detailed error info
              if (ENABLE_DETAILED_LOGGING && userId) {
                logBookingProcessStep({
                  bookingId: bookingToUpdateId,
                  userId,
                  step: 'Update booking with calendar_events',
                  status: 'error',
                  durationMs: updateDuration,
                  totalDurationMs: Date.now() - apiStartTime,
                  metadata: { 
                    error: updateError.message, 
                    errorCode: updateError.code,
                    errorDetails: updateError.details,
                    eventDetails: newCalendarEventsEntry,
                    supabaseErrorHint: updateError.hint
                  }
                });
              }
              
              // Set sync status to failed
              await getSupabaseAdminClient()
                .from('bookings')
                .update({ google_calendar_sync_status: 'failed' })
                .eq('id', bookingToUpdateId);
              
              console.log(`[Booking Create API - Async] Set sync status to failed for booking ${bookingToUpdateId}`);
            } else {
              console.log(`[Booking Create API - Async] Successfully updated booking ${bookingToUpdateId} with calendar_events ${JSON.stringify(newCalendarEventsEntry)}`);
              
              // Log successful calendar creation AND booking update
              if (ENABLE_DETAILED_LOGGING && userId) {
                logBookingProcessStep({
                  bookingId: bookingToUpdateId,
                  userId,
                  step: 'Calendar creation completed & booking updated with calendar_events',
                  status: 'success',
                  durationMs: updateDuration,
                  totalDurationMs: Date.now() - apiStartTime,
                  metadata: {
                    calendarEvents: newCalendarEventsEntry,
                    processingTime: data.processingTime,
                    calendarCreationDuration,
                    updateDuration
                  }
                });
              }
            }
          } catch (updateError: any) {
            console.error(`[Booking Create API - Async] Exception in booking update for ${bookingToUpdateId}:`, updateError);
            
            if (ENABLE_DETAILED_LOGGING && userId) {
              logBookingProcessStep({
                bookingId: bookingToUpdateId,
                userId,
                step: 'Update booking with calendar_events - exception',
                status: 'error',
                durationMs: Date.now() - calendarCreationStartTime,
                totalDurationMs: Date.now() - apiStartTime,
                metadata: { 
                  error: updateError.message,
                  eventDetails: newCalendarEventsEntry
                }
              });
            }
          }
        } else {
            // Handle case where calendarEventId is missing from the response
            console.error(`[Booking Create API - Async] Calendar API call succeeded but event ID was missing for booking ${booking.id}. Response data:`, data);
            
            if (ENABLE_DETAILED_LOGGING && userId) {
                logBookingProcessStep({
                    bookingId: booking.id,
                    userId,
                    step: 'Calendar creation - missing event ID',
                    status: 'error',
                    durationMs: calendarCreationDuration,
                    totalDurationMs: Date.now() - apiStartTime,
                    metadata: { 
                      error: 'Calendar event ID missing in calendar API response', 
                      responseData: data,
                      calendarCreationDuration
                    }
                });
            }
            
            // Set sync status to failed
            getSupabaseAdminClient()
              .from('bookings')
              .update({ google_calendar_sync_status: 'failed' })
              .eq('id', booking.id)
              .then(() => {
                console.log(`[Booking Create API - Async] Set sync status to failed for booking ${booking.id} due to missing event ID`);
              });
        }
      })
      .catch(calendarApiError => {
        const calendarCreationDuration = Date.now() - calendarCreationStartTime;
        console.error(`[Booking Create API - Async] Google Calendar API call failed for booking ${booking.id}. Error:`, calendarApiError instanceof Error ? calendarApiError.message : JSON.stringify(calendarApiError), "Request Data Sent:", calendarData );
        
        // Log calendar creation error with more detail
        if (ENABLE_DETAILED_LOGGING && userId) {
          logBookingProcessStep({
            bookingId: booking.id,
            userId,
            step: 'Calendar creation error',
            status: 'error',
            durationMs: calendarCreationDuration,
            totalDurationMs: Date.now() - apiStartTime,
            metadata: {
              error: calendarApiError instanceof Error ? calendarApiError.message : JSON.stringify(calendarApiError),
              errorType: calendarApiError?.name || 'Unknown',
              isTimeout: calendarApiError?.message?.includes('timeout'),
              calendarData: calendarData,
              calendarCreationDuration
            }
          });
        }
        
        // Set sync status to failed
        getSupabaseAdminClient()
          .from('bookings')
          .update({ google_calendar_sync_status: 'failed' })
          .eq('id', booking.id)
          .then(() => {
            console.log(`[Booking Create API - Async] Set sync status to failed for booking ${booking.id} due to calendar API error`);
          });
      });
    }, 0);

    // After successful booking creation, schedule review request for new customers
    if (isNewCustomer && token.sub) {
      try {
        // Check if a review request has already been successfully sent to this user
        const { data: existingSentRequest, error: sentCheckError } = await getSupabaseAdminClient()
          .from('scheduled_review_requests')
          .select('id')
          .eq('user_id', token.sub)
          .eq('status', 'sent') // Check for successfully sent surveys
          .limit(1)
          .maybeSingle();

        if (sentCheckError) {
          console.error('Error checking for existing sent review requests:', sentCheckError);
          // Log timing for this error
          logTiming('Review request pre-check', 'error', { 
            userId: token.sub, 
            error: 'Failed to check for existing sent requests' 
          });
          // Depending on policy, you might want to not schedule if this check fails.
          // For now, it will proceed if the check errors out (existingSentRequest would be null).
        }

        if (existingSentRequest) {
          logTiming('Review request skipped', 'info', { 
            reason: 'User has already received a successfully sent survey', 
            userId: token.sub,
            existingRequestId: existingSentRequest.id
          });
        } else {
          // Proceed with scheduling if no prior 'sent' survey
          // Check if this is a LINE user by examining the profile
          const { data: profile, error: profileError } = await getSupabaseAdminClient()
            .from('profiles')
            .select('display_name, phone_number, email')
            .eq('id', token.sub)
            .single();

          if (profileError) {
            console.error('Error fetching user profile for review request:', profileError);
            logTiming('Review request scheduling', 'error', { 
              error: 'Failed to fetch user profile', 
              userId: token.sub 
            });
            // throw new Error('Failed to fetch user profile for review request'); // Or handle differently
          } else {
            // Determine the notification provider (LINE or email)
            const provider = profile?.display_name === 'LINE' ? 'line' : 'email';
            
            // Get the appropriate contact info based on the provider
            // For LINE users, use phone_number (LINE user ID) instead of email
            const contactInfo = provider === 'line' 
              ? profile?.phone_number || '' // Use LINE phone_number
              : booking.email;             // Use booking email for non-LINE users
            
            // Make sure we have valid contact info
            if (!contactInfo) {
              console.error('Missing contact info for review request', { provider, profileFromDb: profile }); // Renamed for clarity
              logTiming('Review request scheduling', 'error', { 
                error: 'Missing contact info', 
                userId: token.sub, 
                provider 
              });
              // Potentially throw new Error('Missing contact info for review request');
            } else {
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
                logTiming('Review request scheduling', 'error', { error: 'Failed to schedule via scheduleReviewRequest lib function' });
              }
            }
          }
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