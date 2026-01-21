import { NextRequest, NextResponse } from 'next/server';
import { getToken } from 'next-auth/jwt';
import { createAdminClient } from '@/utils/supabase/admin';
import { formatBookingData } from '@/utils/booking-formatter';
import { executeParallel } from '@/utils/parallel-processing';

import { findOrCreateCustomer, getPackageInfoForCustomer } from '@/utils/customer-service';
import { BAY_DISPLAY_NAMES } from '@/lib/bayConfig';
import { scheduleReviewRequest } from '@/lib/reviewRequestScheduler';

const supabase = createAdminClient();

// Configuration for detailed booking process logging
const ENABLE_DETAILED_LOGGING = process.env.ENABLE_BOOKING_DETAILED_LOGGING === 'true';

// Type definitions for the availability check
interface AvailabilityResult {
  available: boolean;
  bay?: string;
  allAvailableBays?: string[];
}

// Type definitions for customer service results
interface CustomerResult {
  customer: {
    id: string;
    customer_code: string;
    customer_name: string;
  };
  is_new_customer: boolean;
  match_method: string;
  confidence: number;
}

// Type definition for notification results
interface NotificationResults {
  success: boolean;
  error?: { message: string };
  results?: unknown[];
}


// Helper function to generate a booking ID
const generateBookingId = () => {
  const timestamp = new Date().toISOString().slice(2, 10).replace(/-/g, '');
  const randomNum = Math.random().toString(36).substring(2, 6).toUpperCase();
  return `BK${timestamp}${randomNum}`;
};


