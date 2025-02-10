import NodeCache from 'node-cache';
import { calendar, AVAILABILITY_CALENDARS } from '@/lib/googleApiConfig';
import { format, addDays, setHours, setMinutes, setSeconds } from 'date-fns';

// Cache instances
export const calendarCache = new NodeCache({
  stdTTL: 300, // 5 minutes
  checkperiod: 60, // Check for expired entries every minute
});

export const authCache = new NodeCache({
  stdTTL: 60, // 1 minute
  checkperiod: 30, // Check for expired entries every 30 seconds
});

// Cache keys
export const getCacheKey = {
  calendar: (date: string) => `calendar_${date}`,
  auth: (userId: string) => `auth_${userId}`,
};

// Function to fetch calendar events for a specific date
async function fetchCalendarEvents(date: Date) {
  const startOfDay = setSeconds(setMinutes(setHours(date, 0), 0), 0);
  const endOfDay = setSeconds(setMinutes(setHours(date, 23), 59), 59);

  const bayEvents = await Promise.all(
    Object.values(AVAILABILITY_CALENDARS).map(calendarId =>
      calendar.events.list({
        calendarId,
        timeMin: format(startOfDay, "yyyy-MM-dd'T'HH:mm:ssxxx"),
        timeMax: format(endOfDay, "yyyy-MM-dd'T'HH:mm:ssxxx"),
        singleEvents: true,
        orderBy: 'startTime',
        timeZone: 'Asia/Bangkok',
      })
    )
  );

  return bayEvents.flatMap(response => response.data.items || []);
}

// Function to update cache for next 3 days
export async function updateCalendarCache() {
  try {
    const today = new Date();
    const dates = [
      today,
      addDays(today, 1),
      addDays(today, 2)
    ];

    await Promise.all(dates.map(async (date) => {
      const dateKey = format(date, 'yyyy-MM-dd');
      const cacheKey = getCacheKey.calendar(dateKey);
      const events = await fetchCalendarEvents(date);
      calendarCache.set(cacheKey, events);
      console.log(`Updated cache for ${dateKey}`);
    }));

    console.log('Calendar cache updated successfully');
  } catch (error) {
    console.error('Error updating calendar cache:', error);
  }
}

// Start background cache update
let cacheInterval: NodeJS.Timeout;

export function startCacheUpdates() {
  // Initial update
  updateCalendarCache();

  // Update every 5 minutes
  cacheInterval = setInterval(updateCalendarCache, 5 * 60 * 1000);
}

export function stopCacheUpdates() {
  if (cacheInterval) {
    clearInterval(cacheInterval);
  }
} 