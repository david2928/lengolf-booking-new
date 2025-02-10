import { NextResponse } from 'next/server';
import { format, parse, addHours, startOfDay, endOfDay } from 'date-fns';
import { zonedTimeToUtc, formatInTimeZone, utcToZonedTime } from 'date-fns-tz';
import { calendar, AVAILABILITY_CALENDARS } from '@/lib/googleApiConfig';
import { createClient } from '@/utils/supabase/server';
import { performance } from 'perf_hooks';
import { calendarCache, authCache, getCacheKey, updateCalendarCache } from '@/lib/cache';
import { debug } from '@/lib/debug';
import { differenceInHours } from 'date-fns';

const OPENING_HOUR = 10; // 10:00 AM
const CLOSING_HOUR = 23; // 11:00 PM
const MAX_HOURS = 5;
const TIMEZONE = 'Asia/Bangkok';

// Helper: determine period based on starting hour
function getTimePeriod(hour: number): 'morning' | 'afternoon' | 'evening' {
  if (hour < 13) return 'morning';
  if (hour < 17) return 'afternoon';
  return 'evening';
}

// Helper: format a date in Bangkok time
function formatBangkokTime(date: Date | string, fmt: string): string {
  return formatInTimeZone(new Date(date), TIMEZONE, fmt);
}