// Helper function to send notifications
async function sendNotifications(formattedData: Record<string, unknown>, booking: Record<string, unknown>, bayDisplayName: string, customerCode?: string, packageInfo: string = 'Normal Bay Rate', customerNotes?: string) {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
  // const internalApiBasePath = ''; // No longer using relative paths for internal calls
  
  const notificationTasks = [
    // Email notification
    async () => {
      try {
        console.log('[CreateBooking Email Notify Task] Starting email notification task.');
        const userName = booking.name;
        const subjectName = customerCode ? (formattedData.customerName || booking.name) : booking.name;
        
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
          customerCode,
          skipCustomerMatch: true,
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
        const lineCustomerName = customerCode ? customerNameForLine : "New Customer";
        
        const lineData = {
          customerName: lineCustomerName,
          bookingName: (formattedData as { lineNotification?: { bookingName?: string } }).lineNotification?.bookingName || (booking as { name: string }).name,
          email: booking.email,
          phoneNumber: booking.phone_number,
          bookingDate: formattedData.formattedDate || booking.date,
          bookingStartTime: booking.start_time,
          bookingEndTime: formattedData.endTime,
          bayNumber: bayDisplayName,
          duration: booking.duration,
          numberOfPeople: booking.number_of_people,
          profileId: booking.user_id,
          customerCode,
          skipCustomerMatch: true,
          packageInfo,
          bookingType: booking.booking_type, // Add booking_type from database
          packageName: booking.package_name, // Add package_name from database
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
  metadata?: Record<string, unknown>;
}) {
  if (!ENABLE_DETAILED_LOGGING) return;

  try {
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
    let customerId: string | null = null; // Will be set for LIFF users
    let customerCode: string | null = null; // Will be set for LIFF users
    let isLiffContext = false;

    const logTiming = (step: string, status: 'success' | 'error' | 'info' = 'info', metadata: Record<string, unknown> = {}) => {
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

    // 1. Authenticate user - support both NextAuth and LIFF context
    const lineUserId = request.headers.get('x-line-user-id');

    if (lineUserId) {
      // LIFF context - get profile from profiles table
      // Customer matching will happen via findOrCreateCustomer() same as website flow
      isLiffContext = true;
      console.log('[LIFF Auth] Authenticating with LINE user ID:', lineUserId);

      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('id')
        .eq('provider', 'line')
        .eq('provider_id', lineUserId)
        .maybeSingle();

      if (profileError || !profile) {
        console.error('[LIFF Auth] Profile lookup error:', profileError);
        return NextResponse.json(
          { error: 'LINE account not found' },
          { status: 401 }
        );
      }

      userId = profile.id;
      // Note: customerId will be set by findOrCreateCustomer() later, same as website flow

      logTiming('LIFF Authentication', 'success', { lineUserId, profileId: userId });
    } else {
      // Standard NextAuth flow
      const token = await getToken({ req: request });
      if (!token?.sub) {
        return NextResponse.json(
          { error: 'Unauthorized or session expired' },
          { status: 401 }
        );
      }
      userId = token.sub;
      logTiming('Authentication', 'success');
    }

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
      package_id: playFoodPackageId,
      package_info: playFoodPackageInfo,
      preferred_bay_type
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

    // 3. Date validation (native database function handles parsing)
    logTiming('Date validation', 'success');

    // 5. Run bay availability check (and customer identification for non-LIFF context) in parallel
    // For LIFF context, we already have customerId from authentication step
    const checkBayAvailability = async () => {
      try {
        // Native database function handles date parsing
        // Use native database function instead of Google Calendar

        const { data: bayAvailability, error } = await supabase.rpc('check_all_bays_availability', {
          p_date: date,
          p_start_time: start_time,
          p_duration: parseFloat(duration),
          p_exclude_booking_id: null
        });

        if (error) {
          console.error('Database function error:', error);
          return { available: false };
        }

        // Transform database response
        if (!bayAvailability) {
          return { available: false };
        }

        // Extract the actual bay availability object from the database response
        let bayData = bayAvailability;
        if (Array.isArray(bayAvailability) && bayAvailability.length > 0) {
          // If it's an array, take the first element
          bayData = bayAvailability[0];
        }

        if (typeof bayData !== 'object') {
          return { available: false };
        }

        // Find available bays
        const availableBays = Object.entries(bayData)
          .filter(([, isAvailable]) => isAvailable === true)
          .map(([bayName]) => bayName);

        if (availableBays.length === 0) {
          return { available: false };
        }

        // Prefer specific bay type if requested and available
        let selectedBay = availableBays[0]; // Default to first available

        if (preferred_bay_type) {
          let preferredBays: string[] = [];

          if (preferred_bay_type === 'social') {
            // Social bays are Bay 1, 2, 3
            preferredBays = ['Bay 1', 'Bay 2', 'Bay 3'];
          } else if (preferred_bay_type === 'ai_lab') {
            // AI Lab is Bay 4
            preferredBays = ['Bay 4'];
          }

          // Find first available bay of preferred type
          const availablePreferredBay = preferredBays.find(bay => availableBays.includes(bay));
          if (availablePreferredBay) {
            selectedBay = availablePreferredBay;
          }
          // If preferred type is not available, still fallback to any available bay
          // selectedBay already set to availableBays[0] above
        }

        return {
          available: true,
          bay: selectedBay,
          allAvailableBays: availableBays
        };
      } catch (error) {
        console.error('Error checking bay availability:', error);
        return { available: false };
      }
    };

    // Run bay availability check and customer identification in parallel
    // Same flow for both LIFF and website - findOrCreateCustomer handles customer matching
    const [availabilityResult, customerResult] = await Promise.all([
      checkBayAvailability(),
      // Customer identification using customer service
      (async () => {
        try {
          console.log(`[Customer Service] Starting customer identification for user ${userId}${isLiffContext ? ' (LIFF)' : ''}`);

          const result = await findOrCreateCustomer(userId, name, phone_number, email);

          console.log(`[Customer Service] Customer identification result:`, {
            isNew: result.is_new_customer,
            method: result.match_method,
            confidence: result.confidence,
            customerId: result.customer.id,
            customerCode: result.customer.customer_code
          });

          return result;

        } catch (error) {
          console.error('Error in customer service:', error);
          throw error; // Let the booking fail if customer service fails
        }
      })()
    ]).catch(error => {
      console.error('Error in parallel operations:', error);
      logTiming('Parallel operations failure', 'error', { error: error.message });
      return [{ available: false, allAvailableBays: [] as string[] } as AvailabilityResult, null as CustomerResult | null] as const;
    });

    // Log more detailed info about the results
    logTiming('Parallel operations (availability + customer service)', 'success', {
      bayAvailability: (availabilityResult as AvailabilityResult)?.available || false,
      availableBays: (availabilityResult as AvailabilityResult)?.allAvailableBays || [],
      customerFound: !!(customerResult as CustomerResult | null)?.customer?.id,
      isNewCustomer: !!(customerResult as CustomerResult | null)?.is_new_customer,
      matchMethod: (customerResult as CustomerResult | null)?.match_method || 'unknown',
      confidence: (customerResult as CustomerResult | null)?.confidence || 0,
      isLiffContext
    });

    // 6. Handle availability result
    if (!availabilityResult || !availabilityResult.available) {
      logTiming('Bay availability check', 'error', { 
        available: false,
        availabilityResult: availabilityResult,
        preferred_bay_type: preferred_bay_type,
        date: date,
        start_time: start_time,
        duration: duration
      });
      return NextResponse.json(
        { error: 'No bays available for the selected time slot' },
        { status: 400 }
      );
    }

    // Get the assigned bay and its display name
    const availabilityResultWithBay = availabilityResult as AvailabilityResult & { bay: string };
    const availableBay = availabilityResultWithBay.bay;
    const bayDisplayName = BAY_DISPLAY_NAMES[availableBay] || availableBay;

    // 7. Handle customer identification result
    // Same flow for both LIFF and website - use customerResult from findOrCreateCustomer
    let customerName: string | null = null;
    let isNewCustomer = false;

    if (customerResult) {
      const customer = (customerResult as CustomerResult).customer;
      if (customer && customer.id) {
        customerId = customer.id;
        customerCode = customer.customer_code;
        customerName = customer.customer_name;
        isNewCustomer = (customerResult as CustomerResult).is_new_customer;

        console.log(`[Customer Service] Using customer: ${customerCode} (${customerId}), New: ${isNewCustomer}${isLiffContext ? ' (LIFF)' : ''}`);
      }
      logTiming('Customer data processing', 'success', {
        customerIdObtained: !!customerId,
        customerCodeObtained: !!customerCode,
        isLiffContext
      });
    } else {
      // If customer identification failed, fail the booking
      logTiming('Customer identification', 'error', { error: 'Customer identification failed' });
      return NextResponse.json(
        { error: 'Failed to identify or create customer' },
        { status: 500 }
      );
    }

    // Profile linking is now handled automatically within findOrCreateCustomer

    // 7.5. Get package info using customer service (BEFORE booking creation)
    let packageInfo = 'Normal Bay Rate';
    let packageId: string | undefined;
    let packageTypeName: string | undefined;
    if (customerId) {
      try {
        // Exclude coaching packages from website bookings - they should only be used via LIFF coaching flow
        const packageResult = await getPackageInfoForCustomer(customerId, {
          excludeCategories: ['coaching']
        });
        packageInfo = packageResult.packageInfo;
        packageId = packageResult.packageId;
        packageTypeName = packageResult.packageTypeName;
        console.log(`[Customer Service] Package info for ${customerCode}: ${packageInfo}${ packageId ? ` (ID: ${packageId})` : ''}`);
      } catch (packageError) {
        console.error('Failed to get package info:', packageError);
        // Continue with default package info
      }
    }
    logTiming('Package info lookup', 'success', { packageInfo, packageId, customerId });

    // Log detailed customer identification information after package info is available
    if (customerResult) {
      logTiming('Customer identification', 'success', {
        customerId,
        customerCode,
        matchedName: customerName,
        isNewCustomer,
        matchMethod: (customerResult as CustomerResult)?.match_method,
        confidence: (customerResult as CustomerResult)?.confidence,
        isLiffContext,
        customerDetails: {
          hasActivePackage: !!packageInfo && packageInfo !== 'Normal Bay Rate',
          packageInfo,
          packageId
        }
      });
    }

    // 7.6. Derive booking_type and package_name from packageInfo string (BEFORE booking creation)
    let derivedBookingType: string;
    let derivedPackageName: string | null = null;
    let derivedPackageId: string | undefined;

    // Check for Play & Food packages first (only if they have the specific SET_ format)
    if (playFoodPackageId && playFoodPackageInfo && playFoodPackageId.startsWith('SET_')) {
      derivedBookingType = 'Play_Food_Package';
      derivedPackageName = playFoodPackageId; // Use the package ID (SET_A, SET_B, SET_C)
      // Don't set derivedPackageId for Play & Food packages
      console.log(`[Play & Food Package] Booking type: ${derivedBookingType}, Package: ${derivedPackageName}`);
    }
    // Then check for simulator/coaching packages (anything other than "Normal Bay Rate")
    else if (packageInfo !== 'Normal Bay Rate') {
      derivedBookingType = 'Package';
      // Use the full package type name (e.g., "Silver (15H)") from the database
      derivedPackageName = packageTypeName || packageInfo;
      derivedPackageId = packageId; // Set package_id for simulator packages
      console.log(`[Simulator Package] Booking type: ${derivedBookingType}, Package: ${derivedPackageName}, ID: ${derivedPackageId}`);
    } else {
      derivedBookingType = packageInfo; // "Normal Bay Rate"
      // derivedPackageName and derivedPackageId remain null/undefined
      console.log(`[Normal Booking] Booking type: ${derivedBookingType}`);
    }

    // 8. Create the booking record with customer information AND booking_type
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
        customer_id: customerId, // NEW: Direct customer reference
        is_new_customer: isNewCustomer,
        booking_type: derivedBookingType, // NEW: Include booking_type from the start
        package_name: derivedPackageName, // NEW: Include package_name from the start
        package_id: derivedPackageId // NEW: Include package_id from the start (undefined for non-simulator packages)
        // REMOVED: stable_hash_id (deprecated)
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
      booking_type: derivedBookingType,
      package_name: derivedPackageName,
      package_id: derivedPackageId
    });

    // If we don't have a customer name from the system, use the booking name
    if (!customerName) {
      customerName = booking.name;
    }

    // Update the local booking object with package_info for compatibility with formatBookingData
    (booking as Record<string, unknown>).package_info = packageInfo; // For downstream compatibility (e.g. formatBookingData)

    // 9. Format booking data for all services
    const formattedData = formatBookingData({
      booking,
      crmData: customerId ? {
        id: customerCode || customerId,
        name: customerName || undefined  // Use the customer name from customer service (convert null to undefined)
      } : null,
      bayInfo: {
        id: availableBay,
        displayName: bayDisplayName
      },
      isNewCustomer: isNewCustomer
    });
    logTiming('Data formatting', 'success');
    
    // Send notifications in parallel and wait for them to complete
    const notificationResults = await sendNotifications(
      formattedData,
      booking,
      bayDisplayName,
      customerCode || customerId || undefined, // Use customer code/ID
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
        error: (notificationResults as NotificationResults).error?.message
      });
    }
    
    // Calendar integration has been removed - booking creation is now complete

    // After successful booking creation, schedule review request for new customers
    // Note: LIFF users are always existing customers, so this only applies to NextAuth users
    if (isNewCustomer && userId && !isLiffContext) {
      try {
        // Check if a review request has already been successfully sent to this user
        const { data: existingSentRequest, error: sentCheckError } = await supabase
          .from('scheduled_review_requests')
          .select('id')
          .eq('user_id', userId)
          .eq('status', 'sent') // Check for successfully sent surveys
          .limit(1)
          .maybeSingle();

        if (sentCheckError) {
          console.error('Error checking for existing sent review requests:', sentCheckError);
          // Log timing for this error
          logTiming('Review request pre-check', 'error', {
            userId: userId,
            error: 'Failed to check for existing sent requests'
          });
          // Depending on policy, you might want to not schedule if this check fails.
          // For now, it will proceed if the check errors out (existingSentRequest would be null).
        }

        if (existingSentRequest) {
          logTiming('Review request skipped', 'info', {
            reason: 'User has already received a successfully sent survey',
            userId: userId,
            existingRequestId: existingSentRequest.id
          });
        } else {
          // Proceed with scheduling if no prior 'sent' survey
          // Check if this is a LINE user by examining the profile
          const { data: reviewProfile, error: reviewProfileError } = await supabase
            .from('profiles')
            .select('display_name, phone_number, email')
            .eq('id', userId)
            .single();

          if (reviewProfileError) {
            console.error('Error fetching user profile for review request:', reviewProfileError);
            logTiming('Review request scheduling', 'error', {
              error: 'Failed to fetch user profile',
              userId: userId
            });
            // throw new Error('Failed to fetch user profile for review request'); // Or handle differently
          } else {
            // Determine the notification provider (LINE or email)
            const provider = reviewProfile?.display_name === 'LINE' ? 'line' : 'email';

            // Get the appropriate contact info based on the provider
            // For LINE users, use phone_number (LINE user ID) instead of email
            const contactInfo = provider === 'line'
              ? reviewProfile?.phone_number || '' // Use LINE phone_number
              : booking.email;             // Use booking email for non-LINE users

            // Make sure we have valid contact info
            if (!contactInfo) {
              console.error('Missing contact info for review request', { provider, profileFromDb: reviewProfile }); // Renamed for clarity
              logTiming('Review request scheduling', 'error', {
                error: 'Missing contact info',
                userId: userId,
                provider
              });
              // Potentially throw new Error('Missing contact info for review request');
            } else {
              // Schedule the review request to be sent 30 minutes after booking ends
              // The scheduler will calculate this based on booking details
              const scheduled = await scheduleReviewRequest({
                bookingId: booking.id,
                userId: userId,
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
      customerId: customerId || undefined,
      customerCode: customerCode || undefined,
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