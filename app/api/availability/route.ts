import { NextResponse } from 'next/server';
import { format, parse, addHours, setHours, setMinutes, setSeconds } from 'date-fns';
import { calendar, AVAILABILITY_CALENDARS } from '@/lib/googleApiConfig';
import { createClient } from '@/utils/supabase/server';
import { performance } from 'perf_hooks';
import { calendarCache, authCache, getCacheKey, updateCalendarCache } from '@/lib/cache';

const OPENING_HOUR = 10; // 10:00 AM
const CLOSING_HOUR = 23; // 11:00 PM (last booking can be until 10:00 PM)
const MAX_HOURS = 5;

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
    const selectedDate = parse(date, 'yyyy-MM-dd', new Date());
    const currentDate = new Date();
    const isToday = selectedDate.toDateString() === currentDate.toDateString();
    
    // For today, start from the next hour
    const startHour = isToday ? Math.max(OPENING_HOUR, currentDate.getHours() + 1) : OPENING_HOUR;
    
    // Get events from all bays with caching
    const googleStart = performance.now();
    let allEvents: any[] = [];

    // Check calendar cache
    const calendarCacheKey = getCacheKey.calendar(format(selectedDate, 'yyyy-MM-dd'));
    const cachedEvents = calendarCache.get<any[]>(calendarCacheKey);

    if (cachedEvents) {
      allEvents = cachedEvents;
      cacheHit.calendar = true;
    } else {
      // If cache miss, trigger a cache update for the next 3 days
      updateCalendarCache().catch(console.error);
      
      // Meanwhile, fetch the data directly for this request
      const startOfDay = setSeconds(setMinutes(setHours(selectedDate, 0), 0), 0);
      const endOfDay = setSeconds(setMinutes(setHours(selectedDate, 23), 59), 59);
      
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
      
      allEvents = bayEvents.flatMap(response => response.data.items || []);
    }
    
    googleTime = performance.now() - googleStart;

    // Process slots
    const processingStart = performance.now();

    // Generate all possible time slots
    const slots = [];
    for (let hour = startHour; hour <= CLOSING_HOUR - 1; hour++) {
      // Create the slot start time for the current hour
      const slotStart = setSeconds(setMinutes(setHours(selectedDate, hour), 0), 0);
      const timeStr = format(slotStart, 'HH:mm');

      // Calculate maximum available hours
      const hoursUntilClose = CLOSING_HOUR - hour;
      let maxAvailableHours = Math.min(MAX_HOURS, hoursUntilClose);

      // Check each bay for availability
      const availableBays = Object.keys(AVAILABILITY_CALENDARS).filter(bay => {
        const bayEvents = allEvents.filter(event =>
          event.organizer?.email === AVAILABILITY_CALENDARS[bay as keyof typeof AVAILABILITY_CALENDARS]
        );

        // Check if the slot start time conflicts with any events in this bay
        return !bayEvents.some(event => {
          const eventStart = new Date(event.start?.dateTime || '');
          const eventEnd = new Date(event.end?.dateTime || '');

          // Only check if the start time falls within an event
          return slotStart >= eventStart && slotStart < eventEnd;
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

        // Only add the slot if there's at least 1 hour available
        if (actualMaxHours >= 1) {
          slots.push({
            startTime: timeStr,
            endTime: format(addHours(slotStart, actualMaxHours), 'HH:mm'),
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