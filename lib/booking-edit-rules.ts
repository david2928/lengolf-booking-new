/**
 * Rules governing what a customer may change on their own booking.
 *
 * Shared by the server (`/api/vip/bookings/[id]/modify`, the LIFF booking-detail
 * route that computes `canEdit`) and by both edit UIs, so the button a customer
 * sees and the answer the endpoint gives can never disagree. Everything here is
 * pure — no I/O, no Supabase — precisely so it can be imported from a client
 * component.
 *
 * Editing is in place: the booking keeps its id, its history, and any credit or
 * package already attached to it. That is the whole point of the feature, and it
 * is why the guards below are stricter than the ones on create — a create that
 * lands on a bad slot inconveniences one person, an edit that lands on a bad
 * slot silently invalidates something already paid for.
 */

import { parseBangkokDate } from '@/utils/date';
import type { BayType } from './bayConfig';
import { getAILabBays, getBayTypeFromKey, getSocialBays } from './bayConfig';

/**
 * How long before the start time self-service editing closes.
 *
 * Owner-confirmed 2 Aug 2026: **zero**, matching the cancel rule. A customer who
 * can still cancel at 18:59 for a 19:00 booking would find it strange to be told
 * they cannot move it, and staff are notified on the LINE group either way.
 *
 * Kept as a constant rather than inlined because the operational answer may
 * change (a 2 h buffer was the alternative under discussion) and this is the one
 * place that would need to move.
 */
export const MIN_EDIT_NOTICE_HOURS = 0;

/** Longest `customer_notes` an edit will accept. */
export const MAX_CUSTOMER_NOTES_LENGTH = 500;

/** Guest counts offered on both surfaces. */
export const MIN_PEOPLE = 1;
export const MAX_PEOPLE = 5;

export type EditBlockedReason =
  | 'NOT_CONFIRMED'
  | 'COACHING_NOT_EDITABLE'
  | 'BOOKING_IN_PAST'
  | 'TOO_LATE_TO_EDIT';

export interface EditabilityInput {
  status: string | null | undefined;
  /** `yyyy-MM-dd`, Bangkok calendar date. */
  date: string | null | undefined;
  /** `HH:mm`, Bangkok wall clock. */
  start_time: string | null | undefined;
  booking_type: string | null | undefined;
  /** Defaults to now. Injected so tests can pin an instant. */
  now?: Date;
}

export interface Editability {
  canEdit: boolean;
  reason?: EditBlockedReason;
}

/**
 * Coaching bookings are not customer-editable.
 *
 * Bay availability is not coach availability: the coach may be teaching someone
 * else, or off that day, and none of that is visible to
 * `check_all_bays_availability`. LIFF already refuses to let customers *cancel*
 * a lesson for the same reason (`/api/liff/membership/booking/[id]`), so this
 * only extends an existing rule rather than inventing one.
 *
 * Substring match on purpose — the canonical form is `Coaching (Min)`, and a
 * bare `Coaching` is also reachable from older rows.
 */
export function isCoachingBooking(bookingType: string | null | undefined): boolean {
  return (bookingType ?? '').toLowerCase().includes('coaching');
}

/**
 * Play & Food sets bundle a fixed number of hours with the food order, so the
 * duration is part of what was purchased. Date and time stay editable; the
 * length does not.
 */
export function isPlayFoodBooking(
  bookingType: string | null | undefined,
  packageName: string | null | undefined
): boolean {
  if ((bookingType ?? '') === 'Play_Food_Package') return true;
  return (packageName ?? '').startsWith('SET_');
}

/**
 * Whether this booking may be edited by its owner right now, and if not, why.
 *
 * The time comparison goes through `parseBangkokDate`, never
 * ``new Date(`${date}T${start_time}`)``. The stored values are Bangkok wall
 * clock; parsing them without an offset resolves them in the *runtime's* zone,
 * which on Vercel is UTC — so a booking would stay "editable" for seven hours
 * after it started. The cancel route still carries that bug; do not copy it.
 */
