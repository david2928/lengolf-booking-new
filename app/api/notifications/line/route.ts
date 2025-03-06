import { NextRequest, NextResponse } from 'next/server';
import { getToken } from 'next-auth/jwt';
import { createCrmClient } from '@/utils/supabase/crm';
import { createServerClient } from '@/utils/supabase/server';
import { getPackagesForProfile } from '@/utils/supabase/crm-packages';
import { matchProfileWithCrm } from '@/utils/customer-matching';

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
}

export async function POST(request: NextRequest) {
  try {
    // Verify user authentication
    const token = await getToken({ req: request as any });
    if (!token) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const booking: BookingNotification & { skipCrmMatch?: boolean } = await request.json();

    // Look up CRM customer if available
    let crmCustomerName = "New Customer";
    let customerLabel = "New Customer";
    let bookingType = "Normal Bay Rate";
    
    if (booking.profileId && !booking.skipCrmMatch) {
      try {
        // First ensure CRM matching is up to date
        const matchResult = await matchProfileWithCrm(booking.profileId);
        console.log('CRM match result:', matchResult);
        
        // Get packages for this profile
        const packages = await getPackagesForProfile(booking.profileId);
        console.log('Found packages:', packages);
        
        if (packages && packages.length > 0) {
          // Use the first valid package
          bookingType = `Package (${packages[0].package_type_name})`;
          console.log('Using package type:', bookingType);
        }

        // Get CRM customer name if available
        if (matchResult?.matched && matchResult.crmCustomerId) {
          const crmSupabase = createCrmClient();
          const { data, error } = await crmSupabase
            .from('customers')
            .select('*')
            .eq('id', matchResult.crmCustomerId)
            .single();
          
          if (!error && data) {
            // Use first name and last initial if customer exists in CRM
            const fullName = data.name || data.customer_name || '';
            const nameParts = fullName.split(' ');
            if (nameParts.length > 1) {
              const firstName = nameParts[0];
              const lastInitial = nameParts[1].charAt(0);
              crmCustomerName = `${firstName} ${lastInitial}.`;
            } else {
              crmCustomerName = fullName;
            }
            customerLabel = crmCustomerName;
          }
        }
      } catch (error) {
        console.error('Error fetching customer/package data:', error);
        // Continue with default values
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
Booking Name: ${booking.customerName}
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

    if (!response.ok) {
      const errorData = await response.json().catch(() => null);
      throw new Error(`LINE Messaging API error: ${response.status} ${response.statusText} ${JSON.stringify(errorData || {})}`);
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Failed to send LINE notification:', error);
    return NextResponse.json(
      { error: 'Failed to send LINE notification' },
      { status: 500 }
    );
  }
} 