import { calendar } from '@/lib/googleApiConfig';
import { BOOKING_CALENDARS } from '@/lib/bookingCalendarConfig';
import { BAY_COLORS } from '@/lib/bayConfig';
import { format, parseISO, addMinutes } from 'date-fns';
import { formatInTimeZone } from 'date-fns-tz';

const TIMEZONE = 'Asia/Bangkok';

function getCalendarIdForBay(bayId: string): string | null {
  const bayKey = Object.keys(BOOKING_CALENDARS).find(key => key.toLowerCase().includes(bayId.replace('_', ' ').toLowerCase()));
  return bayKey ? BOOKING_CALENDARS[bayKey as keyof typeof BOOKING_CALENDARS] : null;
}

function calculateEndDateTime(startDateTimeISO: string, durationMinutes: number): string {
  const startDate = parseISO(startDateTimeISO);
  const endDate = addMinutes(startDate, durationMinutes);
  return endDate.toISOString();
}

export async function updateCalendarEventForBooking(bookingDetails: {
  bookingId: string;
  googleCalendarEventId: string;
  originalBayId: string; // Bay ID of the booking before modification
  newDate: string; 
  newStartTime: string; 
  newDurationMinutes: number;
  newBayId: string; // The new Bay ID for the booking (summary/description reflects this)
  userName: string;
  phoneNumber: string;
  numberOfPeople: number;
  packageInfo?: string;
}) {
  const { 
    bookingId, googleCalendarEventId, originalBayId, newDate, newStartTime, 
    newDurationMinutes, newBayId, userName, phoneNumber, 
    numberOfPeople, packageInfo = 'Normal Bay Rate' 
  } = bookingDetails;

  if (!googleCalendarEventId) {
    console.error(`No googleCalendarEventId for booking ${bookingId}, cannot update.`);
    return null; 
  }

  // The event is updated on its original calendar.
  const calendarIdForUpdate = getCalendarIdForBay(originalBayId);
  if (!calendarIdForUpdate) {
    console.error(`Could not find calendar ID for original bay ${originalBayId} for booking ${bookingId}`);
    return null;
  }

  const startDateTimeISO = `${newDate}T${newStartTime}:00`;
  const endDateTimeISO = calculateEndDateTime(startDateTimeISO, newDurationMinutes);
  
  // Display name for the *new* bay in the event details
  const newBayDisplayName = `Bay ${newBayId.split('_')[1] || newBayId}`;

  try {
    console.log(`Updating calendar event ${googleCalendarEventId} on calendar ${calendarIdForUpdate} for booking ${bookingId}`);
    const eventPatch = {
      summary: `${userName} (${phoneNumber}) (${numberOfPeople}) - ${packageInfo} at ${newBayDisplayName}`,
      description: `Customer Name: ${userName}\nContact: ${phoneNumber}\nPax: ${numberOfPeople}\nType: ${packageInfo}\nBay: ${newBayDisplayName} (Originally Bay ${originalBayId.split('_')[1] || originalBayId})\nDate: ${formatInTimeZone(parseISO(startDateTimeISO), TIMEZONE, 'EEEE, MMMM d')}\nTime: ${formatInTimeZone(parseISO(startDateTimeISO), TIMEZONE, 'HH:mm')} - ${formatInTimeZone(parseISO(endDateTimeISO), TIMEZONE, 'HH:mm')}\nVia: Website (Modified by VIP)\nBooking ID: ${bookingId}`,
      start: {
        dateTime: startDateTimeISO,
        timeZone: TIMEZONE,
      },
      end: {
        dateTime: endDateTimeISO,
        timeZone: TIMEZONE,
      },
      colorId: BAY_COLORS[newBayDisplayName as keyof typeof BAY_COLORS] || '1',
    };

    const response = await calendar.events.update({
      calendarId: calendarIdForUpdate, // Update on the original calendar
      eventId: googleCalendarEventId,
      requestBody: eventPatch,
    });
    console.log(`Calendar event updated for booking ${bookingId}:`, response.data.id);
    return response.data;
  } catch (error) {
    console.error(`Failed to update calendar event for booking ${bookingId}:`, error);
    return null;
  }
}

export async function deleteCalendarEventForBooking(bookingId: string, googleCalendarEventId: string, currentBayId: string) {
  if (!googleCalendarEventId) {
    console.error(`No googleCalendarEventId for booking ${bookingId}, cannot delete.`);
    return false;
  }
  
  const calendarId = getCalendarIdForBay(currentBayId);
  if(!calendarId){
      console.error(`Could not find calendar ID for bay ${currentBayId} for booking ${bookingId} to delete event.`);
      return false;
  }

  try {
    console.log(`Deleting calendar event ${googleCalendarEventId} from calendar ${calendarId} for booking ${bookingId}`);
    await calendar.events.delete({
      calendarId: calendarId, 
      eventId: googleCalendarEventId,
    });
    console.log(`Calendar event deleted for booking ${bookingId}`);
    return true;
  } catch (error) {
    console.error(`Failed to delete calendar event for booking ${bookingId}:`, error);
    return false;
  }
} 