export function computeEditability({
  status,
  date,
  start_time,
  booking_type,
  now = new Date(),
}: EditabilityInput): Editability {
  if (status !== 'confirmed') {
    return { canEdit: false, reason: 'NOT_CONFIRMED' };
  }

  if (isCoachingBooking(booking_type)) {
    return { canEdit: false, reason: 'COACHING_NOT_EDITABLE' };
  }

  if (!date || !start_time) {
    return { canEdit: false, reason: 'NOT_CONFIRMED' };
  }

  const startsAt = parseBangkokDate(date, start_time);
  if (Number.isNaN(startsAt.getTime())) {
    return { canEdit: false, reason: 'NOT_CONFIRMED' };
  }

  if (startsAt.getTime() <= now.getTime()) {
    return { canEdit: false, reason: 'BOOKING_IN_PAST' };
  }

  if (MIN_EDIT_NOTICE_HOURS > 0) {
    const cutoff = now.getTime() + MIN_EDIT_NOTICE_HOURS * 60 * 60 * 1000;
    if (startsAt.getTime() < cutoff) {
      return { canEdit: false, reason: 'TOO_LATE_TO_EDIT' };
    }
  }

  return { canEdit: true };
}

/**
 * The bay type a booking currently sits in, or null if it has no bay yet.
 *
 * `getBayTypeFromKey` covers the canonical `Bay 1`..`Bay 4` keys. The substring
 * fallback exists for rows written by other surfaces that stored a display name
 * (`Bay 1 (Bar)`, `LENGOLF AI Lab`) rather than the key.
 */
export function deriveBayType(bay: string | null | undefined): BayType | null {
  if (!bay) return null;

  const known = getBayTypeFromKey(bay);
  if (known) return known;

  const normalized = bay.toLowerCase();
  if (normalized.includes('ai') || normalized.includes('bay 4')) return 'ai_lab';
  return 'social';
}

export interface BaySelectionInput {
  /** The bay the booking sits in today. */
  currentBay: string | null | undefined;
  /** Bay keys reported free for the new slot, excluding this booking itself. */
  freeBays: string[];
}

export interface BaySelection {
  /** The bay to move to, or null when the new slot cannot serve this booking. */
  bay: string | null;
  /**
   * True when bays were free at the new slot but none of them could serve this
   * booking's type. Lets the UI say "the AI Lab is taken then" rather than the
   * flatly wrong "nothing is free".
   */
  otherBayTypeAvailable: boolean;
}

/**
 * Pick the bay an edited booking should land in.
 *
 * Three rules, in order:
 *
 *  1. **Stickiness.** If the current bay is free at the new time, keep it. Staff
 *     sometimes place a booking in a specific bay by hand, and a move they did
 *     not ask for is a move they have to notice.
 *  2. **Same type next.** Otherwise take the first free bay of the same type.
 *  3. **Asymmetric fallback.** A social booking may fall back to the AI Lab when
 *     Bays 1-3 are all full — that matches what `/api/bookings/create` already
 *     does, and a social customer loses nothing by sitting in Bay 4. The reverse
 *     is refused: someone who booked the AI Lab booked it for the swing-analysis
 *     cameras, and quietly moving them to a social bay delivers a different
 *     product under the same booking id.
 *
 * Returns `bay: null` rather than throwing so the caller decides the status code.
 */
export function selectBayForEditedSlot({
  currentBay,
  freeBays,
}: BaySelectionInput): BaySelection {
  const free = new Set(freeBays);

  if (currentBay && free.has(currentBay)) {
    return { bay: currentBay, otherBayTypeAvailable: false };
  }

  const socialBays = getSocialBays();
  const aiLabBays = getAILabBays();
  const currentType = deriveBayType(currentBay);

  // AI Lab stays AI Lab. Everything else prefers social and tolerates the Lab.
  const candidates =
    currentType === 'ai_lab' ? aiLabBays : [...socialBays, ...aiLabBays];

  const match = candidates.find((bay) => free.has(bay));
  if (match) {
    return { bay: match, otherBayTypeAvailable: false };
  }

  return { bay: null, otherBayTypeAvailable: freeBays.length > 0 };
}

/**
 * Read `check_all_bays_availability`'s answer into a list of free bay keys.
 *
 * The RPC returns a `jsonb` map, but PostgREST occasionally hands back a
 * single-element array wrapping it (the create route defends against the same
 * thing), so both shapes are accepted.
 */
export function freeBaysFromAvailability(raw: unknown): string[] {
  if (!raw) return [];

  const map = Array.isArray(raw) ? raw[0] : raw;
  if (!map || typeof map !== 'object') return [];

  return Object.entries(map as Record<string, unknown>)
    .filter(([, isFree]) => isFree === true)
    .map(([bay]) => bay);
}

