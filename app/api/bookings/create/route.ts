import { NextRequest, NextResponse, after } from 'next/server';
import { getToken } from 'next-auth/jwt';
import { v4 as uuidv4 } from 'uuid';
import { createAdminClient } from '@/utils/supabase/admin';
import type { Json } from '@/types/supabase';
import { getGearUpItems } from '@/types/golf-club-rental';
import { formatBookingData } from '@/utils/booking-formatter';
import { sendBookingConfirmationEmail } from '@/lib/notifications/bookingEmail';
import { buildBookingCreatedMessage, pushToStaffGroup, StaffLineError } from '@/lib/notifications/staffLine';

import { findOrCreateCustomer, getPackageInfoForCustomer } from '@/utils/customer-service';
import { BAY_DISPLAY_NAMES } from '@/lib/bayConfig';
import { scheduleReviewRequest } from '@/lib/reviewRequestScheduler';
import { isValidLanguage } from '@/lib/liff/translations';
import { isValidLocale } from '@/i18n/routing';
import { sanitizeAttribution } from '@/lib/attribution/click-ids';
import { calculateCost, type ApplicablePromotion } from '@/lib/cost-calculator';
import {
  getPosDiscountTitle,
  withNoPosDiscountInstruction,
  withPosDiscountInstruction,
} from '@/lib/pos-discount';
import {
  b1g1CreditExpiry,
  b1g1DisagreementLog,
  grantB1G1NewCustomerCredit,
  isB1G1GrantEligible,
  type B1G1Eligibility,
} from '@/lib/b1g1-credit';

// Accept any LIFF Language (en/th/ja/zh) OR any main-site Locale (en/th/ko/ja/zh).
// LIFF's isValidLanguage doesn't include 'ko', but the main flow can produce it.
function isAcceptableBookingLanguage(value: unknown): value is string {
  return typeof value === 'string' && (isValidLanguage(value) || isValidLocale(value));
}
import { appCache } from '@/lib/cache';

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

/** Narrow an unknown rejection reason to something loggable. */
function errorMessage(reason: unknown): string | undefined {
  if (reason === undefined) return undefined;
  return reason instanceof Error ? reason.message : String(reason);
}

/**
 * The diagnosable half of a LINE failure.
 *
 * `StaffLineError.message` is a constant ('Failed to send LINE notification to
 * LINE API') — the part worth reading is LINE's own errcode and body, which
 * lands in `details`. Since `booking_process_logs` is now the primary channel
 * for notification failures, that belongs in the row rather than only in the
 * console.
 */
function errorDetails(reason: unknown): unknown {
  return reason instanceof StaffLineError ? reason.details : undefined;
}


// Helper function to generate a booking ID
const generateBookingId = () => {
  const timestamp = new Date().toISOString().slice(2, 10).replace(/-/g, '');
  const randomNum = Math.random().toString(36).substring(2, 6).toUpperCase();
  return `BK${timestamp}${randomNum}`;
};


// Notifications run after the response, so nobody is waiting on them — but a
// stuck SMTP or LINE socket would still hold the instance open against the 30s
// maxDuration in vercel.json. This bounds each one and always clears its timer,
// so a fast task never leaves a pending handle behind.
const NOTIFICATION_TIMEOUT_MS = 15000;

function withTimeout<T>(task: () => Promise<T>, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return Promise.race([
    task(),
    new Promise<never>((_, reject) => {
      timer = setTimeout(
        () => reject(new Error(`${label} timed out after ${NOTIFICATION_TIMEOUT_MS}ms`)),
        NOTIFICATION_TIMEOUT_MS
      );
    }),
  ]).finally(() => clearTimeout(timer));
}

