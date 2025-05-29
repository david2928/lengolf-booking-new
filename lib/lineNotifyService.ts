import { LINE_NOTIFY_TOKEN } from './env';
import { format, parse, getDate, addMinutes } from 'date-fns';
import { formatInTimeZone } from 'date-fns-tz';

// Helper to get base URL for server-side fetch
const getBaseUrl = () => {
  let baseUrl = '';

  // For Vercel deployments (preview or production), VERCEL_URL should be the most reliable for internal calls
  // process.env.VERCEL_ENV can be 'production', 'preview', or 'development' (for vercel dev)
  if (process.env.VERCEL_ENV && process.env.VERCEL_ENV !== 'development' && process.env.VERCEL_URL) {
    baseUrl = `https://${process.env.VERCEL_URL}`;
  } else {
    // For local development or if Vercel variables aren't set, try NEXT_PUBLIC_APP_URL then NEXTAUTH_URL
    baseUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.NEXTAUTH_URL || '';
    if (baseUrl && !baseUrl.startsWith('http')) {
      baseUrl = `http://${baseUrl}`;
    }
    if (!baseUrl && process.env.NODE_ENV !== 'production') { // Extra fallback for non-production, non-Vercel
      baseUrl = 'http://localhost:3000';
    }
  }

  if (!baseUrl) {
    console.error('[getBaseUrl] CRITICAL: Base URL for API calls could not be determined. Notifications will likely fail.');
    return ''; // Return empty string to ensure fetch fails clearly if no URL
  }
  
  return baseUrl;
};

// Define a more comprehensive Booking type for notifications
// This should align with the data available in cancelledBooking object
export interface NotificationBookingData {
  id: string;                   // from bookings
  name?: string | null;          // from profiles.display_name (mapped to name for convenience)
  phone_number?: string | null;  // from profiles.phone_number
  date: string;                 // from bookings (YYYY-MM-DD)
  start_time: string;           // from bookings (HH:mm)
  duration: number;             // from bookings (hours)
  bay: string | null;           // from bookings
  number_of_people: number | null; // from bookings
  customer_notes?: string | null; // from bookings
  cancelled_by_identifier?: string | null; // from bookings
  cancellation_reason?: string | null;   // from bookings
  // Add any other fields from bookings or profiles if needed
}

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
  bookingId?: string;
  channel?: string;
}

export async function sendBookingNotification(booking: BookingNotification) {
  const baseUrl = getBaseUrl();
  if (!baseUrl) {
    console.error('Base URL for notifications is not configured. Skipping LINE notification.');
    return false;
  }
  try {
    const response = await fetch(`${baseUrl}/api/notifications/line`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(booking),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to send LINE notification');
    }

    return true;
  } catch (error) {
    console.error('Failed to send LINE notification:', error);
    return false;
  }
}

// VIP-BE-012: Function for VIP Booking Modification Notification
export async function sendVipModificationNotification(
  userName: string, 
  bookingId: string, 
  newDetails: string // e.g., "New Date/Time/Bay"
) {
  const baseUrl = getBaseUrl();
  if (!baseUrl) {
    console.error('Base URL for notifications is not configured. Skipping VIP modification LINE notification.');
    return false;
  }
  const message = `VIP ${userName} modified booking ${bookingId} to ${newDetails}.`;
  try {
    const response = await fetch(`${baseUrl}/api/notifications/line/simple`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache'
      },
      body: JSON.stringify({ message }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('LINE Notify API response error:', response.status, errorText);
      throw new Error(`Failed to send VIP modification LINE notification: ${errorText}`);
    }
    return true;
  } catch (error) {
    console.error('Error sending VIP modification LINE notification:', error);
    return false;
  }
}

const TIMEZONE = 'Asia/Bangkok';

function getOrdinalSuffix(day: number): string {
  const j = day % 10, k = day % 100;
  if (j == 1 && k != 11) { return "st"; }
  if (j == 2 && k != 12) { return "nd"; }
  if (j == 3 && k != 13) { return "rd"; }
  return "th";
}

function getDisplayBayName(simpleBayName: string | null): string {
    if (simpleBayName === 'Bay 1') return 'Bay 1 (Bar)';
    if (simpleBayName === 'Bay 2') return 'Bay 2';
    if (simpleBayName === 'Bay 3') return 'Bay 3 (Entrance)';
    return simpleBayName || 'N/A';
}

// Updated VIP Booking Cancellation Notification function
export async function sendVipCancellationNotification(
  cancelledBookingData: NotificationBookingData // This is the raw data from the booking
) {
  const baseUrl = getBaseUrl();
  if (!baseUrl) {
    console.error('Base URL for notifications is not configured. Skipping VIP cancellation LINE notification.');
    return false;
  }

  let endTimeStr = 'N/A';
  if (cancelledBookingData.date && cancelledBookingData.start_time && cancelledBookingData.duration) {
    try {
      const endTimeDate = addMinutes(parse(`${cancelledBookingData.date}T${cancelledBookingData.start_time}`, "yyyy-MM-dd'T'HH:mm", new Date()), cancelledBookingData.duration * 60);
      endTimeStr = format(endTimeDate, 'HH:mm');
    } catch (e) {
      console.error('Error formatting end time:', e);
    }
  }

  const linePayload = {
    notificationType: 'booking_cancelled_vip',
    // Pass raw data that the API route will use for formatting
    customerName: cancelledBookingData.name || 'VIP User', // From profiles.display_name usually
    phoneNumber: cancelledBookingData.phone_number,
    bookingDate: cancelledBookingData.date, // YYYY-MM-DD
    bookingStartTime: cancelledBookingData.start_time, // HH:mm
    bookingEndTime: endTimeStr, // HH:mm
    bayNumber: getDisplayBayName(cancelledBookingData.bay), // Pass the display name
    duration: cancelledBookingData.duration,
    numberOfPeople: cancelledBookingData.number_of_people,
    bookingId: cancelledBookingData.id,
    customerNotes: cancelledBookingData.customer_notes,
    cancellationReason: cancelledBookingData.cancellation_reason,
    // 'cancelledBy' should reflect who initiated the cancellation from the booking data if available
    // cancelledBookingData.cancelled_by_identifier is often the user's display name from profile
    cancelledBy: cancelledBookingData.cancelled_by_identifier || cancelledBookingData.name || 'Customer'
  };

  try {
    const response = await fetch(`${baseUrl}/api/notifications/line`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache'
      },
      body: JSON.stringify(linePayload),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('VIP cancellation LINE notification failed:', response.status, errorText);
      throw new Error(`Failed to send VIP cancellation LINE notification: ${response.status} - ${errorText}`);
    }
    return true;
  } catch (error) {
    console.error('Error sending VIP cancellation LINE notification:', error);
    return false;
  }
} 