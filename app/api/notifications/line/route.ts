import { NextRequest, NextResponse } from 'next/server';
// import { LINE_NOTIFY_TOKEN } from '@/lib/env'; // LINE_NOTIFY_TOKEN is not used for Messaging API

interface BookingNotification {
  customerName: string;
  email?: string; // Email is optional
  phoneNumber?: string | null;
  bookingDate: string;
  bookingStartTime: string;
  bookingEndTime: string;
  bayNumber: string;
  duration: number;
  numberOfPeople: number | null;
  bookingName?: string | null;
  packageInfo?: string;
  crmCustomerId?: string;
  customerNotes?: string;
  bookingId?: string;
  channel?: string; // e.g., 'Website', 'Staff', 'VIP Interface'
  notificationType?: 'booking_created' | 'booking_cancelled_vip' | 'booking_modified_vip' | 'general';
  cancellationReason?: string | null;
  cancelledBy?: string | null;
  // Optional standardized data field from the formatter (less used now, direct fields preferred)
  standardizedData?: {
    lineNotification: {
      bookingName: string;
      customerLabel: string;
    },
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

// Helper function to format date with ordinal suffix
function formatDateWithOrdinal(dateString: string): string {
  try {
    const dateObj = new Date(dateString);
    const day = dateObj.getDate();
    const dayWithSuffix = day + (
      day === 1 || day === 21 || day === 31 ? 'st' :
      day === 2 || day === 22 ? 'nd' :
      day === 3 || day === 23 ? 'rd' : 'th'
    );
    return dateObj.toLocaleDateString('en-GB', {
      weekday: 'short',
      day: 'numeric',
      month: 'long'
    }).replace(/\d+/, dayWithSuffix).replace(/(\w+)/, '$1,');
  } catch (e) {
    console.warn('[LINE API Route] Error formatting date:', dateString, e);
    return dateString; // Fallback to raw date string
  }
}


export async function POST(request: NextRequest) {
  try {
    console.log('[LINE API Route] Received request to /api/notifications/line');
    const requestData = await request.json();
    console.log('[LINE API Route] Request payload:', JSON.stringify(requestData, null, 2));

    const { 
      notificationType = 'booking_created', // Default to booking_created for backward compatibility
      customerNotes, 
      ...bookingData 
    }: BookingNotification & { customerNotes?: string, message?: string } = requestData;

    // If a raw message is provided (e.g. from older services or simple notifications), use it directly
    if (requestData.message && typeof requestData.message === 'string') {
      console.log('[LINE API Route] Using provided raw message for notification.');
      const rawMessage = requestData.message;
      // Proceed to send rawMessage directly
      const channelAccessToken = process.env.LINE_CHANNEL_ACCESS_TOKEN;
      const groupId = process.env.LINE_GROUP_ID;

      if (!channelAccessToken || !groupId) {
        console.error('[LINE API Route] LINE Messaging API credentials not set for raw message.');
        return NextResponse.json({ error: 'LINE API credentials not set' }, { status: 500 });
      }

      const response = await fetch('https://api.line.me/v2/bot/message/push', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${channelAccessToken}`,
        },
        body: JSON.stringify({
          to: groupId,
          messages: [{ type: 'text', text: rawMessage.trim() }]
        }),
      });
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ message: 'Failed to parse LINE API error response' }));
        console.error('[LINE API Route] LINE API error (raw message):', response.status, errorData);
        return NextResponse.json({ error: 'Failed to send LINE notification (raw)', details: errorData }, { status: response.status });
      }
      console.log('[LINE API Route] Raw LINE notification sent successfully.');
      return NextResponse.json({ success: true, type: 'raw_message_sent' });
    }
    
    // Prepare the sanitized booking object for structured messages
    let sb = bookingData; // sb for StructuredBooking, using direct props from BookingNotification
    const bookingIdString = sb.bookingId ? ` (ID: ${sb.bookingId})` : '';
    const formattedDate = formatDateWithOrdinal(sb.bookingDate);
    const bookingChannel = sb.channel || 'Website'; // Default to website

    let fullMessage = '';

    if (notificationType === 'booking_cancelled_vip') {
      console.log('[LINE API Route] Formatting VIP cancellation message.');
      const cancelledByDisplay = sb.cancelledBy || sb.customerName || 'Customer';
      const reasonDisplay = sb.cancellationReason ? `\nReason: ${sb.cancellationReason}` : '';
      
      fullMessage = `🚫 BOOKING CANCELLED${bookingIdString} 🚫`;
      fullMessage += `\n----------------------------------`;
      fullMessage += `\n👤 Customer: ${sb.customerName}`;
      if (sb.phoneNumber) fullMessage += `\n📞 Phone: ${sb.phoneNumber}`;
      fullMessage += `\n🗓️ Date: ${formattedDate}`;
      fullMessage += `\n⏰ Time: ${sb.bookingStartTime} - ${sb.bookingEndTime} (${sb.duration}h)`;
      fullMessage += `\n⛳ Bay: ${sb.bayNumber}`;
      fullMessage += `\n🧑‍🤝‍🧑 Pax: ${sb.numberOfPeople || 'N/A'}`;
      if (customerNotes) {
        fullMessage += `\n📝 Notes: ${customerNotes}`;
      }
      fullMessage += `\n----------------------------------`;
      fullMessage += `\n🗑️ Cancelled by ${cancelledByDisplay}`;
      fullMessage += reasonDisplay;

    } else if (notificationType === 'booking_created') { // Default behavior
      console.log('[LINE API Route] Formatting booking creation message.');
      fullMessage = `✅ NEW BOOKING${bookingIdString} ✅`;
      fullMessage += `\n----------------------------------`;
      fullMessage += `\n👤 Customer: ${sb.customerName}`; 
      fullMessage += `\n📛 Booking Name: ${sb.bookingName || sb.customerName}`; 
      if (sb.email) fullMessage += `\n📧 Email: ${sb.email}`;
      if (sb.phoneNumber) fullMessage += `\n📞 Phone: ${sb.phoneNumber}`;
      fullMessage += `\n🗓️ Date: ${formattedDate}`;
      fullMessage += `\n⏰ Time: ${sb.bookingStartTime} - ${sb.bookingEndTime} (${sb.duration}h)`;
      fullMessage += `\n⛳ Bay: ${sb.bayNumber}`;
      fullMessage += `\n📦 Type: ${sb.packageInfo || 'Normal Bay Rate'}`;
      fullMessage += `\n🧑‍🤝‍🧑 Pax: ${sb.numberOfPeople || '1'}`;
      fullMessage += `\n💻 Channel: ${bookingChannel}`;
      if (customerNotes) {
        fullMessage += `\n📝 Notes: ${customerNotes}`;
      }
      fullMessage += `\n----------------------------------`;
      fullMessage += `\nThis booking is AUTO-CONFIRMED.`;
      fullMessage += `\nPlease double-check bay selection.`;
    } else {
      // Fallback for other/general notification types if ever used
      console.log(`[LINE API Route] Formatting general message for type: ${notificationType}`);
      fullMessage = `ℹ️ Notification (Type: ${notificationType})${bookingIdString}\nCustomer: ${sb.customerName}\nDetails: Check system.`;
    }

    const channelAccessToken = process.env.LINE_CHANNEL_ACCESS_TOKEN;
    const groupId = process.env.LINE_GROUP_ID;

    if (!channelAccessToken) {
      console.error('[LINE API Route] LINE Messaging API access token is not set.');
      return NextResponse.json({ error: 'LINE API credentials not set' }, { status: 500 });
    }
    if (!groupId) {
      console.error('[LINE API Route] LINE group ID is not set.');
      return NextResponse.json({ error: 'LINE group ID not set' }, { status: 500 });
    }

    console.log('[LINE API Route] Sending structured LINE message to group:', {
      groupId,
      messageLength: fullMessage.length,
      customerName: sb.customerName,
      bookingName: sb.bookingName
    });

    const response = await fetch('https://api.line.me/v2/bot/message/push', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${channelAccessToken}`,
      },
      body: JSON.stringify({
        to: groupId,
        messages: [{ type: 'text', text: fullMessage.trim() }]
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ message: 'Failed to parse LINE API error response' }));
      console.error('[LINE API Route] LINE API error (structured):', response.status, errorData);
      return NextResponse.json({ error: 'Failed to send LINE notification (structured)', details: errorData }, { status: response.status });
    }

    console.log('[LINE API Route] Structured LINE notification sent successfully.');
    return NextResponse.json({ success: true, type: notificationType });

  } catch (error: any) {
    console.error('[LINE API Route] Error in main handler:', error);
    return NextResponse.json(
      { error: 'Internal server error in LINE notification handler', details: error.message },
      { status: 500 }
    );
  }
} 