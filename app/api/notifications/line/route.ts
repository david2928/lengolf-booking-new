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
  skipCrmMatch?: boolean;
  packageInfo?: string;
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

    const booking: BookingNotification = await request.json();
    
    // Look up CRM customer if available
    let crmCustomerName = "New Customer";
    let customerLabel = "New Customer";
    let bookingType = "Normal Bay Rate";
    
    // If package info was passed directly, use it (highest priority)
    if (booking.packageInfo) {
      bookingType = booking.packageInfo;
    }
    // Otherwise check if we already have a crmCustomerId from the calendar API
    else if (booking.crmCustomerId) {
      try {
        // If we have a customer ID, we can look up the customer details directly
        const crmSupabase = createCrmClient();
        
        // Get customer data
        const { data: customerData, error: customerError } = await crmSupabase
          .from('customers')
          .select('*')
          .eq('id', booking.crmCustomerId)
          .single();
        
        if (!customerError && customerData) {
          // Use first name and last initial if customer exists in CRM
          const fullName = customerData.name || customerData.customer_name || '';
          const nameParts = fullName.split(' ');
          if (nameParts.length > 1) {
            const firstName = nameParts[0];
            const lastInitial = nameParts[1].charAt(0);
            crmCustomerName = `${firstName} ${lastInitial}.`;
          } else {
            crmCustomerName = fullName;
          }
          customerLabel = crmCustomerName;
          
          console.log(`Found CRM customer: ${crmCustomerName} (ID: ${booking.crmCustomerId})`);
          
          // Also get the stable_hash_id for this customer
          const supabase = createServerClient();
          const { data: mapping } = await supabase
            .from('crm_customer_mapping')
            .select('stable_hash_id')
            .eq('crm_customer_id', booking.crmCustomerId)
            .eq('is_matched', true)
            .maybeSingle();
            
          if (mapping?.stable_hash_id) {
            // Now look up packages with the stable_hash_id
            const { data: packages } = await crmSupabase
              .from('packages')
              .select('*')
              .eq('customer_id', booking.crmCustomerId)
              .gte('expiration_date', new Date().toISOString().split('T')[0])
              .order('expiration_date', { ascending: true });
            
            console.log(`Found ${packages?.length || 0} packages for customer ID ${booking.crmCustomerId}`);
            
            if (packages && packages.length > 0) {
              // Use the first valid package
              bookingType = `Package (${packages[0].package_type_name})`;
              console.log('Using package type:', bookingType);
            }
          } else {
            console.log(`No stable_hash_id found for CRM customer ID ${booking.crmCustomerId}`);
          }
        }
      } catch (error) {
        console.error('Error fetching customer data by ID:', error);
      }
    }
    // Only fall back to CRM matching if we don't have a customer ID and matching is not skipped
    else if (booking.profileId && !booking.skipCrmMatch) {
      try {
        // Fall back to CRM matching
        const matchResult = await matchProfileWithCrm(booking.profileId);
        console.log('CRM match result:', matchResult);
        
        // Get packages for this profile
        const packages = await getPackagesForProfile(booking.profileId);
        console.log('Found packages:', packages);
        
        if (packages && packages.length > 0) {
          // Use the first valid package
          bookingType = `Package (${packages[0].package_type_name})`;
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
        console.error('Error with CRM matching fallback:', error);
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
    console.error('Failed to send LINE notification:', error);
    return NextResponse.json(
      { error: 'Failed to send LINE notification' },
      { status: 500 }
    );
  }
} 