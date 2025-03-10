import { NextRequest, NextResponse } from 'next/server';
import { getToken } from 'next-auth/jwt';
import { createServerClient } from '@/utils/supabase/server';
import { crmLogger } from '@/utils/logging';
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
}

export async function POST(request: NextRequest) {
  // Generate a unique request ID for this notification
  const requestId = crmLogger.newRequest();
  
  try {
    // Verify user authentication
    const token = await getToken({ req: request as any });
    if (!token) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const booking: BookingNotification = await request.json();
    
    // Log received booking data
    crmLogger.debug(
      'Received booking data for LINE notification',
      { 
        profileId: booking.profileId,
        bookingId: booking.bookingName,
        hasPackageInfo: !!booking.packageInfo
      },
      { 
        requestId, 
        profileId: booking.profileId, 
        source: 'line' 
      }
    );
    
    // Look up customer and package info
    // If CRM customer data is available, use that name, otherwise use the provided customerName or "New Customer"
    let customerLabel = "New Customer";
    
    // If we have CRM customer data, use that name
    if (booking.crmCustomerData && booking.crmCustomerData.name) {
      customerLabel = booking.crmCustomerData.name;
    } else if (booking.customerName && booking.customerName !== "New Customer") {
      // If no CRM data but a specific customer name was provided that's not "New Customer"
      customerLabel = booking.customerName;
    }
    
    // Determine booking type (package or normal)
    let bookingType = "Normal Bay Rate";
    if (booking.packageInfo) {
      bookingType = booking.packageInfo;
      
      crmLogger.info(
        'Using provided package info in LINE notification',
        { packageInfo: booking.packageInfo },
        { 
          requestId, 
          profileId: booking.profileId, 
          source: 'line' 
        }
      );
    }
    // Look up package using profile ID (if available)
    else if (booking.profileId) {
      try {
        console.log(`Looking up packages for profile ID ${booking.profileId}`);
        
        // Get the stable_hash_id for this profile
        const { data: mapping, error: mappingError } = await createServerClient()
          .from('crm_customer_mapping')
          .select('stable_hash_id, crm_customer_id')
          .eq('profile_id', booking.profileId)
          .eq('is_matched', true)
          .single();
        
        if (mappingError) {
          console.log(`No mapping found for profile ID ${booking.profileId}`);
        } else if (mapping?.stable_hash_id) {
          console.log(`Stable Hash ID ${mapping.stable_hash_id} found for profile ID ${booking.profileId}`);
          
          // Use stable_hash_id to look up packages
          const { data: packages, error: packagesError } = await createServerClient()
            .from('crm_packages')
            .select('*')
            .eq('stable_hash_id', mapping.stable_hash_id)
            .gte('expiration_date', new Date().toISOString().split('T')[0])
            .order('expiration_date', { ascending: true });
          
          if (packagesError) {
            console.error(`Error looking up packages with stable_hash_id ${mapping.stable_hash_id}`);
          } else if (packages && packages.length > 0) {
            console.log(`Found ${packages.length} packages for stable hash id ${mapping.stable_hash_id}`);
            
            // Use the first valid package
            bookingType = `Package (${packages[0].package_type_name})`;
            console.log(`Package ${packages[0].id} found for stable hash id ${mapping.stable_hash_id}`);
          } else {
            console.log(`No packages found for stable hash id ${mapping.stable_hash_id}`);
          }
        } else {
          console.log(`No stable_hash_id found in mapping for profile ID ${booking.profileId}`);
        }
      } catch (error) {
        console.error('Error looking up package information:', error);
      }
    }

    // Format date to "Thu, 6th March" format
    const dateObj = new Date(booking.bookingDate);
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

    // Generate the notification message
    const fullMessage = `Booking Notification
Customer Name: ${customerLabel}
Booking Name: ${booking.bookingName || booking.customerName}
Email: ${booking.email}
Phone: ${booking.phoneNumber}
Date: ${formattedDate}
Time: ${booking.bookingStartTime} - ${booking.bookingEndTime}
Bay: ${booking.bayNumber}
Type: ${bookingType}
People: ${booking.numberOfPeople}
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