export interface EditDurationInput {
  /** The booking's current length, which may be off the standard ladder. */
  bookingDuration: number;
  /** Longest session the chosen slot can serve for this bay type. */
  headroom: number;
  /** True while the customer is still on the slot the booking already occupies. */
  isOriginalSlot: boolean;
  /** LIFF offers whole hours only, matching its create flow. */
  wholeHoursOnly: boolean;
  /** Unlocks the 4 h and 5 h rungs. */
  hasActivePackage: boolean;
  /** The base ladder, injected so this module need not import from itself. */
  ladder: number[];
}

/**
 * The durations to offer while editing, ascending.
 *
 * Distinct from `allowedDurations` because an edit starts from a booking that
 * already exists, and that booking's length is not necessarily on the ladder:
 * 0.5, 3.5 and 6 hour bookings are all in the table, mostly staff-created, and
 * 1.5 is ordinary but absent from LIFF's whole-hour ladder. While the customer
 * is still on their own slot that length is by definition bookable, so it has to
 * be offered — otherwise {@link clampDuration} rewrites it before they touch
 * anything.
 */
export function editDurationOptions({
  bookingDuration,
  headroom,
  isOriginalSlot,
  wholeHoursOnly,
  hasActivePackage,
  ladder,
}: EditDurationInput): number[] {
  const base = wholeHoursOnly
    ? Array.from({ length: Math.max(1, Math.min(Math.floor(headroom), 5)) }, (_, i) => i + 1)
    : ladder.filter((hours) => hours <= headroom && (hasActivePackage || hours <= 3));

  const options = base.length > 0 ? base : [MIN_DURATION_HOURS];

  if (isOriginalSlot && !options.includes(bookingDuration)) {
    return [...options, bookingDuration].sort((a, b) => a - b);
  }
  return options;
}

/**
 * The duration to fall back to when the current one is no longer offered.
 *
 * **Downwards, never upwards.** The obvious `options[options.length - 1]` picks
 * the LONGEST rung, which silently lengthens the booking: a customer moving a
 * 30-minute session to another day would have had 3 hours (web) or 5 hours
 * (LIFF) selected for them, and since the endpoint does not re-check package
 * entitlement when a booking grows, the extra hours would simply be taken.
 *
 * Falls back to the shortest option only when nothing fits, which can happen
 * when the whole ladder sits above the current length (a 0.5 h booking moved to
 * a slot whose shortest rung is 1 h).
 */
export function clampDuration(current: number, options: number[]): number {
  if (options.length === 0 || options.includes(current)) return current;
  const fits = options.filter((hours) => hours <= current);
  return fits.length > 0 ? fits[fits.length - 1] : options[0];
}

/** Shortest bookable session. Mirrors `MIN_DURATION` in `booking-durations.ts`. */
const MIN_DURATION_HOURS = 1;

/**
 * A Date whose **local** calendar day equals the given `yyyy-MM-dd`.
 *
 * For calendar widgets and `date-fns`' `format`, both of which read local
 * getters. `parseBangkokDate` is the wrong tool for those: it returns the
 * correct *instant*, which in a browser west of +07 falls on the previous local
 * day — so `format(parseBangkokDate('2026-08-10'), 'yyyy-MM-dd')` yields
 * `'2026-08-09'` in London and submits an edit for the wrong date.
 *
 * Rule of thumb: `localCalendarDate` for anything that will be read back through
 * local getters, `parseBangkokDate` for anything compared against a real instant
 * or rendered through the Bangkok-pinned next-intl formatter.
 */
export function localCalendarDate(dateISO: string): Date {
  const [year, month, day] = dateISO.slice(0, 10).split('-').map(Number);
  return new Date(year, (month || 1) - 1, day || 1);
}

/**
 * End time of a slot as `HH:mm` Bangkok wall clock.
 *
 * Minute arithmetic, not string concatenation: durations are fractional
 * (1.5, 2.5) and `${startHour + 1.5}:00` produces `"15.5:00"`, which is what the
 * previous modify route compared against real times.
 */
export function computeEndTime(startTime: string, durationHours: number): string {
  const [hours, minutes] = startTime.split(':').map(Number);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return startTime;

  const total = hours * 60 + minutes + Math.round(durationHours * 60);
  const endHours = Math.floor(total / 60) % 24;
  const endMinutes = total % 60;

  return `${String(endHours).padStart(2, '0')}:${String(endMinutes).padStart(2, '0')}`;
}