// Helper function to send notifications.
//
// These used to POST to `${baseUrl}/api/notifications/{email,line}` — the route
// invoking its own serverless functions over the public URL, paying a second
// invocation, a network round trip and a TLS handshake on top of the real SMTP
// and LINE work. Both handlers are now importable, so we call them in process.
// The HTTP routes still exist unchanged for the seven other callers.
async function sendNotifications(formattedData: Record<string, unknown>, booking: Record<string, unknown>, bayDisplayName: string, customerCode?: string, packageInfo: string = 'Normal Bay Rate', customerNotes?: string, channel: string = 'Website', language?: string | null) {
  const emailTask = async () => {
    console.log('[CreateBooking Email Notify Task] Starting email notification task.');
    const userName = booking.name;
    const subjectName = customerCode ? (formattedData.customerName || booking.name) : booking.name;

    await sendBookingConfirmationEmail({
      userName: userName as string,
      subjectName: subjectName as string,
      email: (formattedData.email || booking.email) as string,
      date: (formattedData.formattedDate || booking.date) as string,
      startTime: booking.start_time as string,
      endTime: formattedData.endTime as string,
      duration: booking.duration as number,
      numberOfPeople: booking.number_of_people as number,
      bayNumber: bayDisplayName,
      packageInfo,
      standardizedData: formattedData as never,
      customerNotes,
      language: language ?? undefined,
    });
  };

  const lineTask = async () => {
    console.log('[CreateBooking LINE Notify Task] Starting LINE notification task.');
    const customerNameForLine = formattedData.customerName || booking.name;
    const lineCustomerName = customerCode ? customerNameForLine : 'New Customer';

    await pushToStaffGroup(
      buildBookingCreatedMessage({
        customerName: lineCustomerName as string,
        bookingName:
          (formattedData as { lineNotification?: { bookingName?: string } }).lineNotification?.bookingName ||
          (booking as { name: string }).name,
        email: booking.email as string,
        phoneNumber: booking.phone_number as string,
        bookingDate: (formattedData.formattedDate || booking.date) as string,
        bookingStartTime: booking.start_time as string,
        bookingEndTime: formattedData.endTime as string,
        bayNumber: bayDisplayName,
        duration: booking.duration as number,
        numberOfPeople: booking.number_of_people as number,
        customerCode,
        packageInfo,
        bookingType: booking.booking_type as string | undefined,
        packageName: booking.package_name as string | undefined,
        standardizedData: formattedData as never,
        customerNotes,
        bookingId: booking.id as string,
        channel,
      })
    );
  };

  const [emailResult, lineResult] = await Promise.allSettled([
    withTimeout(emailTask, 'Email notification'),
    withTimeout(lineTask, 'LINE notification'),
  ]);

  if (emailResult.status === 'rejected') {
    console.error('[CreateBooking Email Notify Task] Error sending email notification:', emailResult.reason);
  }
  if (lineResult.status === 'rejected') {
    console.error('[CreateBooking LINE Notify Task] Error sending LINE notification:', lineResult.reason);
  }

  return {
    emailOk: emailResult.status === 'fulfilled',
    lineOk: lineResult.status === 'fulfilled',
    emailError: emailResult.status === 'rejected' ? emailResult.reason : undefined,
    lineError: lineResult.status === 'rejected' ? lineResult.reason : undefined,
  };
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

    // Every `booking_process_logs` insert `logTiming` fires, so the deferred
    // chain can wait for them before it lets the instance go.
    //
    // Pre-response these were harmless to leave floating — the route kept
    // running. Inside `after()` they are not: the LAST statement in the
    // deferred callback is a `logTiming`, so without this the callback would
    // settle with an INSERT still in flight and Vercel could tear the instance
    // down on top of it. That is the same floating-promise failure CLAUDE.md
    // bans, and these rows are now the only channel reporting notification
    // delivery since `notificationsSuccess` went away.
    const pendingLogWrites: Promise<unknown>[] = [];

    const logTiming = (step: string, status: 'success' | 'error' | 'info' = 'info', metadata: Record<string, unknown> = {}) => {
      const now = Date.now();
      const stepDuration = now - lastCheckpoint;
      const totalDuration = now - apiStartTime;

      console.log(`[Timing] ${step}: ${stepDuration}ms (total: ${totalDuration}ms)`);

      // Log to Supabase if we have a user ID
      if (userId) {
        pendingLogWrites.push(
          logBookingProcessStep({
            bookingId,
            userId,
            step,
            status,
            durationMs: stepDuration,
            totalDurationMs: totalDuration,
            metadata
          })
        );
      }

      lastCheckpoint = now;
    };

    // 1. Parse request body first (needed for profile creation in LIFF first-time users)
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
      preferred_bay_type,
      language,
      club_set_id,
      club_rental_type,
      add_ons: rawAddOns,
      marketing_opt_in: rawMarketingOptIn,
      attribution: rawAttribution,
    } = await request.json();

    // Google Ads click ID + UTMs. Sanitized server-side (charset + length) —
    // these end up in an outbound Google Ads API call from the ETL, so a forged
    // value shouldn't reach it. Anything that fails validation becomes null.
    const attribution = sanitizeAttribution(rawAttribution);

    // Coerce to a strict boolean — only the explicit value `true` is consent.
    // Anything else (missing field, null, 'true' string, etc.) is no consent.
    const marketingOptInForm: boolean = rawMarketingOptIn === true;

    // Resolve gear-up add-ons (e.g. glove sale) from the canonical catalog.
    // We deliberately ignore client-supplied label/price — the request only
    // selects items by key, and the server fills in the authoritative name +
    // price. This prevents a forged "Add-ons: Cabretta Glove (฿1)" row landing
    // in customer_notes / LINE staff notification.
    const gearUpCatalog = getGearUpItems();
    const seenAddOnKeys = new Set<string>();
    const validatedAddOns = Array.isArray(rawAddOns)
      ? rawAddOns
          .slice(0, 5)
          .flatMap((item: { key?: unknown }) => {
            if (typeof item?.key !== 'string') return [];
            const canonical = gearUpCatalog.find((g) => g.id === item.key && g.id !== 'delivery');
            if (!canonical || seenAddOnKeys.has(canonical.id)) return [];
            seenAddOnKeys.add(canonical.id);
            return [{ key: canonical.id, label: canonical.name, price: canonical.price }];
          })
      : null;

    // 2. Authenticate user - support both NextAuth and LIFF context
    const lineUserId = request.headers.get('x-line-user-id');

    if (lineUserId) {
      // LIFF context - get profile from profiles table
      // Customer matching will happen via findOrCreateCustomer() same as website flow
      isLiffContext = true;
      console.log('[LIFF Auth] Authenticating with LINE user ID:', lineUserId);

      const { data: existingProfile, error: profileError } = await supabase
        .from('profiles')
        .select('id')
        .eq('provider', 'line')
        .eq('provider_id', lineUserId)
        .maybeSingle();

      if (profileError) {
        console.error('[LIFF Auth] Profile lookup error:', profileError);
        return NextResponse.json(
          { error: 'LINE account not found' },
          { status: 401 }
        );
      }

      let profile = existingProfile;

      // First-time LIFF user: no profile yet — create one on the fly
      if (!profile) {
        console.log('[LIFF Auth] No profile found, creating for first-time LIFF user:', lineUserId);
        const { data: newProfile, error: createError } = await supabase
          .from('profiles')
          .insert({
            id: uuidv4(),
            provider: 'line',
            provider_id: lineUserId,
            display_name: name || null,
            phone_number: phone_number || null,
            email: email || null,
            marketing_preference: false
          })
          .select('id')
          .single();

        if (createError || !newProfile) {
          console.error('[LIFF Auth] Failed to create profile:', createError);
          return NextResponse.json(
            { error: 'Failed to initialize LINE account' },
            { status: 500 }
          );
        }

        profile = newProfile;
        console.log('[LIFF Auth] Created new profile for first-time LIFF user:', profile.id);
      }

      userId = profile.id;
      // Note: customerId will be set by findOrCreateCustomer() later, same as website flow

      logTiming('LIFF Authentication', 'success', { lineUserId, profileId: userId });
    } else {
      // Standard NextAuth flow
      const token = await getToken({
        req: request,
        secret: process.env.NEXTAUTH_SECRET,
        secureCookie: process.env.NODE_ENV === 'production',
      });
      if (!token?.sub) {
        return NextResponse.json(
          { error: 'Unauthorized or session expired' },
          { status: 401 }
        );
      }
      userId = token.sub;
      logTiming('Authentication', 'success');
    }

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

    // 7.7. Pre-validate club rental availability BEFORE creating booking
    if (club_set_id && club_rental_type && club_rental_type !== 'none' && club_rental_type !== 'standard') {
      const { data: clubAvailCount, error: clubAvailError } = await supabase.rpc('check_club_set_availability', {
        p_set_id: club_set_id,
        p_start_date: date,
        p_end_date: date,
        p_start_time: start_time || null,
        p_duration_hours: parseFloat(duration) || null,
        p_rental_type: 'indoor',
        p_return_time: null,
      });

      if (clubAvailError) {
        console.error('[ClubRental] Pre-validation availability check error:', clubAvailError);
        return NextResponse.json(
          { error: 'Failed to check club availability. Please try again.' },
          { status: 500 }
        );
      }

      if (!clubAvailCount || clubAvailCount <= 0) {
        console.warn(`[ClubRental] Club set ${club_set_id} is no longer available for ${date} ${start_time}`);
        return NextResponse.json(
          { error: 'The selected club set is no longer available for your time slot. Please go back and choose a different option.' },
          { status: 409 }
        );
      }

      logTiming('Club rental pre-validation', 'success', { clubSetId: club_set_id, availableCount: clubAvailCount });
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
        package_id: derivedPackageId, // NEW: Include package_id from the start (undefined for non-simulator packages)
        add_ons: validatedAddOns && validatedAddOns.length > 0
          ? (validatedAddOns as unknown as Json)
          : null,
        rental_club_set_id:
          club_set_id && club_rental_type && club_rental_type !== 'none' && club_rental_type !== 'standard'
            ? club_set_id
            : null,
        language: isAcceptableBookingLanguage(language) ? language : null,
        gclid: attribution.gclid,
        gbraid: attribution.gbraid,
        wbraid: attribution.wbraid,
        utm_source: attribution.utm_source,
        utm_medium: attribution.utm_medium,
        utm_campaign: attribution.utm_campaign
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

    // 8.5. Indoor club choice now lives on bookings.rental_club_set_id (set in the insert
    // above). Best-effort post-insert race check: if the set is overbooked, downgrade
    // (clear the choice) and keep the booking. Never fail the bay booking over a premium set.
    if (club_set_id && club_rental_type && club_rental_type !== 'none' && club_rental_type !== 'standard') {
      const { data: postCount, error: postErr } = await supabase.rpc('check_club_set_availability', {
        p_set_id: club_set_id,
        p_start_date: date,
        p_end_date: date,
        p_start_time: start_time || null,
        p_duration_hours: parseFloat(duration) || null,
        p_rental_type: 'indoor',
        p_return_time: null,
        p_exclude_booking_id: booking.id,
      });
      if (postErr) {
        console.warn(`[ClubRental] post-insert availability check failed; skipping downgrade for booking ${booking.id}`, postErr);
      } else if (postCount !== null && postCount < 1) {
        console.warn(`[ClubRental] Indoor set ${club_set_id} overbooked post-insert; downgrading booking ${booking.id}`);
        const { error: downgradeErr } = await supabase.from('bookings').update({ rental_club_set_id: null }).eq('id', booking.id);
        if (downgradeErr) console.warn(`[ClubRental] failed to clear rental_club_set_id on downgrade for booking ${booking.id}`, downgradeErr);
        (booking as Record<string, unknown>).rental_club_set_id = null;
      }
    }

    // If we don't have a customer name from the system, use the booking name
    if (!customerName) {
      customerName = booking.name;
    }

    // Update the local booking object with package_info for compatibility with formatBookingData
    (booking as Record<string, unknown>).package_info = packageInfo; // For downstream compatibility (e.g. formatBookingData)

    // Everything below is a side effect. None of it changes what the customer
    // is told, and the review request does not fire until 30 minutes after
    // their session ends — so we answer now and finish the work on an instance
    // Vercel keeps alive for exactly this.
    //
    // `after()` is NOT the banned `void promise()`. A bare floating promise
    // gets its sockets torn down the moment the response is sent, which is why
    // CLAUDE.md forbids it; `after()` registers against the invocation's
    // waitUntil, so the instance survives until this settles.
    logTiming('Response sent', 'success', {
      bookingId: booking.id,
      note: 'customer-visible latency ends here — later steps run under after()',
    });

    after(async () => {
      try {
        // Persist the customer's language choice. This was a floating `.then()`
        // issued before the response — the pattern that loses its socket mid-flight
        // on Vercel. It is awaited now, on an instance `after()` keeps alive.
        if (isAcceptableBookingLanguage(language) && customerId) {
          const { error: langError } = await supabase
            .from('customers')
            .update({ preferred_language: language })
            .eq('id', customerId);
          if (langError) {
            console.warn('[Booking] Failed to update preferred_language:', langError);
          } else if (lineUserId) {
            // Invalidate caches so next read picks up the change
            appCache.del(`booking_user_${lineUserId}`);
            appCache.del(`membership_data_${lineUserId}`);
          }
        }

        // Marketing opt-in propagation (PDPA-aligned, upgrade-only).
        //
        // Sources of consent at this point:
        //   1. The BookingDetails checkbox (`marketingOptInForm`).
        //   2. For new customers, a prior GuestForm signup may have stored consent
        //      on `profiles.marketing_preference`.
        //
        // Rules:
        //   - Upgrade-only: we only ever flip `customers.marketing_opt_in` to TRUE.
        //     An unticked checkbox NEVER silently revokes a prior opt-in. Customers
        //     revoke deliberately via the preference center.
        //   - Identity guard: when matching an existing customer (typically by
        //     phone), the booking's email may not match the matched customer's
        //     email — household-shared phone scenario. In that case we don't write
        //     consent against the matched record (which may belong to a different
        //     person).
        if (customerId && customerResult) {
          try {
            const matchedCustomer = (customerResult as CustomerResult).customer as
              { id: string; customer_code: string; customer_name: string; email?: string | null };

            // The form checkbox always wins. Profile carry-over from GuestForm
            // signup only applies for first-time customers AND only when the
            // booking form was unticked (so we don't override a deliberate
            // un-tick — note: we only carry-over upward from false→true, never
            // the other direction).
            let shouldOptIn = marketingOptInForm;
            // Which SURFACE actually collected the consent, tracked alongside the
            // decision rather than inferred from it. This used to be derived as
            // `isNewCustomer ? 'guest_signup' : 'booking_form'`, which recorded
            // every first-time customer's booking-form tick as a guest signup —
            // the two questions are unrelated, and `marketing_opt_in_source` is
            // the column a PDPA audit reads. It is doubly wrong now that the
            // booking flow mints guests silently and passes no consent at all,
            // so `guest_signup` can only ever mean the standalone GuestForm.
            let source: 'booking_form' | 'guest_signup' = 'booking_form';
            if (!shouldOptIn && isNewCustomer) {
              const { data: profileRow, error: profileLookupError } = await supabase
                .from('profiles')
                .select('marketing_preference')
                .eq('id', userId)
                .maybeSingle();
              if (profileLookupError) {
                console.warn(
                  '[Booking] profiles.marketing_preference lookup failed; skipping carry-over.',
                  profileLookupError
                );
              } else if (profileRow?.marketing_preference === true) {
                shouldOptIn = true;
                // The only path where the consent did NOT come from this form.
                source = 'guest_signup';
              }
            }

            if (shouldOptIn) {
              // Normalize emails for the household-phone identity guard. A
              // whitespace-only matched email collapses to null (treated as
              // "no email on record"); same for missing/undefined.
              const matchedEmail = matchedCustomer.email?.trim().toLowerCase() || null;
              const formEmail = (email ?? '').trim().toLowerCase() || null;
              const identityOk =
                isNewCustomer || matchedEmail === null || matchedEmail === formEmail;

              if (!identityOk) {
                console.info(
                  '[Booking] Marketing opt-in skipped — email mismatch on existing customer (household-phone guard).',
                  { customerId, isNewCustomer }
                );
              } else {
                // Awaited, not fired and forgotten. This write was lost for three
                // months in 2026 to an unapplied migration and the warning below is
                // the only alarm for it — a torn-down socket would silence that too.
                // We deliberately UPDATE on every positive consent signal (no
                // `.neq` filter) so `_changed_at` reflects the most recent
                // affirmation — that's what compliance audits want to see. The
                // upgrade-only invariant lives in the value (`true`); we never
                // write `false` from this path.
                const { error: optInError } = await supabase
                  .from('customers')
                  .update({
                    marketing_opt_in: true,
                    marketing_opt_in_changed_at: new Date().toISOString(),
                    marketing_opt_in_source: source,
                  })
                  .eq('id', customerId);
                if (optInError) {
                  console.warn('[Booking] Failed to update marketing_opt_in:', optInError);
                }
              }
            }
          } catch (optInErr) {
            // Non-critical — never fail the booking on a consent-write error.
            console.warn('[Booking] Marketing opt-in propagation error:', optInErr);
          }
        }


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
    
        // May this booking MINT a free-hour credit? Deliberately NOT `isNewCustomer`
        // — see `isB1G1GrantEligible` for why that flag answers a different
        // question and disagrees with the customer's quote in both directions.
        //
        // Computed OUTSIDE the `isNewCustomer` gate below on purpose. The expensive
        // failure mode is the one where `isNewCustomer` is false and the quote
        // promised the hour anyway: every `[B1G1]` line, including the failures,
        // used to live inside that gate, so that case produced no staff note and no
        // log at all and surfaced only when a customer asked for an hour nobody had
        // recorded. Two extra reads per booking-create is what visibility costs.
        //
        // Nothing here can throw — `isB1G1GrantEligible` resolves on every path —
        // but the call is wrapped anyway: this is a staff note and a promo ledger,
        // and neither is a reason to fail somebody's booking.
        let b1g1Eligibility: B1G1Eligibility = {
          eligible: false,
          phoneNew: null,
          profileHasPriorBooking: null,
          error: 'eligibility check did not run',
        };
        try {
          b1g1Eligibility = await isB1G1GrantEligible(supabase, {
            phoneNumber: phone_number,
            customerId,
            userId,
            bookingId: booking.id as string,
          });
        } catch (eligibilityError) {
          console.error(
            `[B1G1] Eligibility check threw. bookingId=${booking.id} customerId=${customerId} userId=${userId}`,
            eligibilityError,
          );
        }

        // The only way direction B ever surfaces. When these two disagree, either a
        // grant is about to be withheld from someone the quote promised one, or
        // `isNewCustomer` was about to mint one for someone who was promised
        // nothing. Both are worth a page in the logs.
        const b1g1Disagreement = b1g1DisagreementLog({
          eligibility: b1g1Eligibility,
          isNewCustomer,
          customerId,
          userId,
          bookingId: booking.id as string,
        });
        if (b1g1Disagreement) console.error(b1g1Disagreement);

        // Append the applied auto-apply promo label to notes for staff notification.
        //
        // Offers NEVER stack (owner rule, confirmed 2026-07-25) — the customer's
        // quote applies exactly one. This block used to select every active
        // `auto_apply` row and `.join(', ')` the titles, so the staff note and the
        // quote would disagree the moment a second `auto_apply` row exists. In this
        // codebase the quote is a promise (staff charge from the POS), so that
        // mismatch is precisely what `lib/cost-calculator.ts` exists to prevent.
        //
        // Selection is therefore NOT re-derived here with a second, weaker set of
        // rules — the old version ignored `new_customer_only`, package coverage and
        // Play & Food, so it could name an offer the quote correctly withheld.
        // `calculateCost` is pure and this route holds every input it needs, so both
        // surfaces now read ONE decision. Keep it that way: if you need to change
        // which offer staff are told about, change the calculator.
        //
        // This block used to sit inside `if (isNewCustomer)`, from when the only
        // auto-apply row was the new-customer B1G1. The weekday off-peak B1G1
        // applies to EVERY customer, so under that gate a returning customer would
        // see a discounted quote and staff would get a note that never mentioned it
        // — the quote-versus-POS mismatch this whole block exists to prevent, and
        // the majority case for that offer. What the free-hour CREDIT branch below
        // is gated on now is `promotions.grants_credit`, which is the fact that gate
        // was standing in for: the set of bookings that mint a B1G1 grant is
        // unchanged, byte for byte.
        //
        // Nothing else widens. `calculateCost` receives the same `isNewCustomer` and
        // still withholds every `new_customer_only` offer from a returning
        // customer; a returning customer with no eligible offer simply produces no
        // winner and no label, exactly as before.
        let notificationNotes = customer_notes || '';
        try {
          const { data: autoPromos } = await supabase
            .from('promotions')
            // The customer's quote is computed from /api/promotions/applicable, so
            // every column `calculateCost` reads has to be present in BOTH
            // projections or the two decisions can differ. `pos_discount_id` is the
            // one column this route reads and that one does not: nothing in the
            // calculation touches it, no client renders it, and that endpoint is
            // unauthenticated and edge-cached, so it stays server-side.
            .select('id, promotion_type, discount_value, free_hours, applies_to, conditions, title_en, title_th, pos_discount_id, grants_credit')
            .eq('is_active', true)
            .eq('auto_apply', true)
            .not('promotion_type', 'is', null);
          if (autoPromos?.length) {
            const applicablePromotions: ApplicablePromotion[] = autoPromos.map((p) => ({
              id: p.id,
              promotion_type: p.promotion_type as ApplicablePromotion['promotion_type'],
              discount_value: p.discount_value ?? undefined,
              free_hours: p.free_hours ?? undefined,
              applies_to: p.applies_to as ApplicablePromotion['applies_to'],
              conditions: (p.conditions as Record<string, unknown> | null) ?? {},
              title_en: p.title_en,
              title_th: p.title_th,
              pos_discount_id: (p.pos_discount_id as string | null) ?? null,
              grants_credit: p.grants_credit === true,
            }));

            const breakdown = calculateCost({
              date,
              startTime: start_time,
              // parseFloat, not parseInt: half-hour durations shipped two slices
              // ago, so this is '1.5'/'2.5' in the wild. Truncation was latent for
              // the old `>= 2` branch (every value on the current ladder lands on
              // the same side either way), but it is load-bearing now — the free
              // window of a 2.5h bogo is priced at a different position than a 2h
              // one, and value is what picks the winner. The same parseInt('1.5')
              // mistake already caused a production bug on the LIFF surface.
              duration: parseFloat(duration) || 1,
              clubRentalId: club_rental_type || 'none',
              addOns: Object.fromEntries((validatedAddOns ?? []).map((a) => [a.key, true])),
              playFoodPackageId: playFoodPackageId ?? null,
              hasActivePackage: packageInfo !== 'Normal Bay Rate',
              packageDisplayName: packageTypeName || undefined,
              // Balance deliberately omitted. `packageAppliesToBay` is keyed off
              // package ELIGIBILITY, not the balance, and a percentage promo only
              // reaches the bay line when no package covers it — so the remaining
              // hours cannot move the winner, only line-item amounts we don't read.
              isNewCustomer,
              applicablePromotions,
            });

            // The winner, whether it applied a discount or only advice. Read
            // `appliedPromotionId`, never `discounts[0]`: a sub-2-hour bogo wins by
            // contributing the "redeem within 7 days" hint and pushes no discount
            // row — which is the live case today and the one staff must honour.
            const applied = applicablePromotions.find((p) => p.id === breakdown.appliedPromotionId);
            if (applied) {
              // Advice-only exactly when the calculator charged nothing for it —
              // read back off the breakdown rather than re-testing the duration.
              const discounted = breakdown.discounts.some((d) => d.promotionId === applied.id);
              let promoLabel = applied.title_en;
              // `grants_credit`, NOT `promotion_type === 'bogo'`.
              //
              // The type check was written when 'bogo' had exactly one row and so
              // meant "the new-customer B1G1". It survives today only on a
              // coincidence: the weekday off-peak row is also a bogo with
              // `free_hours: 1` on `bay_rate`, worth exactly the same on every
              // booking both can win, so the uuid tie-break keeps handing the win to
              // the new-customer row. Deactivate that row at campaign end, or change
              // either row's `free_hours`, and the coincidence ends and the weekday
              // promotion starts minting `b1g1_new_customer` credits — no code
              // change, no review. The column states the fact instead of inferring
              // it, and `lib/cost-calculator.ts` gates the customer-facing "redeem
              // within 7 days" copy on the same column, so the promise and the grant
              // read one decision.
              //
              // `isNewCustomer` is deliberately no longer a term here. It was added
              // when this block moved out of `if (isNewCustomer)`, and against the
              // new-customer B1G1 it is redundant: that row carries
              // `new_customer_only: true`, so `calculateCost` never makes it a
              // candidate for a returning customer and it cannot be `applied`.
              // Keeping it would have implied the grant is safe for any bogo a new
              // customer wins, which is the assumption being removed. The grant's
              // real gate, `b1g1Eligibility` below, is untouched.
              if (!discounted && applied.grants_credit && applied.free_hours) {
                // Advice-only bogo: the free hour is NOT in this booking, it is
                // owed. `!discounted` is the same test the label has always used
                // and the only one that stays correct under slice 4's
                // non-stacking rule — if a richer offer beat the bogo,
                // `appliedPromotionId` names that offer instead, this branch
                // never runs, no hint is printed and no credit is granted. The
                // grant and the promise agree because they read one decision.
                const expiry = b1g1CreditExpiry(date);
                const expiryStr = expiry?.label ?? '';
                promoLabel = `${applied.title_en} (${applied.free_hours} free hr to redeem within 7 days, expires ${expiryStr})`;

                // Record the promise. Same `expiry` object feeds the printed date
                // above and the stored `expires_at` below, so the two cannot
                // disagree. Own try/catch: a grant failure must not swallow the
                // staff note, and unlike the note a dropped grant is a broken
                // promise to a paying customer — so it logs at error level with
                // enough context to reconstruct it by hand.
                //
                // The GRANT is gated on `b1g1Eligibility`; the staff note above is
                // not, and its wording and trigger are unchanged. They are allowed
                // to diverge here precisely because the note is a note and the
                // grant is money: a returning customer who typed an unseen phone
                // reaches this branch with `isNewCustomer` true, and minting them a
                // second free hour under a fresh customer id is the bug this gate
                // exists to stop. The disagreement was already logged above.
                if (!b1g1Eligibility.eligible) {
                  console.error(
                    `[B1G1] SKIPPED grant: the staff note printed the free-hour promise but the customer is not eligible for a grant. ` +
                      `customerId=${customerId} userId=${userId} bookingId=${booking.id} hours=${applied.free_hours} ` +
                      `phoneNew=${b1g1Eligibility.phoneNew} profileHasPriorBooking=${b1g1Eligibility.profileHasPriorBooking} ` +
                      `error=${b1g1Eligibility.error ?? 'none'}`,
                  );
                } else if (expiry && customerId) {
                  try {
                    const grant = await grantB1G1NewCustomerCredit(supabase, {
                      customerId,
                      freeHours: applied.free_hours,
                      expiresAt: expiry.expiresAt,
                      bookingId: booking.id as string,
                    });
                    if (!grant.ok) {
                      console.error(
                        `[B1G1] FAILED to record free-hour credit — customer was promised it. customerId=${customerId} bookingId=${booking.id} hours=${applied.free_hours} expires=${expiry.expiresAt.toISOString()} error=${grant.error}`,
                      );
                    } else {
                      console.log(
                        `[B1G1] ${grant.created ? 'Granted' : 'Already held'} free-hour credit: customerId=${customerId} bookingId=${booking.id} grantId=${grant.grantId} hours=${applied.free_hours} expires=${expiry.expiresAt.toISOString()}`,
                      );
                    }
                  } catch (grantError) {
                    console.error(
                      `[B1G1] FAILED to record free-hour credit — customer was promised it. customerId=${customerId} bookingId=${booking.id} hours=${applied.free_hours}`,
                      grantError,
                    );
                  }
                } else {
                  // Both arms are unreachable in practice: `isB1G1GrantEligible`
                  // denies without a customer id, so eligible implies one, and
                  // `b1g1CreditExpiry` only returns null on a date Postgres could
                  // not have accepted into the booking row above. Logged rather
                  // than dropped so that if either ever does happen we find out
                  // from the log, not from the customer.
                  console.error(
                    `[B1G1] Cannot record free-hour credit: ${!customerId ? 'no customer_id' : `unreadable booking date "${date}"`}. ` +
                      `bookingId=${booking.id} hours=${applied.free_hours}`,
                  );
                }
              }

              // Tell staff what to do at the till — and that turns entirely on
              // whether THIS booking was discounted, not on which offer won.
              //
              // `discounted` is the gate because the paired `pos.discounts` rows are
              // percentage / 100.00 / item. On a booking of 2 hours or more the item
              // is the second hour and zeroing it is exactly right. On a shorter
              // booking the offer contributed advice and no discount, the item is
              // the WHOLE booking, and the same instruction tells staff to zero a
              // booking the customer was quoted in full. One hour is the default
              // duration on the ladder, so that is the majority of an off-peak
              // offer's bookings, not an edge case.
              //
              // The advice-only branch says so out loud rather than falling silent.
              // The note still names the offer, because the customer saw it; a named
              // offer with no instruction beside it invites a staff member to apply
              // the discount from memory, which is the same failure by a slower
              // route.
              //
              // `getPosDiscountTitle` never throws and returns null on every failure
              // path, so a POS read problem costs this one clause and leaves the
              // promo label intact.
              promoLabel = discounted
                ? withPosDiscountInstruction(
                    promoLabel,
                    await getPosDiscountTitle(supabase, applied.pos_discount_id),
                  )
                : withNoPosDiscountInstruction(promoLabel);

              notificationNotes = notificationNotes
                ? `${notificationNotes}, ${promoLabel}`
                : promoLabel;
            }
          }
        } catch {
          // Non-critical — never block a booking over the staff note. Covers the
          // promotions fetch AND the calculation; on either failure the note simply
          // carries no promo label.
        }

        // Both notifications, in parallel. They settle independently now — the
        // old `Promise.all` rejected the pair as soon as either one failed, so a
        // LINE outage discarded the email's result too.
        const notificationResults = await sendNotifications(
          formattedData,
          booking,
          bayDisplayName,
          customerCode || customerId || undefined, // Use customer code/ID
          packageInfo,
          notificationNotes || undefined,
          isLiffContext ? 'LINE' : 'Website',
          booking.language as string | null | undefined
        );

        logTiming('Email notification', notificationResults.emailOk ? 'success' : 'error', {
          success: notificationResults.emailOk,
          recipient: booking.email,
          error: errorMessage(notificationResults.emailError),
        });
        logTiming('LINE notification', notificationResults.lineOk ? 'success' : 'error', {
          success: notificationResults.lineOk,
          error: errorMessage(notificationResults.lineError),
          details: errorDetails(notificationResults.lineError),
        });


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
                    contactInfo,
                    // No delayMinutes - use booking end time + 30 minutes.
                    // We just wrote this row, so hand over its scheduling inputs
                    // rather than making the scheduler read them back.
                    booking: {
                      date: booking.date,
                      start_time: booking.start_time,
                      duration: booking.duration,
                    },
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
      } catch (sideEffectError) {
        // The booking is already committed and the customer already has their
        // confirmation; nothing here is worth surfacing to them.
        console.error('[Booking] Side-effect chain failed after response:', sideEffectError);
      } finally {
        // Drain the timing writes before the callback resolves. `after()` keeps
        // the instance alive until this promise settles, so anything still in
        // flight when it does can be killed mid-INSERT.
        await Promise.allSettled(pendingLogWrites);
      }
    });

    // 11. Return success response to user.
    //
    // `notificationsSuccess` is deliberately gone: notifications are dispatched
    // after this response, so the route cannot know their outcome, and a
    // customer whose booking is confirmed gains nothing from a delivery
    // warning. Failures are logged server-side and land in
    // `booking_process_logs` as the 'Email notification' / 'LINE notification'
    // steps.
    return NextResponse.json({
      success: true,
      booking,
      bookingId: booking.id,
      bay: availableBay,
      bayDisplayName,
      customerId: customerId || undefined,
      customerCode: customerCode || undefined,
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