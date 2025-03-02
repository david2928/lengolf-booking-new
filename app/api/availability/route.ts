import { NextResponse } from 'next/server';
import { format, parse, addHours, startOfDay, endOfDay } from 'date-fns';
import { zonedTimeToUtc, formatInTimeZone } from 'date-fns-tz';
import { calendar, AVAILABILITY_CALENDARS } from '@/lib/googleApiConfig';
import { getToken } from 'next-auth/jwt';
import type { NextRequest } from 'next/server';
import { calendarCache, authCache, getCacheKey, updateCalendarCache } from '@/lib/cache';
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

export async function POST(request: NextRequest) {
  try {
    // 1. Authenticate via NextAuth
    const token = await getToken({ req: request as any });
    if (!token) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const authCacheKey = getCacheKey.auth(token.sub!);
    if (!authCache.get(authCacheKey)) {
      authCache.set(authCacheKey, true);
    }

    // 2. Parse incoming JSON
    const body = await request.json();
    const { date, currentTimeInBangkok } = body;
    if (!date || !currentTimeInBangkok) {
      return NextResponse.json({ error: 'Invalid request parameters' }, { status: 400 });
    }
    
    const parsedDate = parse(date + ' 00:00', 'yyyy-MM-dd HH:mm', new Date());
    const bangkokStartOfDay = zonedTimeToUtc(parsedDate, TIMEZONE);
    const bangkokEndOfDay = zonedTimeToUtc(endOfDay(parsedDate), TIMEZONE);
    const currentDate = new Date(currentTimeInBangkok);
    const currentHourInZone = parseInt(formatBangkokTime(currentDate, 'HH'), 10);
    const isToday = formatBangkokTime(bangkokStartOfDay, 'yyyy-MM-dd') === formatBangkokTime(currentDate, 'yyyy-MM-dd');
    const startHour = isToday ? Math.max(OPENING_HOUR, currentHourInZone + 1) : OPENING_HOUR;

    // 3. Fetch events for the booking day
    let allEvents: any[] = [];
    const calendarCacheKey = getCacheKey.calendar(formatBangkokTime(bangkokStartOfDay, 'yyyy-MM-dd'));
    
    const cachedEvents = calendarCache.get<any[]>(calendarCacheKey);
    
    if (cachedEvents) {
      allEvents = cachedEvents;
    } else {
      const timeMin = formatInTimeZone(bangkokStartOfDay, TIMEZONE, "yyyy-MM-dd'T'HH:mm:ssxxx");
      const timeMax = formatInTimeZone(bangkokEndOfDay, TIMEZONE, "yyyy-MM-dd'T'HH:mm:ssxxx");

      try {
        const bayEvents = await Promise.all(
          Object.entries(AVAILABILITY_CALENDARS).map(async ([name, calendarId]) => {
            try {
              const response = await calendar.events.list({
                calendarId,
                timeMin,
                timeMax,
                singleEvents: true,
                orderBy: 'startTime',
                timeZone: TIMEZONE,
              });
              return response;
            } catch (error: any) {
              console.error(`Error fetching events for ${name}:`, {
                calendarId: calendarId.substring(0, 10) + '...',
                error: error.message,
                status: error.status
              });
              throw error;
            }
          })
        );
        
        allEvents = bayEvents.flatMap(response => response.data.items || []);
        
        try {
          calendarCache.set(calendarCacheKey, allEvents);
        } catch (cacheError) {
          console.error('Failed to update calendar cache:', cacheError);
        }
      } catch (error: any) {
        console.error('Calendar API error:', {
          message: error.message,
          status: error.status
        });
        throw error;
      }
    }

    // 4. Build available time slots
    const slots = [];

    for (let hour = startHour; hour < CLOSING_HOUR; hour++) {
      const dateStr = formatBangkokTime(bangkokStartOfDay, 'yyyy-MM-dd');
      const slotParsed = parse(`${dateStr} ${hour}:00`, 'yyyy-MM-dd HH:mm', new Date());
      const slotStart = zonedTimeToUtc(slotParsed, TIMEZONE);
      const timeStr = formatBangkokTime(slotStart, 'HH:mm');

      if (slotStart.getTime() <= currentDate.getTime()) {
        continue;
      }

      const hoursUntilClose = CLOSING_HOUR - hour;
      const maxAvailableHours = Math.min(MAX_HOURS, hoursUntilClose);

      const availableBays = Object.keys(AVAILABILITY_CALENDARS).filter(bay => {
        const bayEvents = allEvents.filter(event => 
          event.organizer?.email === AVAILABILITY_CALENDARS[bay as keyof typeof AVAILABILITY_CALENDARS]
        );

        return !bayEvents.some(event => {
          const eventStart = new Date(event.start?.dateTime || '');
          const eventEnd = new Date(event.end?.dateTime || '');
          const slotEnd = addHours(slotStart, 1);

          const slotStartsDuringEvent = slotStart >= eventStart && slotStart < eventEnd;
          const slotEndsDuringEvent = slotEnd > eventStart && slotEnd <= eventEnd;
          const eventContainsSlot = eventStart <= slotStart && eventEnd >= slotEnd;
          const gapBeforeEvent = eventStart.getTime() - slotStart.getTime();
          const hasSmallGap = gapBeforeEvent > 0 && gapBeforeEvent < 15 * 60 * 1000;
          const slotOverlapsEvent = slotStart < eventEnd && slotEnd > eventStart;
          const eventStartsAtSlot = eventStart.getTime() === slotStart.getTime();
          const eventEndsAtSlotStart = eventEnd.getTime() === slotStart.getTime();

          return !eventEndsAtSlotStart && (
            slotStartsDuringEvent || 
            slotEndsDuringEvent || 
            eventContainsSlot || 
            hasSmallGap || 
            slotOverlapsEvent || 
            eventStartsAtSlot
          );
        });
      });

      if (availableBays.length > 0) {
        const bayHours = availableBays.map(bay => {
          const bayEvents = allEvents.filter(event => 
            event.organizer?.email === AVAILABILITY_CALENDARS[bay as keyof typeof AVAILABILITY_CALENDARS]
          );

          const nextEvent = bayEvents.find(event => {
            const eventStart = new Date(event.start?.dateTime || '');
            return eventStart > slotStart;
          });

          const overlappingEvents = bayEvents.filter(event => {
            const eventStart = new Date(event.start?.dateTime || '');
            const eventEnd = new Date(event.end?.dateTime || '');
            const slotEnd = addHours(slotStart, 1);
            return slotStart < eventEnd && slotEnd > eventStart;
          });

          if (overlappingEvents.length > 0) {
            return 0;
          }

          if (nextEvent) {
            const eventStart = new Date(nextEvent.start?.dateTime || '');
            const hoursUntilEvent = differenceInHours(eventStart, slotStart);
            return Math.min(maxAvailableHours, Math.max(1, hoursUntilEvent));
          }

          const hasEvents = bayEvents.length > 0;
          if (!hasEvents) {
            return maxAvailableHours;
          }

          const lastEvent = bayEvents[bayEvents.length - 1];
          const lastEventEnd = new Date(lastEvent.end?.dateTime || '');
          if (slotStart >= lastEventEnd) {
            return maxAvailableHours;
          }

          return 0;
        });

        const actualMaxHours = Math.max(...bayHours);
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

    return NextResponse.json({ slots });
  } catch (error) {
    console.error('Error in availability endpoint:', error instanceof Error ? error.message : error);
    return NextResponse.json({ error: 'Failed to fetch availability' }, { status: 500 });
  }
} 