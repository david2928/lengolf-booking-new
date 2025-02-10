import { NextResponse } from 'next/server';
import { format, parse, addHours, setHours, setMinutes, setSeconds } from 'date-fns';
import { zonedTimeToUtc, utcToZonedTime, formatInTimeZone } from 'date-fns-tz';
import { calendar, AVAILABILITY_CALENDARS } from '@/lib/googleApiConfig';
import { createClient } from '@/utils/supabase/server';
import { performance } from 'perf_hooks';
import { calendarCache, authCache, getCacheKey, updateCalendarCache } from '@/lib/cache';
import { debug } from '@/lib/debug';

const OPENING_HOUR = 10; // 10:00 AM
const CLOSING_HOUR = 23; // 11:00 PM (last booking can be until 10:00 PM)
const MAX_HOURS = 5;
const TIMEZONE = 'Asia/Bangkok';

// Helper function to determine period
function getTimePeriod(hour: number): 'morning' | 'afternoon' | 'evening' {
  if (hour < 13) return 'morning';      // 10:00 - 12:00
  if (hour < 17) return 'afternoon';    // 13:00 - 16:00
  return 'evening';                     // 17:00 - 22:00
}

export async function POST(request: Request) {
  const startTime = performance.now();
  let authTime = 0;
  let googleTime = 0;
  let processingTime = 0;
  let cacheHit = { auth: false, calendar: false };

  try {
    // Create Supabase client and check session
    const authStart = performance.now();
    const supabase = await createClient();
    const { data: { user }, error: sessionError } = await supabase.auth.getUser();
    
    if (sessionError || !user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Check auth cache
    const authCacheKey = getCacheKey.auth(user.id);
    const cachedAuth = authCache.get(authCacheKey);
    
    if (!cachedAuth) {
      // Cache the auth result
      authCache.set(authCacheKey, true);
    } else {
      cacheHit.auth = true;
    }
    
    authTime = performance.now() - authStart;

    const { date } = await request.json();
    const selectedDate = zonedTimeToUtc(parse(date, 'yyyy-MM-dd', new Date()), TIMEZONE);
    const currentDate = new Date();
    const currentDateInZone = utcToZonedTime(currentDate, TIMEZONE);
    const currentHourInZone = parseInt(formatInTimeZone(currentDate, TIMEZONE, 'HH'));
    
    const isToday = formatInTimeZone(selectedDate, TIMEZONE, 'yyyy-MM-dd') === formatInTimeZone(currentDate, TIMEZONE, 'yyyy-MM-dd');
    
    // For today, start from the next hour
    const startHour = isToday ? Math.max(OPENING_HOUR, currentHourInZone + 1) : OPENING_HOUR;

    debug.log('Time checks:', {
      selectedDate: formatInTimeZone(selectedDate, TIMEZONE, 'yyyy-MM-dd HH:mm:ssXXX'),
      currentDate: formatInTimeZone(currentDate, TIMEZONE, 'yyyy-MM-dd HH:mm:ssXXX'),
      currentHourInZone,
      isToday,
      startHour,
      openingHour: OPENING_HOUR,
      closingHour: CLOSING_HOUR
    });
    
    // Get events from all bays with caching
    const googleStart = performance.now();
    let allEvents: any[] = [];

    // Check calendar cache
    const calendarCacheKey = getCacheKey.calendar(formatInTimeZone(selectedDate, TIMEZONE, 'yyyy-MM-dd'));
    const cachedEvents = calendarCache.get<any[]>(calendarCacheKey);

    if (cachedEvents) {
      allEvents = cachedEvents;
      cacheHit.calendar = true;
    } else {
      // If cache miss, trigger a cache update for the next 3 days
      updateCalendarCache().catch(console.error);
      
      // Meanwhile, fetch the data directly for this request
      const startOfDay = zonedTimeToUtc(setSeconds(setMinutes(setHours(selectedDate, 0), 0), 0), TIMEZONE);
      const endOfDay = zonedTimeToUtc(setSeconds(setMinutes(setHours(selectedDate, 23), 59), 59), TIMEZONE);
      
      const bayEvents = await Promise.all(
        Object.values(AVAILABILITY_CALENDARS).map(calendarId =>
          calendar.events.list({
            calendarId,
            timeMin: formatInTimeZone(startOfDay, TIMEZONE, "yyyy-MM-dd'T'HH:mm:ssxxx"),
            timeMax: formatInTimeZone(endOfDay, TIMEZONE, "yyyy-MM-dd'T'HH:mm:ssxxx"),
            singleEvents: true,
            orderBy: 'startTime',
            timeZone: TIMEZONE,
          })
        )
      );
      
      allEvents = bayEvents.flatMap(response => response.data.items || []);
    }

    // Debug log the events
    debug.log('Calendar Events for date:', date);
    allEvents.forEach((event, index) => {
      debug.log(`Event ${index + 1}:`, {
        calendar: event.organizer?.email,
        summary: event.summary,
        start: event.start?.dateTime,
        end: event.end?.dateTime
      });
    });
    
    googleTime = performance.now() - googleStart;

    // Process slots
    const processingStart = performance.now();

    // Generate all possible time slots
    const slots = [];
    for (let hour = startHour; hour <= CLOSING_HOUR - 1; hour++) {
      // Create the slot start time for the current hour
      const slotStart = zonedTimeToUtc(setSeconds(setMinutes(setHours(selectedDate, hour), 0), 0), TIMEZONE);
      const timeStr = formatInTimeZone(slotStart, TIMEZONE, 'HH:mm');

      debug.log(`Processing slot for hour ${hour}:`, {
        slotStartTime: formatInTimeZone(slotStart, TIMEZONE, 'HH:mm:ssXXX'),
        currentTime: formatInTimeZone(currentDate, TIMEZONE, 'HH:mm:ssXXX'),
        isToday,
        isAfterCurrent: slotStart.getTime() > currentDate.getTime()
      });

      // Calculate maximum available hours
      const hoursUntilClose = CLOSING_HOUR - hour;
      let maxAvailableHours = Math.min(MAX_HOURS, hoursUntilClose);

      // Check each bay for availability
      const availableBays = Object.keys(AVAILABILITY_CALENDARS).filter(bay => {
        const bayEvents = allEvents.filter(event =>
          event.organizer?.email === AVAILABILITY_CALENDARS[bay as keyof typeof AVAILABILITY_CALENDARS]
        );

        // Debug log the bay check
        debug.log(`Checking bay ${bay} for hour ${timeStr}:`, {
          events: bayEvents.length,
          conflicts: bayEvents.some(event => {
            const eventStart = new Date(event.start?.dateTime || '');
            const eventEnd = new Date(event.end?.dateTime || '');
            const slotStartTime = slotStart.getTime();
            const eventStartTime = eventStart.getTime();
            const eventEndTime = eventEnd.getTime();
            const hasConflict = slotStartTime >= eventStartTime && slotStartTime < eventEndTime;
            if (hasConflict) {
              debug.log(`Found conflict with event:`, {
                start: formatInTimeZone(eventStart, TIMEZONE, 'HH:mm'),
                end: formatInTimeZone(eventEnd, TIMEZONE, 'HH:mm')
              });
            }
            return hasConflict;
          })
        });

        // Check if the slot start time conflicts with any events in this bay
        return !bayEvents.some(event => {
          const eventStart = new Date(event.start?.dateTime || '');
          const eventEnd = new Date(event.end?.dateTime || '');
          const slotStartTime = slotStart.getTime();
          const eventStartTime = eventStart.getTime();
          const eventEndTime = eventEnd.getTime();
          return slotStartTime >= eventStartTime && slotStartTime < eventEndTime;
        });
      });

      // If any bay is available, add the slot
      if (availableBays.length > 0) {
        // Calculate available hours for each bay and take the maximum
        const bayHours = availableBays.map(bay => {
          const bayEvents = allEvents.filter(event =>
            event.organizer?.email === AVAILABILITY_CALENDARS[bay as keyof typeof AVAILABILITY_CALENDARS]
          );

          // Find the next event in this bay
          const nextEvent = bayEvents.find(event => {
            const eventStart = new Date(event.start?.dateTime || '');
            return eventStart > slotStart;
          });

          if (nextEvent) {
            const eventStart = new Date(nextEvent.start?.dateTime || '');
            const hoursUntilEvent = Math.floor((eventStart.getTime() - slotStart.getTime()) / (1000 * 60 * 60));
            return Math.min(maxAvailableHours, hoursUntilEvent);
          }
          
          return maxAvailableHours; // No upcoming events in this bay
        });

        // Take the maximum hours available in any bay
        const actualMaxHours = Math.max(...bayHours);

        // Debug log the slot calculation
        debug.log(`Slot calculation for ${timeStr}:`, {
          availableBays,
          bayHours,
          actualMaxHours
        });

        // Only add the slot if there's at least 1 hour available
        if (actualMaxHours >= 1) {
          slots.push({
            startTime: timeStr,
            endTime: formatInTimeZone(addHours(slotStart, actualMaxHours), TIMEZONE, 'HH:mm'),
            maxHours: actualMaxHours,
            period: getTimePeriod(hour)
          });
        }
      }
    }
    processingTime = performance.now() - processingStart;

    const totalTime = performance.now() - startTime;
    console.log('Availability API Performance:', {
      totalTime: `${totalTime.toFixed(2)}ms`,
      authTime: `${authTime.toFixed(2)}ms`,
      googleTime: `${googleTime.toFixed(2)}ms`,
      processingTime: `${processingTime.toFixed(2)}ms`,
      cacheHit
    });

    return NextResponse.json({ slots });
  } catch (error) {
    const totalTime = performance.now() - startTime;
    console.error('Error fetching availability:', {
      error,
      totalTime: `${totalTime.toFixed(2)}ms`,
      authTime: `${authTime.toFixed(2)}ms`,
      googleTime: `${googleTime.toFixed(2)}ms`,
      processingTime: `${processingTime.toFixed(2)}ms`,
      cacheHit
    });
    return NextResponse.json(
      { error: 'Failed to fetch availability' },
      { status: 500 }
    );
  }
} 