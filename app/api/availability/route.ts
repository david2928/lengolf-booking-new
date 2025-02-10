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

// Helper function to convert date to Bangkok time
function toBangkokTime(date: Date | string): Date {
  return utcToZonedTime(new Date(date), TIMEZONE);
}

// Helper function to format Bangkok time
function formatBangkokTime(date: Date | string, format: string): string {
  return formatInTimeZone(new Date(date), TIMEZONE, format);
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
    
    // Parse the date string in Bangkok timezone
    const selectedDate = zonedTimeToUtc(
      parse(date + ' 00:00', 'yyyy-MM-dd HH:mm', new Date()),
      TIMEZONE
    );
    
    // Get current time in Bangkok
    const currentDate = utcToZonedTime(new Date(), TIMEZONE);
    const currentHourInZone = parseInt(formatBangkokTime(currentDate, 'HH'));
    
    // Compare dates in Bangkok timezone
    const isToday = formatBangkokTime(selectedDate, 'yyyy-MM-dd') === 
                   formatBangkokTime(currentDate, 'yyyy-MM-dd');
    
    // For today, start from the next hour
    const startHour = isToday ? Math.max(OPENING_HOUR, currentHourInZone + 1) : OPENING_HOUR;

    debug.log('Time checks:', {
      selectedDate: formatBangkokTime(selectedDate, 'yyyy-MM-dd HH:mm:ssXXX'),
      currentDate: formatBangkokTime(currentDate, 'yyyy-MM-dd HH:mm:ssXXX'),
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
    const calendarCacheKey = getCacheKey.calendar(formatBangkokTime(selectedDate, 'yyyy-MM-dd'));
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
      const eventStart = utcToZonedTime(new Date(event.start?.dateTime || ''), TIMEZONE);
      const eventEnd = utcToZonedTime(new Date(event.end?.dateTime || ''), TIMEZONE);
      debug.log(`Event ${index + 1}:`, {
        calendar: event.organizer?.email,
        summary: event.summary,
        start: formatInTimeZone(eventStart, TIMEZONE, "yyyy-MM-dd'T'HH:mm:ssXXX"),
        end: formatInTimeZone(eventEnd, TIMEZONE, "yyyy-MM-dd'T'HH:mm:ssXXX")
      });
    });
    
    googleTime = performance.now() - googleStart;

    // Process slots
    const processingStart = performance.now();

    // Generate all possible time slots
    const slots = [];
    
    debug.log('Hour boundaries:', {
      startHour,
      OPENING_HOUR,
      CLOSING_HOUR,
      currentHourInZone
    });

    // Ensure we only process slots within opening hours
    for (let hour = startHour; hour < CLOSING_HOUR; hour++) {
      // Validate hour is within bounds
      if (hour < OPENING_HOUR || hour >= CLOSING_HOUR) {
        debug.log(`Skipping hour ${hour} as it's outside operating hours (${OPENING_HOUR}:00-${CLOSING_HOUR}:00)`);
        continue;
      }

      // Create the slot start time
      const slotStart = zonedTimeToUtc(
        parse(`${formatBangkokTime(selectedDate, 'yyyy-MM-dd')} ${hour}:00`, 'yyyy-MM-dd HH:mm', new Date()),
        TIMEZONE
      );
      const timeStr = formatBangkokTime(slotStart, 'HH:mm');

      debug.log(`Processing slot for hour ${hour}:`, {
        slotStartTime: formatBangkokTime(slotStart, 'yyyy-MM-dd HH:mm:ssXXX'),
        currentTime: formatBangkokTime(currentDate, 'yyyy-MM-dd HH:mm:ssXXX'),
        isToday,
        isAfterCurrent: slotStart.getTime() > currentDate.getTime(),
        hour,
        OPENING_HOUR,
        CLOSING_HOUR
      });

      // Skip slots that are in the past
      if (slotStart.getTime() <= currentDate.getTime()) {
        debug.log(`Skipping slot ${timeStr} as it is in the past`);
        continue;
      }

      // Calculate maximum available hours, ensuring we don't go past closing time
      const hoursUntilClose = CLOSING_HOUR - hour;
      let maxAvailableHours = Math.min(MAX_HOURS, hoursUntilClose);

      debug.log(`Calculating hours for slot ${timeStr}:`, {
        hoursUntilClose,
        maxAvailableHours,
        MAX_HOURS
      });

      // Check each bay for availability
      const availableBays = Object.keys(AVAILABILITY_CALENDARS).filter(bay => {
        const bayEvents = allEvents.filter(event => {
          const eventStart = toBangkokTime(event.start?.dateTime || '');
          return event.organizer?.email === AVAILABILITY_CALENDARS[bay as keyof typeof AVAILABILITY_CALENDARS] &&
                 formatBangkokTime(eventStart, 'yyyy-MM-dd') === formatBangkokTime(selectedDate, 'yyyy-MM-dd');
        });

        // Check for conflicts
        return !bayEvents.some(event => {
          const eventStart = toBangkokTime(event.start?.dateTime || '');
          const eventEnd = toBangkokTime(event.end?.dateTime || '');
          const slotStartInZone = toBangkokTime(slotStart);
          
          debug.log(`Checking conflict for bay ${bay} at ${formatBangkokTime(slotStartInZone, 'HH:mm')}:`, {
            event: event.summary,
            eventStart: formatBangkokTime(eventStart, 'HH:mm'),
            eventEnd: formatBangkokTime(eventEnd, 'HH:mm'),
            slotStart: formatBangkokTime(slotStartInZone, 'HH:mm')
          });
          
          const hasDirectConflict = slotStartInZone.getTime() >= eventStart.getTime() && 
                                  slotStartInZone.getTime() < eventEnd.getTime();
          
          const gapBeforeEvent = eventStart.getTime() - slotStartInZone.getTime();
          const hasSmallGap = gapBeforeEvent > 0 && gapBeforeEvent < 15 * 60 * 1000;
          
          if (hasDirectConflict || hasSmallGap) {
            debug.log(`Found conflict for bay ${bay}:`, {
              type: hasDirectConflict ? 'direct conflict' : 'small gap',
              event: event.summary,
              eventStart: formatBangkokTime(eventStart, 'HH:mm'),
              eventEnd: formatBangkokTime(eventEnd, 'HH:mm'),
              slotStart: formatBangkokTime(slotStartInZone, 'HH:mm'),
              gapMinutes: hasSmallGap ? Math.floor(gapBeforeEvent / (60 * 1000)) : null
            });
          }
          
          return hasDirectConflict || hasSmallGap;
        });
      });

      // If any bay is available, add the slot
      if (availableBays.length > 0) {
        // Calculate available hours for each bay and take the maximum
        const bayHours = availableBays.map(bay => {
          const bayEvents = allEvents.filter(event => {
            const eventStart = toBangkokTime(event.start?.dateTime || '');
            return event.organizer?.email === AVAILABILITY_CALENDARS[bay as keyof typeof AVAILABILITY_CALENDARS] &&
                   formatBangkokTime(eventStart, 'yyyy-MM-dd') === formatBangkokTime(selectedDate, 'yyyy-MM-dd');
          });

          // Find the next event in this bay
          const nextEvent = bayEvents.find(event => {
            const eventStart = toBangkokTime(event.start?.dateTime || '');
            const slotStartInZone = toBangkokTime(slotStart);
            return eventStart.getTime() > slotStartInZone.getTime();
          });

          if (nextEvent) {
            const eventStart = toBangkokTime(nextEvent.start?.dateTime || '');
            const slotStartInZone = toBangkokTime(slotStart);
            const hoursUntilEvent = Math.floor((eventStart.getTime() - slotStartInZone.getTime()) / (1000 * 60 * 60));
            
            debug.log(`Found next event for bay ${bay}:`, {
              event: nextEvent.summary,
              eventStart: formatBangkokTime(eventStart, 'HH:mm'),
              slotStart: formatBangkokTime(slotStartInZone, 'HH:mm'),
              hoursUntilEvent
            });
            
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