export async function POST(request: Request) {
  const startTime = performance.now();
  let authTime = 0, googleTime = 0, processingTime = 0;
  let cacheHit = { auth: false, calendar: false };

  try {
    // 1. Authenticate via Supabase
    const authStart = performance.now();
    const supabase = await createClient();
    const { data: { user }, error: sessionError } = await supabase.auth.getUser();
    if (sessionError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const authCacheKey = getCacheKey.auth(user.id);
    if (!authCache.get(authCacheKey)) {
      authCache.set(authCacheKey, true);
    } else {
      cacheHit.auth = true;
    }
    authTime = performance.now() - authStart;

    // 2. Parse incoming JSON – expect "date" (e.g. "2025-02-11") and "currentTimeInBangkok"
    const { date, currentTimeInBangkok } = await request.json();

    // Parse the date string (assuming the string represents the booking day in Bangkok) at "00:00"
    const parsedDate = parse(date + ' 00:00', 'yyyy-MM-dd HH:mm', new Date());
    // Convert that parsed date to UTC as if it were in Bangkok
    const bangkokStartOfDay = zonedTimeToUtc(parsedDate, TIMEZONE);
    // Similarly, compute the end of day (using endOfDay)
    const bangkokEndOfDay = zonedTimeToUtc(endOfDay(parsedDate), TIMEZONE);

    // 3. Use the client-provided current time (which is already in Bangkok time)
    const currentDate = new Date(currentTimeInBangkok);
    const currentHourInZone = parseInt(formatBangkokTime(currentDate, 'HH'), 10);
    // Determine if the selected booking day is today (in Bangkok time)
    const isToday = formatBangkokTime(bangkokStartOfDay, 'yyyy-MM-dd') === formatBangkokTime(currentDate, 'yyyy-MM-dd');
    // If booking for today, only show slots starting from the next hour; otherwise use the opening hour.
    const startHour = isToday ? Math.max(OPENING_HOUR, currentHourInZone + 1) : OPENING_HOUR;

    debug.log('Time checks:', {
      selectedDate: formatBangkokTime(bangkokStartOfDay, 'yyyy-MM-dd HH:mm:ssXXX'),
      currentDate: formatBangkokTime(currentDate, 'yyyy-MM-dd HH:mm:ssXXX'),
      currentHourInZone,
      isToday,
      startHour,
      openingHour: OPENING_HOUR,
      closingHour: CLOSING_HOUR,
    });

    // 4. Fetch events for the booking day
    const googleStart = performance.now();
    let allEvents: any[] = [];
    const calendarCacheKey = getCacheKey.calendar(formatBangkokTime(bangkokStartOfDay, 'yyyy-MM-dd'));
    const cachedEvents = calendarCache.get<any[]>(calendarCacheKey);
    if (cachedEvents) {
      allEvents = cachedEvents;
      cacheHit.calendar = true;
    } else {
      // Optionally trigger cache update for future days
      updateCalendarCache().catch(console.error);
      const timeMin = formatInTimeZone(bangkokStartOfDay, TIMEZONE, "yyyy-MM-dd'T'HH:mm:ssxxx");
      const timeMax = formatInTimeZone(bangkokEndOfDay, TIMEZONE, "yyyy-MM-dd'T'HH:mm:ssxxx");
      const bayEvents = await Promise.all(
        Object.values(AVAILABILITY_CALENDARS).map(calendarId =>
          calendar.events.list({
            calendarId,
            timeMin,
            timeMax,
            singleEvents: true,
            orderBy: 'startTime',
            timeZone: TIMEZONE,
          })
        )
      );
      allEvents = bayEvents.flatMap(response => response.data.items || []);
    }
    // Log each event (for debugging)
    allEvents.forEach((event, index) => {
      const eventStart = new Date(event.start?.dateTime || '');
      const eventEnd = new Date(event.end?.dateTime || '');
      debug.log(`Event ${index + 1}:`, {
        calendar: event.organizer?.email,
        summary: event.summary,
        start: formatBangkokTime(eventStart, "yyyy-MM-dd'T'HH:mm:ssXXX"),
        end: formatBangkokTime(eventEnd, "yyyy-MM-dd'T'HH:mm:ssXXX"),
      });
    });
    googleTime = performance.now() - googleStart;

    // 5. Build available time slots
    const processingStart = performance.now();
    const slots = [];
    debug.log('Hour boundaries:', {
      startHour,
      OPENING_HOUR,
      CLOSING_HOUR,
      currentHourInZone,
    });

    // For each hour in the booking day from startHour to closing
    for (let hour = startHour; hour < CLOSING_HOUR; hour++) {
      // Build the slot start time by combining the date portion of bangkokStartOfDay with the given hour.
      const dateStr = formatBangkokTime(bangkokStartOfDay, 'yyyy-MM-dd');
      const slotParsed = parse(`${dateStr} ${hour}:00`, 'yyyy-MM-dd HH:mm', new Date());
      const slotStart = zonedTimeToUtc(slotParsed, TIMEZONE);
      const timeStr = formatBangkokTime(slotStart, 'HH:mm');

      debug.log(`Processing slot for hour ${hour}:`, {
        slotStartTime: formatBangkokTime(slotStart, 'yyyy-MM-dd HH:mm:ssXXX'),
        currentTime: formatBangkokTime(currentDate, 'yyyy-MM-dd HH:mm:ssXXX'),
        isToday,
        isAfterCurrent: slotStart.getTime() > currentDate.getTime(),
        hour,
        OPENING_HOUR,
        CLOSING_HOUR,
      });
      if (slotStart.getTime() <= currentDate.getTime()) {
        debug.log(`Skipping slot ${timeStr} as it is in the past`);
        continue;
      }
      const hoursUntilClose = CLOSING_HOUR - hour;
      const maxAvailableHours = Math.min(MAX_HOURS, hoursUntilClose);
      debug.log(`Calculating hours for slot ${timeStr}:`, {
        hoursUntilClose,
        maxAvailableHours,
        MAX_HOURS,
      });
      // Determine which bays are available at this slot
      const availableBays = Object.keys(AVAILABILITY_CALENDARS).filter(bay => {
        // Get events for this specific bay only
        const bayEvents = allEvents.filter(event => 
          event.organizer?.email === AVAILABILITY_CALENDARS[bay as keyof typeof AVAILABILITY_CALENDARS]
        );

        // Check for conflicts with any event in this bay
        return !bayEvents.some(event => {
          const eventStart = new Date(event.start?.dateTime || '');
          const eventEnd = new Date(event.end?.dateTime || '');
          const slotEnd = addHours(slotStart, 1); // We need at least 1 hour available

          // A bay is considered unavailable if:
          // 1. The slot starts during an event
          const slotStartsDuringEvent = slotStart >= eventStart && slotStart < eventEnd;
          // 2. The slot ends during an event
          const slotEndsDuringEvent = slotEnd > eventStart && slotEnd <= eventEnd;
          // 3. The event completely contains the slot
          const eventContainsSlot = eventStart <= slotStart && eventEnd >= slotEnd;
          // 4. The slot starts less than 15 minutes before an event
          const gapBeforeEvent = eventStart.getTime() - slotStart.getTime();
          const hasSmallGap = gapBeforeEvent > 0 && gapBeforeEvent < 15 * 60 * 1000;
          // 5. The slot overlaps with an event
          const slotOverlapsEvent = slotStart < eventEnd && slotEnd > eventStart;
          // 6. The event starts exactly at the slot start
          const eventStartsAtSlot = eventStart.getTime() === slotStart.getTime();
          // 7. The event ends exactly at the slot start (this makes the slot available)
          const eventEndsAtSlotStart = eventEnd.getTime() === slotStart.getTime();

          const hasConflict = !eventEndsAtSlotStart && (
            slotStartsDuringEvent || 
            slotEndsDuringEvent || 
            eventContainsSlot || 
            hasSmallGap || 
            slotOverlapsEvent || 
            eventStartsAtSlot
          );

          if (hasConflict) {
            debug.log(`Found conflict for bay ${bay}:`, {
              type: slotStartsDuringEvent ? 'slot starts during event' :
                    slotEndsDuringEvent ? 'slot ends during event' :
                    eventContainsSlot ? 'event contains slot' :
                    slotOverlapsEvent ? 'slot overlaps event' :
                    eventStartsAtSlot ? 'event starts at slot start' :
                    'small gap before event',
              event: event.summary,
              eventStart: formatBangkokTime(eventStart, 'HH:mm'),
              eventEnd: formatBangkokTime(eventEnd, 'HH:mm'),
              slotStart: formatBangkokTime(slotStart, 'HH:mm'),
              slotEnd: formatBangkokTime(slotEnd, 'HH:mm'),
              gapMinutes: hasSmallGap ? Math.floor(gapBeforeEvent / (60 * 1000)) : null,
              eventEndsAtSlotStart,
            });
          }

          return hasConflict;
        });
      });

      if (availableBays.length > 0) {
        const bayHours = availableBays.map(bay => {
          // Get events for this specific bay only
          const bayEvents = allEvents.filter(event => 
            event.organizer?.email === AVAILABILITY_CALENDARS[bay as keyof typeof AVAILABILITY_CALENDARS]
          );

          // Find the next event that starts after this slot
          const nextEvent = bayEvents.find(event => {
            const eventStart = new Date(event.start?.dateTime || '');
            return eventStart > slotStart;
          });

          // Find any events that overlap with this slot
          const overlappingEvents = bayEvents.filter(event => {
            const eventStart = new Date(event.start?.dateTime || '');
            const eventEnd = new Date(event.end?.dateTime || '');
            const slotEnd = addHours(slotStart, 1);
            return slotStart < eventEnd && slotEnd > eventStart;
          });

          // If there are overlapping events, this bay is not available
          if (overlappingEvents.length > 0) {
            return 0;
          }

          if (nextEvent) {
            const eventStart = new Date(nextEvent.start?.dateTime || '');
            const hoursUntilEvent = differenceInHours(eventStart, slotStart);
            debug.log(`Found next event for bay ${bay}:`, {
              event: nextEvent.summary,
              eventStart: formatBangkokTime(eventStart, 'HH:mm'),
              slotStart: formatBangkokTime(slotStart, 'HH:mm'),
              hoursUntilEvent,
            });
            // Ensure we return at least 1 hour and at most maxAvailableHours
            const availableHours = Math.min(maxAvailableHours, Math.max(1, hoursUntilEvent));
            debug.log(`Available hours for bay ${bay}:`, {
              hoursUntilEvent,
              maxAvailableHours,
              availableHours,
            });
            return availableHours;
          }

          // If there are no events after this slot, check if there are any events at all
          const hasEvents = bayEvents.length > 0;
          if (!hasEvents) {
            // If there are no events at all, the bay is available for the maximum time
            return maxAvailableHours;
          }

          // Find the last event for this bay
          const lastEvent = bayEvents[bayEvents.length - 1];
          const lastEventEnd = new Date(lastEvent.end?.dateTime || '');
          if (slotStart >= lastEventEnd) {
            // If the slot starts after the last event, the bay is available for the maximum time
            return maxAvailableHours;
          }

          return 0; // Bay is not available
        });

        // Only add the slot if at least one bay has more than 0 hours available
        const actualMaxHours = Math.max(...bayHours);
        debug.log(`Slot calculation for ${timeStr}:`, {
          availableBays,
          bayHours,
          actualMaxHours,
        });
        if (actualMaxHours > 0) {
          slots.push({
            startTime: timeStr,
            endTime: formatBangkokTime(addHours(slotStart, actualMaxHours), 'HH:mm'),
            maxHours: actualMaxHours,
            period: getTimePeriod(hour),
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
      cacheHit,
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
      cacheHit,
    });
    return NextResponse.json({ error: 'Failed to fetch availability' }, { status: 500 });
  }
} 