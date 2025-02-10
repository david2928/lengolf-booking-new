import { formatInTimeZone, zonedTimeToUtc } from 'date-fns-tz';

export const TIMEZONE = 'Asia/Bangkok';

/**
 * Gets the current time in Bangkok timezone
 * @returns ISO string of current time in Bangkok timezone
 */
export function getCurrentBangkokTime(): string {
  // Get current time in Bangkok
  const bangkokTime = zonedTimeToUtc(new Date(), TIMEZONE);
  // Format it with timezone info
  return formatInTimeZone(bangkokTime, TIMEZONE, "yyyy-MM-dd'T'HH:mm:ssXXX");
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