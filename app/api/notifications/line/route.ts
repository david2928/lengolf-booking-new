import { NextRequest, NextResponse } from 'next/server';
import { getToken } from 'next-auth/jwt';
import { createServerClient } from '@/utils/supabase/server';
import { crmLogger } from '@/utils/logging';
import { getOrCreateCrmMapping } from '@/utils/customer-matching';
// We may keep this for future reference but can comment it out
// import { getPackagesForProfile } from '@/utils/supabase/crm-packages';

interface BookingNotification {
  customerName: string;
  email: string;
  phoneNumber: string;
  bookingDate: string;
  bookingStartTime: string;
  bookingEndTime: string;
  bayNumber: string;
  duration: number;
  numberOfPeople: number;
  crmCustomerId?: string;
  profileId?: string;
  skipCrmMatch?: boolean;
  packageInfo?: string;
  bookingName?: string;
  crmCustomerData?: any;
  stableHashId?: string;
}

export async function POST(request: NextRequest) {
  // Generate a unique request ID for this notification
  const requestId = crmLogger.newRequest();
  
  try {
    // We're not verifying tokens for internal API calls
    // This avoids 401 errors when called from other API routes
    const booking: BookingNotification = await request.json();
    
    // Log full received booking data for debugging
    crmLogger.debug(
      'Raw booking data received in LINE notification',
      { 
        ...booking, // Log the complete booking object
        rawRequestType: typeof booking,
        hasProfileId: !!booking.profileId,
        hasPackageInfo: !!booking.packageInfo,
        hasBayNumber: !!booking.bayNumber,
        hasCrmData: !!booking.crmCustomerData
      },
      { 
        requestId, 
        profileId: booking.profileId || 'unknown', 
        source: 'line' 
      }
    );
    
    // Provide fallbacks for all important fields
    const sanitizedBooking = {
      ...booking,
      profileId: booking.profileId || 'anonymous',
      bayNumber: booking.bayNumber || 'No bay assigned',
      packageInfo: booking.packageInfo || 'Normal Bay Rate',
      bookingName: booking.bookingName || booking.customerName || 'Unknown Booking'
    };
    
    // Log normal booking data with sanitized values
    crmLogger.debug(
      'Processed booking data for LINE notification',
      { 
        profileId: sanitizedBooking.profileId,
        bookingId: sanitizedBooking.bookingName,
        hasPackageInfo: !!sanitizedBooking.packageInfo,
        packageInfo: sanitizedBooking.packageInfo,
        bayNumber: sanitizedBooking.bayNumber,
        duration: sanitizedBooking.duration
      },
      { 
        requestId, 
        profileId: sanitizedBooking.profileId, 
        source: 'line' 
      }
    );
    
    // Look up customer and package info
    // If CRM customer data is available, use that name, otherwise use the provided customerName or "New Customer"
    let customerLabel = "New Customer";
    
    // If we have CRM customer data, use that name
    if (sanitizedBooking.crmCustomerData && sanitizedBooking.crmCustomerData.name) {
      customerLabel = sanitizedBooking.crmCustomerData.name;
    } else if (sanitizedBooking.customerName && sanitizedBooking.customerName !== "New Customer") {
      // If no CRM data but a specific customer name was provided that's not "New Customer"
      customerLabel = sanitizedBooking.customerName;
    }
    
    // Determine booking type (package or normal)
    let bookingType = "Normal Bay Rate";
    if (sanitizedBooking.packageInfo) {
      bookingType = sanitizedBooking.packageInfo;
      
      crmLogger.info(
        'Using provided package info in LINE notification',
        { packageInfo: sanitizedBooking.packageInfo },
        { 
          requestId, 
          profileId: sanitizedBooking.profileId, 
          source: 'line' 
        }
      );
    }
    // If we have stableHashId from the booking flow, use it directly
    else if (sanitizedBooking.stableHashId) {
      crmLogger.info(
        'Using provided stable hash ID in LINE notification',
        { stableHashId: sanitizedBooking.stableHashId },
        { 
          requestId, 
          profileId: sanitizedBooking.profileId,
          stableHashId: sanitizedBooking.stableHashId, 
          source: 'line' 
        }
      );
      
      try {
        // Look up packages using the provided stable hash ID
        const { data: packages, error: packagesError } = await createServerClient()
          .from('crm_packages')
          .select('*')
          .eq('stable_hash_id', sanitizedBooking.stableHashId)
          .gte('expiration_date', new Date().toISOString().split('T')[0])
          .order('expiration_date', { ascending: true });
        
        if (packagesError) {
          crmLogger.error(
            'Error looking up packages by provided stable hash ID',
            { error: packagesError, stableHashId: sanitizedBooking.stableHashId },
            { 
              requestId, 
              profileId: sanitizedBooking.profileId, 
              stableHashId: sanitizedBooking.stableHashId,
              source: 'line' 
            }
          );
        } else if (packages && packages.length > 0) {
          crmLogger.info(
            'Found packages using provided stable hash ID',
            { packageCount: packages.length, firstPackage: packages[0] },
            { 
              requestId, 
              profileId: sanitizedBooking.profileId, 
              stableHashId: sanitizedBooking.stableHashId,
              source: 'line' 
            }
          );
          
          // Use the first valid package
          bookingType = `Package (${packages[0].package_type_name})`;
        } else {
          crmLogger.info(
            'No packages found for provided stable hash ID',
            { stableHashId: sanitizedBooking.stableHashId },
            { 
              requestId, 
              profileId: sanitizedBooking.profileId, 
              stableHashId: sanitizedBooking.stableHashId,
              source: 'line' 
            }
          );
        }
      } catch (error) {
        crmLogger.error(
          'Exception looking up packages by provided stable hash ID',
          { error, stableHashId: sanitizedBooking.stableHashId },
          { 
            requestId, 
            profileId: sanitizedBooking.profileId, 
            stableHashId: sanitizedBooking.stableHashId,
            source: 'line' 
          }
        );
      }
    }
    // Look up package using profile ID as a fallback
    else if (sanitizedBooking.profileId && !sanitizedBooking.skipCrmMatch) {
      crmLogger.info(
        'Looking up CRM mapping for LINE notification',
        { profileId: sanitizedBooking.profileId },
        { requestId, profileId: sanitizedBooking.profileId, source: 'line' }
      );
      
      try {
        // Use our efficient CRM mapping function
        const crmMapping = await getOrCreateCrmMapping(sanitizedBooking.profileId, {
          requestId,
          source: 'line',
          logger: crmLogger
        });
        
        if (crmMapping && crmMapping.stableHashId) {
          // Found a mapping, look up packages
          const { data: packages, error: packagesError } = await createServerClient()
            .from('crm_packages')
            .select('*')
            .eq('stable_hash_id', crmMapping.stableHashId)
            .gte('expiration_date', new Date().toISOString().split('T')[0])
            .order('expiration_date', { ascending: true });
          
          if (packagesError) {
            crmLogger.error(
              'Error looking up packages for CRM mapping',
              { error: packagesError, stableHashId: crmMapping.stableHashId },
              { 
                requestId, 
                profileId: sanitizedBooking.profileId, 
                stableHashId: crmMapping.stableHashId,
                crmCustomerId: crmMapping.crmCustomerId,
                source: 'line' 
              }
            );
          } else if (packages && packages.length > 0) {
            crmLogger.info(
              'Found packages for CRM mapping',
              { packageCount: packages.length, firstPackage: packages[0] },
              { 
                requestId, 
                profileId: sanitizedBooking.profileId, 
                stableHashId: crmMapping.stableHashId,
                crmCustomerId: crmMapping.crmCustomerId,
                source: 'line' 
              }
            );
            
            // Use the first valid package
            bookingType = `Package (${packages[0].package_type_name})`;
          } else {
            crmLogger.info(
              'No packages found for CRM mapping',
              { stableHashId: crmMapping.stableHashId },
              { 
                requestId, 
                profileId: sanitizedBooking.profileId, 
                stableHashId: crmMapping.stableHashId,
                crmCustomerId: crmMapping.crmCustomerId,
                source: 'line' 
              }
            );
          }
        } else {
          crmLogger.info(
            'No CRM mapping found for LINE notification',
            { profileId: sanitizedBooking.profileId },
            { requestId, profileId: sanitizedBooking.profileId, source: 'line' }
          );
        }
      } catch (error) {
        crmLogger.error(
          'Error during CRM mapping for LINE notification',
          { error, profileId: sanitizedBooking.profileId },
          { requestId, profileId: sanitizedBooking.profileId, source: 'line' }
        );
      }
    }

    // Format date to "Thu, 6th March" format
    const dateObj = new Date(sanitizedBooking.bookingDate);
    const day = dateObj.getDate();
    const dayWithSuffix = day + (
      day === 1 || day === 21 || day === 31 ? 'st' : 
      day === 2 || day === 22 ? 'nd' : 
      day === 3 || day === 23 ? 'rd' : 'th'
    );
    const formattedDate = dateObj.toLocaleDateString('en-GB', { 
      weekday: 'short', 
      day: 'numeric', 
      month: 'long' 
    }).replace(/\d+/, dayWithSuffix).replace(/(\w+)/, '$1,');

    // Generate the notification message with consistent fallbacks
    const fullMessage = `Booking Notification
Customer Name: ${customerLabel}
Booking Name: ${sanitizedBooking.bookingName}
Email: ${sanitizedBooking.email || 'Not provided'}
Phone: ${sanitizedBooking.phoneNumber || 'Not provided'}
Date: ${formattedDate}
Time: ${sanitizedBooking.bookingStartTime} - ${sanitizedBooking.bookingEndTime}
Bay: ${sanitizedBooking.bayNumber}
Type: ${bookingType}
People: ${sanitizedBooking.numberOfPeople || '1'}
Channel: Website

This booking has been auto-confirmed. No need to re-confirm with the customer. Please double check bay selection`.trim();

    // Use LINE Messaging API instead of LINE Notify
    const channelAccessToken = process.env.LINE_CHANNEL_ACCESS_TOKEN;
    const groupId = process.env.LINE_GROUP_ID;

    if (!channelAccessToken) {
      throw new Error('LINE Messaging API access token is not set');
    }

    if (!groupId) {
      throw new Error('LINE group ID is not set');
    }

    // Send message to LINE group using Messaging API
    const response = await fetch('https://api.line.me/v2/bot/message/push', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${channelAccessToken}`,
      },
      body: JSON.stringify({
        to: groupId,
        messages: [
          {
            type: 'text',
            text: fullMessage
          }
        ]
      }),
    });

    // Handle rate limiting more gracefully
    if (!response.ok) {
      const errorData = await response.json().catch(() => null);
      
      // For rate limiting (429 errors), return a 200 with a warning instead of failing
      // This ensures the booking process continues even if LINE notifications fail
      if (response.status === 429) {
        console.warn(`LINE API rate limit reached: ${JSON.stringify(errorData || {})}`);
        return NextResponse.json({ 
          success: true, 
          warning: 'LINE notification quota reached', 
          details: errorData
        });
      }
      
      // For other errors, still throw
      throw new Error(`LINE Messaging API error: ${response.status} ${response.statusText} ${JSON.stringify(errorData || {})}`);
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    crmLogger.error(
      'Exception in LINE notification',
      { error },
      { requestId, source: 'line' }
    );
    return NextResponse.json(
      { error: 'Failed to send LINE notification' },
      { status: 500 }
    );
  }
} 