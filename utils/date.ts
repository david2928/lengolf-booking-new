import { formatInTimeZone, zonedTimeToUtc, utcToZonedTime } from 'date-fns-tz';

export const TIMEZONE = 'Asia/Bangkok';

/**
 * Gets the current time in Bangkok timezone
 * @returns ISO string of current time in Bangkok timezone
 */
export function getCurrentBangkokTime(): Date {
  return utcToZonedTime(new Date(), TIMEZONE);
}

/**
 * Formats a date in Bangkok timezone
 * @param date Date to format
 * @param format Format string to use
 * @returns Formatted date string in Bangkok timezone
 */
export function formatBangkokTime(date: Date | string, format: string): string {
  return formatInTimeZone(new Date(date), TIMEZONE, format);
}

/**
 * Converts a date to Bangkok timezone
 * @param date Date to convert
 * @returns Date object in Bangkok timezone
 */
export function toBangkokTime(date: Date | string): Date {
  return zonedTimeToUtc(new Date(date), TIMEZONE);
}

/**
 * The Bangkok calendar date of an instant, as `yyyy-MM-dd`.
 *
 * Use this anywhere you would reach for `new Date().toISOString().split('T')[0]`.
 * That idiom truncates in **UTC**, so on Vercel — whose runtime is UTC — every
 * Bangkok wall-clock time between 00:00 and 07:00 yields *yesterday*. It is
 * invisible on a Bangkok dev machine, which is why this is a helper and not a
 * comment.
 *
 * @param date Instant to read the Bangkok date off. Defaults to now.
 */
export function getBangkokDateString(date: Date = new Date()): string {
  return formatInTimeZone(date, TIMEZONE, 'yyyy-MM-dd');
}

/** An ISO string is already an absolute instant if it carries `Z` or `±HH:MM`. */
const HAS_EXPLICIT_OFFSET = /(?:Z|[+-]\d{2}:?\d{2})$/;

/**
 * Builds a real instant from Asia/Bangkok wall-clock parts.
 *
 * `new Date('2026-07-30T00:00:00')` and `new Date(\`${date}T${time}\`)` parse in
 * the **runtime's** zone, so the same string is a different instant in a Bangkok
 * browser than in a Tokyo one — one day / several hours early for anyone east
 * of +07. Bangkok has no DST, so anchoring at a fixed `+07:00` is exact and is
 * the only unconditionally correct form.
 *
 * @param dateISO `yyyy-MM-dd`. A longer ISO string is accepted — only the date
 *   part is used, since DB reads occasionally hand back full timestamps. An
 *   input that already carries an explicit offset or `Z` is returned as-is:
 *   it is absolute already, and re-anchoring it would move it.
 * @param time `HH:mm` or `HH:mm:ss` Bangkok wall-clock. Defaults to midnight.
 */
export function parseBangkokDate(dateISO: string, time = '00:00'): Date {
  if (HAS_EXPLICIT_OFFSET.test(dateISO)) {
    return new Date(dateISO);
  }

  const datePart = dateISO.slice(0, 10);
  const [hh = '00', mm = '00', ss = '00'] = time.split(':');
  const pad = (v: string) => v.padStart(2, '0');

  return new Date(`${datePart}T${pad(hh)}:${pad(mm)}:${pad(ss)}+07:00`);
}
