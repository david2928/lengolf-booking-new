import { NextRequest, NextResponse } from 'next/server';
import { LINE_NOTIFY_TOKEN } from '@/lib/env';

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
  bookingName: string;
  packageInfo?: string;
  crmCustomerId?: string;
  customerNotes?: string;
  bookingId?: string;
  // Optional standardized data field from the formatter
  standardizedData?: {
    lineNotification: {
      bookingName: string;
      customerLabel: string;
    },
    // Common fields
    bookingId: string;
    customerName: string;
    email: string;
    phoneNumber: string;
    date: string;
    formattedDate: string;
    startTime: string;
    endTime: string;
    bayName: string;
    duration: number;
    numberOfPeople: number;
    isNewCustomer?: boolean;
    crmCustomerId?: string;
  }
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
    
    const { customerNotes, ...bookingData }: BookingNotification & { customerNotes?: string } = await request.json();
    
    // Prepare the sanitized booking object
    let sanitizedBooking: any;
    
    // Check if we have standardized data from the formatter
    if (bookingData.standardizedData) {
      const std = bookingData.standardizedData;
      
      // Check if this is a new customer (no CRM ID)
      const isNewCustomer = !bookingData.crmCustomerId && !std.crmCustomerId;
      
      // Use standardized data
      sanitizedBooking = {
        // Always use "New Customer" when there's no CRM ID, otherwise use customerLabel or customerName
        customerName: isNewCustomer ? "New Customer" : (std.lineNotification.customerLabel || std.customerName),
        bookingName: std.lineNotification.bookingName,
        email: std.email,
        phoneNumber: std.phoneNumber,
        bookingDate: std.formattedDate,
        bookingStartTime: std.startTime,
        bookingEndTime: std.endTime,
        bayNumber: std.bayName,
        duration: std.duration,
        numberOfPeople: std.numberOfPeople,
        packageInfo: bookingData.packageInfo,
        customerNotes: customerNotes,
        crmCustomerId: bookingData.crmCustomerId || std.crmCustomerId
      };
    } else {
      // Fallback to legacy format for backward compatibility
      sanitizedBooking = {
        // For legacy format, check if we have a CRM ID
        customerName: bookingData.crmCustomerId ? bookingData.customerName : "New Customer",
        bookingName: bookingData.bookingName,
        email: bookingData.email,
        phoneNumber: bookingData.phoneNumber,
        bookingDate: bookingData.bookingDate,
        bookingStartTime: bookingData.bookingStartTime,
        bookingEndTime: bookingData.bookingEndTime,
        bayNumber: bookingData.bayNumber,
        duration: bookingData.duration,
        numberOfPeople: bookingData.numberOfPeople,
        packageInfo: bookingData.packageInfo,
        customerNotes: customerNotes,
        crmCustomerId: bookingData.crmCustomerId
      };
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

    // Attempt to get bookingId from standardizedData first, then from top-level bookingData
    const bookingId = bookingData.standardizedData?.bookingId || bookingData.bookingId;
    const bookingIdString = bookingId ? ` (ID: ${bookingId})` : '';

    // Generate the notification message with consistent fallbacks
    const fullMessage = `Booking Notification${bookingIdString}
Customer Name: ${sanitizedBooking.customerName}
Booking Name: ${sanitizedBooking.bookingName}
Email: ${sanitizedBooking.email || 'Not provided'}
Phone: ${sanitizedBooking.phoneNumber || 'Not provided'}
Date: ${formattedDate}
Time: ${sanitizedBooking.bookingStartTime} - ${sanitizedBooking.bookingEndTime}
Bay: ${sanitizedBooking.bayNumber}
Type: ${sanitizedBooking.packageInfo || 'Normal Bay Rate'}
People: ${sanitizedBooking.numberOfPeople || '1'}
Channel: Website
${sanitizedBooking.customerNotes ? `\nNotes: ${sanitizedBooking.customerNotes}` : ''}

This booking has been auto-confirmed. No need to re-confirm with the customer. Please double check bay selection`.trim();

    // Use LINE Messaging API instead of LINE Notify
    const channelAccessToken = process.env.LINE_CHANNEL_ACCESS_TOKEN;
    const groupId = process.env.LINE_GROUP_ID;

    console.log(`[VIP DEBUG] Vercel Environment: ${process.env.VERCEL_ENV || 'Not set/Local'}, Branch: ${process.env.VERCEL_GIT_COMMIT_REF || 'Not set/Local'}, Attempting to use LINE_GROUP_ID: ${groupId}`);

    if (!channelAccessToken) {
      throw new Error('LINE Messaging API access token is not set');
    }

    if (!groupId) {
      throw new Error('LINE group ID is not set');
    }

    console.log('Sending LINE message to group:', {
      groupId,
      messageLength: fullMessage.length,
      customerName: sanitizedBooking.customerName,
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
    console.error('Error in LINE notification handler:', error);
    return NextResponse.json(
      { error: 'Failed to send LINE notification' },
      { status: 500 }
    );
  }
} 