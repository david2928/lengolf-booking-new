import { NextRequest, NextResponse } from 'next/server';
// import { LINE_NOTIFY_TOKEN } from '@/lib/env'; // User's code doesn't use this for Messaging API

interface BaseNotificationPayload {
  notificationType?: 'booking_created' | 'booking_cancelled_vip' | 'booking_modified_vip' | 'general_message';
  message?: string; // For raw text messages
  // Common fields that might be used across different notification types
  customerName?: string;
  bookingId?: string;
  // Add other potentially common fields as needed
}

interface BookingCreationPayload extends BaseNotificationPayload {
  notificationType?: 'booking_created'; // Overrides BaseNotificationPayload
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
  standardizedData?: { // This structure is from your provided code
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

interface BookingCancellationPayload extends BaseNotificationPayload {
  notificationType: 'booking_cancelled_vip'; // Explicitly set
  // Fields specific to cancellation, mirroring what sendVipCancellationNotification sends
  // customerName is already in BaseNotificationPayload
  phoneNumber?: string | null;
  bookingDate: string;
  bookingStartTime: string;
  bookingEndTime: string;
  bayNumber: string;
  duration: number;
  numberOfPeople?: number | null;
  // bookingId is already in BaseNotificationPayload
  customerNotes?: string | null;
  cancellationReason?: string | null;
  cancelledBy?: string | null;
}

// Union type for more specific payload handling if needed in the future
type NotificationPayload = BookingCreationPayload | BookingCancellationPayload | BaseNotificationPayload;

// Helper function to format date with ordinal suffix (from your provided code)
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
        console.warn('Error formatting date, using raw:', dateString);
        return dateString; // fallback
    }
}

