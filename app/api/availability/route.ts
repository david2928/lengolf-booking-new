import { NextResponse } from 'next/server';
import { format, parse, addHours, startOfDay, endOfDay } from 'date-fns';
import { zonedTimeToUtc, formatInTimeZone } from 'date-fns-tz';
import { calendar, AVAILABILITY_CALENDARS } from '@/lib/googleApiConfig';
import { getToken } from 'next-auth/jwt';
import type { NextRequest } from 'next/server';
import { performance } from 'perf_hooks';
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
  const startTime = performance.now();
  let authTime = 0, googleTime = 0, processingTime = 0;
  let cacheHit = { auth: false, calendar: false };

  try {
    // 1. Authenticate via NextAuth
    const authStart = performance.now();
    const token = await getToken({ req: request as any });
    if (!token) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const authCacheKey = getCacheKey.auth(token.sub!);
    if (!authCache.get(authCacheKey)) {
      authCache.set(authCacheKey, true);
    } else {
      cacheHit.auth = true;
    }
    authTime = performance.now() - authStart;

    // 2. Parse incoming JSON
    const { date, currentTimeInBangkok } = await request.json();
    const parsedDate = parse(date + ' 00:00', 'yyyy-MM-dd HH:mm', new Date());
    const bangkokStartOfDay = zonedTimeToUtc(parsedDate, TIMEZONE);
    const bangkokEndOfDay = zonedTimeToUtc(endOfDay(parsedDate), TIMEZONE);
    const currentDate = new Date(currentTimeInBangkok);
    const currentHourInZone = parseInt(formatBangkokTime(currentDate, 'HH'), 10);
    const isToday = formatBangkokTime(bangkokStartOfDay, 'yyyy-MM-dd') === formatBangkokTime(currentDate, 'yyyy-MM-dd');
    const startHour = isToday ? Math.max(OPENING_HOUR, currentHourInZone + 1) : OPENING_HOUR;

    // 3. Fetch events for the booking day
    const googleStart = performance.now();
    let allEvents: any[] = [];
    const calendarCacheKey = getCacheKey.calendar(formatBangkokTime(bangkokStartOfDay, 'yyyy-MM-dd'));
    const cachedEvents = calendarCache.get<any[]>(calendarCacheKey);
    if (cachedEvents) {
      allEvents = cachedEvents;
      cacheHit.calendar = true;
    } else {
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
    googleTime = performance.now() - googleStart;

    // 4. Build available time slots
    const processingStart = performance.now();
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
    console.error('Error fetching availability:', error);
    return NextResponse.json({ error: 'Failed to fetch availability' }, { status: 500 });
  }
} 