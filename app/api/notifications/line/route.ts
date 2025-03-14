import { NextRequest, NextResponse } from 'next/server';
import { getToken } from 'next-auth/jwt';
import { createServerClient } from '@/utils/supabase/server';
import { getOrCreateCrmMapping } from '@/utils/customer-matching';

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
  try {
    // Check if LINE environment variables are set
    console.log('LINE environment variables check:', {
      hasChannelAccessToken: !!process.env.LINE_CHANNEL_ACCESS_TOKEN,
      hasGroupId: !!process.env.LINE_GROUP_ID,
      channelAccessTokenLength: process.env.LINE_CHANNEL_ACCESS_TOKEN?.length || 0,
      groupIdLength: process.env.LINE_GROUP_ID?.length || 0
    });
    
    // We're not verifying tokens for internal API calls
    // This avoids 401 errors when called from other API routes
    const booking: BookingNotification = await request.json();
    
    // Provide fallbacks for all important fields
    const sanitizedBooking = {
      ...booking,
      profileId: booking.profileId || 'anonymous',
      bayNumber: booking.bayNumber || 'No bay assigned',
      packageInfo: booking.packageInfo || 'Normal Bay Rate',
      bookingName: booking.bookingName || booking.customerName || 'Unknown Booking'
    };
    
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
    // Note: If customerName is "New Customer", we keep the default customerLabel value
    
    // Determine booking type (package or normal)
    let bookingType = "Normal Bay Rate";
    if (sanitizedBooking.packageInfo) {
      bookingType = sanitizedBooking.packageInfo;
    }
    // If we have stableHashId from the booking flow, use it directly
    else if (sanitizedBooking.stableHashId && !sanitizedBooking.skipCrmMatch) {
      try {
        // Look up packages using the provided stable hash ID
        const { data: packages, error: packagesError } = await createServerClient()
          .from('crm_packages')
          .select('*')
          .eq('stable_hash_id', sanitizedBooking.stableHashId)
          .gte('expiration_date', new Date().toISOString().split('T')[0])
          .order('expiration_date', { ascending: true });
        
        if (packages && packages.length > 0) {
          // Use the first valid package
          bookingType = `Package (${packages[0].package_type_name})`;
        }
      } catch (error) {
        console.error('Error looking up packages:', error);
      }
    }
    // Look up package using profile ID as a fallback
    else if (sanitizedBooking.profileId && !sanitizedBooking.skipCrmMatch) {
      try {
        // Use our efficient CRM mapping function
        const crmMapping = await getOrCreateCrmMapping(sanitizedBooking.profileId, {
          source: 'line'
        });
        
        if (crmMapping && crmMapping.stableHashId) {
          try {
            // Look up packages
            const { data: packages } = await createServerClient()
              .from('crm_packages')
              .select('*')
              .eq('stable_hash_id', crmMapping.stableHashId)
              .gte('expiration_date', new Date().toISOString().split('T')[0]) // Only active packages
              .order('expiration_date', { ascending: true });
            
            if (packages && packages.length > 0) {
              // Use the first valid package
              bookingType = `Package (${packages[0].package_type_name})`;
            }
          } catch (error) {
            console.error('Error looking up packages for mapping:', error);
          }
        }
      } catch (error) {
        console.error('Error during CRM mapping for LINE notification:', error);
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

    console.log('Sending LINE message to group:', {
      groupId,
      messageLength: fullMessage.length,
      customerLabel,
      bookingName: sanitizedBooking.bookingName
    });

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
      console.error('LINE API error:', errorData || response.statusText);
      return NextResponse.json(
        { error: 'Failed to send LINE notification', details: errorData },
        { status: response.status }
      );
    }

    console.log('LINE notification sent successfully');
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error in LINE notification:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
} 