export async function POST(request: NextRequest) {
  try {
    const payload: NotificationPayload = await request.json();
    
    const channelAccessToken = process.env.LINE_CHANNEL_ACCESS_TOKEN;
    const groupId = process.env.LINE_GROUP_ID;

    if (!channelAccessToken) {
      console.error('LINE Messaging API access token is not set');
      return NextResponse.json({ error: 'LINE Messaging API access token is not set' }, { status: 500 });
    }

    if (!groupId) {
      console.error('LINE group ID is not set');
      return NextResponse.json({ error: 'LINE group ID is not set' }, { status: 500 });
    }

    let messageToSend = '';
    const notificationType = payload.notificationType || 'booking_created'; // Default for safety

    // 1. Handle raw message if provided directly (e.g. for simple/general notifications)
    if (payload.message && typeof payload.message === 'string') {
      messageToSend = payload.message.trim();
    } 
    // 2. Handle typed notifications (cancellation, creation)
    else if (notificationType === 'booking_cancelled_vip') {
      const data = payload as BookingCancellationPayload;
      const bookingIdString = data.bookingId ? ` (ID: ${data.bookingId})` : '';
      const formattedDate = data.bookingDate ? formatDateWithOrdinal(data.bookingDate) : 'N/A';
      const cancelledByDisplay = data.cancelledBy || data.customerName || 'Customer';
      const reasonDisplay = data.cancellationReason ? `\nReason: ${data.cancellationReason}` : '';

      messageToSend = `🚫 BOOKING CANCELLED${bookingIdString} 🚫`;
      messageToSend += `\n----------------------------------`;
      messageToSend += `\n👤 Customer: ${data.customerName || 'N/A'}`;
      if (data.phoneNumber) messageToSend += `\n📞 Phone: ${data.phoneNumber}`;
      messageToSend += `\n🗓️ Date: ${formattedDate}`;
      messageToSend += `\n⏰ Time: ${data.bookingStartTime || 'N/A'} - ${data.bookingEndTime || 'N/A'} (${data.duration || 'N/A'}h)`;
      messageToSend += `\n⛳ Bay: ${data.bayNumber || 'N/A'}`;
      messageToSend += `\n🧑‍🤝‍🧑 Pax: ${data.numberOfPeople || 'N/A'}`;
      if (data.customerNotes) {
        messageToSend += `\n📝 Notes: ${data.customerNotes}`;
      }
      messageToSend += `\n----------------------------------`;
      messageToSend += `\n🗑️ Cancelled by ${cancelledByDisplay}`;
      messageToSend += reasonDisplay;
      messageToSend = messageToSend.trim();

    } else if (notificationType === 'booking_created' || (!payload.notificationType && (payload as BookingCreationPayload).bookingDate)) {
      // This condition handles both explicit 'booking_created' and implicit booking creation if notificationType is missing but booking fields are present
      const data = payload as BookingCreationPayload; // Cast to BookingCreationPayload
      let sanitizedBooking: any;

      if (data.standardizedData) {
        const std = data.standardizedData;
        const isNewCustomer = !data.crmCustomerId && !std.crmCustomerId;
        sanitizedBooking = {
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
          packageInfo: data.packageInfo,
          customerNotes: data.customerNotes,
          crmCustomerId: data.crmCustomerId || std.crmCustomerId
        };
      } else {
        sanitizedBooking = {
          customerName: data.crmCustomerId ? data.customerName : "New Customer",
          bookingName: data.bookingName,
          email: data.email,
          phoneNumber: data.phoneNumber,
          bookingDate: data.bookingDate, 
          bookingStartTime: data.bookingStartTime,
          bookingEndTime: data.bookingEndTime,
          bayNumber: data.bayNumber,
          duration: data.duration,
          numberOfPeople: data.numberOfPeople,
          packageInfo: data.packageInfo,
          customerNotes: data.customerNotes,
          crmCustomerId: data.crmCustomerId
        };
      }

      let formattedDate = sanitizedBooking.bookingDate; 
      if (!data.standardizedData && sanitizedBooking.bookingDate) {
          try {
              const dateObj = new Date(sanitizedBooking.bookingDate);
              const day = dateObj.getDate();
              const dayWithSuffix = day + (
                day === 1 || day === 21 || day === 31 ? 'st' : 
                day === 2 || day === 22 ? 'nd' : 
                day === 3 || day === 23 ? 'rd' : 'th'
              );
              formattedDate = dateObj.toLocaleDateString('en-GB', { 
                weekday: 'short', 
                day: 'numeric', 
                month: 'long' 
              }).replace(/\d+/, dayWithSuffix).replace(/(\w+)/, '$1,');
          } catch (e) {
              console.warn('Error formatting date for booking creation, using raw:', sanitizedBooking.bookingDate);
              // formattedDate remains as sanitizedBooking.bookingDate
          }
      }

      const bookingId = data.standardizedData?.bookingId || data.bookingId;
      const bookingIdString = bookingId ? ` (ID: ${bookingId})` : '';

      messageToSend = `Booking Notification${bookingIdString}`;
      messageToSend += `\nCustomer Name: ${sanitizedBooking.customerName}`;
      messageToSend += `\nBooking Name: ${sanitizedBooking.bookingName}`;
      messageToSend += `\nEmail: ${sanitizedBooking.email || 'Not provided'}`;
      messageToSend += `\nPhone: ${sanitizedBooking.phoneNumber || 'Not provided'}`;
      messageToSend += `\nDate: ${formattedDate}`;
      messageToSend += `\nTime: ${sanitizedBooking.bookingStartTime || 'N/A'} - ${sanitizedBooking.bookingEndTime || 'N/A'}`;
      messageToSend += `\nBay: ${sanitizedBooking.bayNumber || 'N/A'}`;
      messageToSend += `\nType: ${sanitizedBooking.packageInfo || 'Normal Bay Rate'}`;
      messageToSend += `\nPeople: ${sanitizedBooking.numberOfPeople || '1'}`;
      messageToSend += `\nChannel: Website`; // Assuming Website, or pass channel in payload if dynamic
      if (sanitizedBooking.customerNotes) {
        messageToSend += `\nNotes: ${sanitizedBooking.customerNotes}`;
      }
      messageToSend += `\n\nThis booking has been auto-confirmed. No need to re-confirm with the customer. Please double check bay selection`;
      messageToSend = messageToSend.trim();
    } else {
      // Fallback for unknown structured notification types
      console.warn(`Unknown notification type: ${notificationType}`);
      messageToSend = `ℹ️ Received notification of type: ${notificationType}. Details: ${JSON.stringify(payload)}`;
    }

    if (!messageToSend) {
        console.error('Message to send is empty');
        return NextResponse.json({ error: 'Failed to generate LINE message content' }, { status: 400 });
    }

    const response = await fetch('https://api.line.me/v2/bot/message/push', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${channelAccessToken}`,
      },
      body: JSON.stringify({
        to: groupId,
        messages: [{ type: 'text', text: messageToSend }],
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ message: response.statusText }));
      console.error('LINE API error:', response.status, errorData);
      return NextResponse.json(
        { error: 'Failed to send LINE notification to LINE API', details: errorData, notificationTypeProcessed: notificationType },
        { status: response.status }
      );
    }

    return NextResponse.json({ success: true, notificationTypeSent: notificationType });

  } catch (error: any) {
    console.error('Error in LINE notification handler:', error);
    return NextResponse.json(
      { error: 'Internal server error in LINE notification handler', details: error.message || 'Unknown error' },
      { status: 500 }
    );
  }
} 