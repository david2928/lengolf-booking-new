import { LINE_NOTIFY_TOKEN } from './env';

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

export async function sendBookingNotification(booking: BookingNotification) {
  try {
    const response = await fetch('/api/notifications/line', {
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