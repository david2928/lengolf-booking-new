const TRANSITION_DATE = '2026-04-01';
const NEW_OPENING_HOUR = 9;
const OLD_OPENING_HOUR = 10;

/**
 * Returns the opening hour for a given date.
 * Before April 1 2026: 10am. On/after April 1 2026: 9am.
 */
export function getOpeningHour(date: string): number {
  return date >= TRANSITION_DATE ? NEW_OPENING_HOUR : OLD_OPENING_HOUR;
}
