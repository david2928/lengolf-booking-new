import { LINE_NOTIFY_TOKEN } from './env';
import { format, parse, getDate, addMinutes } from 'date-fns';
import { formatInTimeZone } from 'date-fns-tz';

// Helper to get base URL for server-side fetch
const getBaseUrl = () => {
  if (process.env.NEXTAUTH_URL) {
    return process.env.NEXTAUTH_URL.startsWith('http') 
      ? process.env.NEXTAUTH_URL 
      : `http://${process.env.NEXTAUTH_URL}`;
  }
  // Fallback for local development if NEXTAUTH_URL is not set
  return process.env.NODE_ENV === 'development' 
    ? 'http://localhost:3000' 
    : ''; // Production should have NEXTAUTH_URL or similar set
};

// Define a more comprehensive Booking type for notifications
// This should align with the data available in cancelledBooking object
export interface NotificationBookingData {
  id: string;                   // from bookings_vip_staging
  name?: string | null;          // from profiles_vip_staging.display_name (mapped to name for convenience)
  phone_number?: string | null;  // from profiles_vip_staging.phone_number
  date: string;                 // from bookings_vip_staging (YYYY-MM-DD)
  start_time: string;           // from bookings_vip_staging (HH:mm)
  duration: number;             // from bookings_vip_staging (hours)
  bay: string | null;           // from bookings_vip_staging
  number_of_people: number | null; // from bookings_vip_staging
  customer_notes?: string | null; // from bookings_vip_staging
  cancelled_by_identifier?: string | null; // from bookings_vip_staging
  cancellation_reason?: string | null;   // from bookings_vip_staging
  // Add any other fields from bookings_vip_staging or profiles_vip_staging if needed
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
      },
      body: JSON.stringify({ message }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('LINE Notify API response error:', response.status, errorText);
      throw new Error(`Failed to send VIP modification LINE notification: ${errorText}`);
    }
    console.log('Successfully sent VIP modification LINE notification.');
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

function formatVipLineCancellationMessage(
  cancelledBooking: NotificationBookingData
): string {
  console.log('[Line Service] Formatting VIP cancellation message for booking ID:', cancelledBooking.id);

  let formattedDate: string;
  try {
    const dateObj = parse(cancelledBooking.date, 'yyyy-MM-dd', new Date());
    const day = getDate(dateObj);
    const weekday = formatInTimeZone(dateObj, TIMEZONE, 'EEE');
    const month = formatInTimeZone(dateObj, TIMEZONE, 'MMMM');
    formattedDate = `${weekday}, ${day}${getOrdinalSuffix(day)} ${month}`;
  } catch (e) {
    console.error('[Line Service] Error formatting date for LINE cancellation:', cancelledBooking.date, e);
    formattedDate = cancelledBooking.date; // Fallback to raw date
  }

  const startTimeStr = cancelledBooking.start_time; // HH:mm
  let endTimeStr = 'N/A';
  if (cancelledBooking.date && startTimeStr && cancelledBooking.duration) {
      try {
        const endTimeDate = addMinutes(parse(`${cancelledBooking.date}T${startTimeStr}`, "yyyy-MM-dd'T'HH:mm", new Date()), cancelledBooking.duration * 60);
        endTimeStr = format(endTimeDate, 'HH:mm');
      } catch (e) {
        console.error('[Line Service] Error formatting end time for LINE cancellation:', e);
      }
  }
  
  const customerNameDisplay = cancelledBooking.name || 'VIP User'; // Use mapped name
  const phoneNumberDisplay = cancelledBooking.phone_number || 'N/A';
  const bayDisplay = getDisplayBayName(cancelledBooking.bay);
  const cancelledByDisplay = customerNameDisplay; 
  const reasonDisplay = cancelledBooking.cancellation_reason ? `\nReason: ${cancelledBooking.cancellation_reason}` : '';

  let message = `🚫 BOOKING CANCELLED (ID: ${cancelledBooking.id}) 🚫`;
  message += `\n----------------------------------`;
  message += `\n👤 Customer: ${customerNameDisplay}`;
  message += `\n📞 Phone: ${phoneNumberDisplay}`;
  message += `\n🗓️ Date: ${formattedDate}`;
  message += `\n⏰ Time: ${startTimeStr} - ${endTimeStr} (${cancelledBooking.duration}h)`;
  message += `\n⛳ Bay: ${bayDisplay}`;
  message += `\n🧑‍🤝‍🧑 Pax: ${cancelledBooking.number_of_people || 'N/A'}`;
  if (cancelledBooking.customer_notes) {
    message += `\n📝 Notes: ${cancelledBooking.customer_notes}`;
  }
  message += `\n----------------------------------`;
  message += `\n🗑️ Cancelled By: ${cancelledByDisplay}`;
  message += reasonDisplay;
  
  console.log('[Line Service] Formatted VIP LINE cancellation message:', message);
  return message.trim();
}

// Updated VIP Booking Cancellation Notification function
export async function sendVipCancellationNotification(
  cancelledBookingData: NotificationBookingData
) {
  const baseUrl = getBaseUrl();
  if (!baseUrl) {
    console.error('Base URL for notifications is not configured. Skipping VIP cancellation LINE notification.');
    return false;
  }
  // Format the detailed message
  const message = formatVipLineCancellationMessage(cancelledBookingData);
  
  try {
    const response = await fetch(`${baseUrl}/api/notifications/line/simple`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ message }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('LINE Notify API response error:', response.status, errorText);
      throw new Error(`Failed to send VIP cancellation LINE notification: ${errorText}`);
    }
    console.log('Successfully sent VIP cancellation LINE notification.');
    return true;
  } catch (error) {
    console.error('Error sending VIP cancellation LINE notification:', error);
    return false;
  }
} 