import { NextRequest, NextResponse } from 'next/server';
// import { LINE_NOTIFY_TOKEN } from '@/lib/env'; // User's code doesn't use this for Messaging API
import {
  buildBookingCreatedMessage,
  formatDateWithOrdinal,
  pushToStaffGroup,
  StaffLineError,
} from '@/lib/notifications/staffLine';

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
  bookingType?: string; // Add booking type
  packageName?: string; // Add package name
  customerCode?: string;
  customerNotes?: string;
  channel?: string;
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
    customerCode?: string;
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

// `formatDateWithOrdinal` and the booking-created message builder now live in
// `@/lib/notifications/staffLine` so in-process callers can reach them without
// a self-HTTP round trip. Behaviour here is unchanged.

export async function POST(request: NextRequest) {
  try {
    const payload: NotificationPayload = await request.json();

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
      messageToSend = buildBookingCreatedMessage(data);
    } else {
      // Fallback for unknown structured notification types
      console.warn(`Unknown notification type: ${notificationType}`);
      messageToSend = `ℹ️ Received notification of type: ${notificationType}. Details: ${JSON.stringify(payload)}`;
    }

    try {
      await pushToStaffGroup(messageToSend);
    } catch (pushError: unknown) {
      if (pushError instanceof StaffLineError) {
        // Missing-env and empty-message cases carry no `details` and predate the
        // extraction, so they keep their original bare-error response shape.
        if (pushError.details === undefined) {
          return NextResponse.json({ error: pushError.message }, { status: pushError.status });
        }
        return NextResponse.json(
          { error: pushError.message, details: pushError.details, notificationTypeProcessed: notificationType },
          { status: pushError.status }
        );
      }
      throw pushError;
    }

    return NextResponse.json({ success: true, notificationTypeSent: notificationType });

  } catch (error: unknown) {
    console.error('Error in LINE notification handler:', error);
    return NextResponse.json(
      { error: 'Internal server error in LINE notification handler', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
} 