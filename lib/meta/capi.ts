import 'server-only';
import { createHash } from 'crypto';

/**
 * Meta Conversions API — server-side booking conversions.
 *
 * WHY THIS EXISTS. The only booking signal Meta had was the browser pixel's
 * `CompleteRegistration`, fired by a GTM trigger matching the CLICK TEXT
 * "Confirm Booking". That is wrong in three separate ways: it counts the click
 * rather than the committed booking (so failed submits and double-taps inflate
 * it), it never matched a Thai / Japanese / Korean / Chinese customer at all,
 * and it is browser-side so iOS ATT and ad blockers erase a large share of what
 * is left.
 *
 * It also could not see LIFF. GTM is injected only in `app/[locale]/layout.tsx`
 * and the LINE mini-app lives at `app/liff/*`, so no pixel loads there — yet
 * both surfaces POST to `/api/bookings/create`. Sending from the server covers
 * both in one place, which is the whole reason this belongs here and not in a
 * component.
 *
 * Measured 2026-08-04: 217 of 804 bookings in a 30-day window were LIFF and
 * invisible to Meta. See the funnel-measurement note in project memory.
 *
 * DELIBERATELY FAILS SOFT. There is no module-load assertion that throws on
 * missing config. This repo has been bitten twice by that pattern
 * (MARKETING_PREFS_SECRET, SHOPEEPAY_*): a throw at import time fails the
 * Next.js build during "Collecting page data" and blocks every deploy until the
 * env vars land in all three Vercel environments. A booking must never fail
 * because an analytics token is absent, so an unconfigured deploy logs once and
 * skips.
 */

/** Public pixel id — it is served in the page HTML and set on GTM tag 48. */
const DEFAULT_PIXEL_ID = '480537434714703';
const GRAPH_VERSION = 'v21.0';

/**
 * Meta standard event. `Schedule` is the semantically correct one — "a person
 * books an appointment to visit one of your locations" — and unlike `Purchase`
 * it does not assert that money changed hands, which at booking time it has
 * not. `value` is still sent, so value-based optimisation remains available.
 */
const EVENT_NAME = 'Schedule';

/**
 * Value reported per booking, in THB.
 *
 * Deliberately the SAME flat figure GTM tag 62 sends to Google Ads, and for the
 * same reason: it is the measured per-BOOKING value (12,750,188 THB lifetime
 * spend over 10,243 bookings = 1,245 blended; 1,150 for non-package customers
 * and 1,366 for package holders), rounded down to sit conservatively inside
 * that band.
 *
 * Not the promo-adjusted price this particular booking will be charged. Feeding
 * a discounted amount to one ad platform and a flat one to the other makes the
 * two ROAS figures incomparable, which is the number anyone actually wants to
 * read across channels. If this changes, change GTM tag 62 with it.
 */
export const BOOKING_VALUE_THB = 1200;

export interface BookingConversionInput {
  /** Booking id. Becomes `event_id`, which is what Meta dedupes on. */
  bookingId: string;
  /** When the booking was created. Seconds since epoch; Meta rejects >7d old. */
  eventTimeMs: number;
  email?: string | null;
  phone?: string | null;
  firstName?: string | null;
  /** Booking value in THB. */
  value: number;
  isNewCustomer?: boolean;
  /** `_fbp` cookie, if the visitor carried one. Large lift in match quality. */
  fbp?: string | null;
  /** `_fbc` cookie, derived by the pixel from a landing `fbclid`. */
  fbc?: string | null;
  clientIp?: string | null;
  userAgent?: string | null;
  /** Page the booking was made from; omitted for LIFF, which has no such URL. */
  eventSourceUrl?: string | null;
}

/** SHA-256 of a normalised value, per Meta's matching spec. */
function hash(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function hashEmail(email: string | null | undefined): string | undefined {
  const normalized = email?.trim().toLowerCase();
  if (!normalized || !normalized.includes('@')) return undefined;
  return hash(normalized);
}

/**
 * Thai numbers are stored locally ("081 234 5678", "+66812345678", "0812345678").
 * Meta wants digits only, country code included, no punctuation and no leading
 * plus. A local number starting `0` is Thai with the 0 replaced by 66; anything
 * already carrying a country code is passed through once stripped.
 *
 * Returns undefined rather than guessing when the result is not a plausible
 * length — a wrong hash is worse than no hash, because it silently degrades
 * match quality with no error anywhere.
 */
export function normalizePhoneTH(phone: string | null | undefined): string | undefined {
  if (!phone) return undefined;
  let digits = phone.replace(/[^\d+]/g, '');
  if (digits.startsWith('+')) digits = digits.slice(1);
  else if (digits.startsWith('00')) digits = digits.slice(2);
  else if (digits.startsWith('0')) digits = `66${digits.slice(1)}`;
  else if (digits.length <= 9) digits = `66${digits}`;
  if (digits.length < 10 || digits.length > 15) return undefined;
  return digits;
}

function hashPhone(phone: string | null | undefined): string | undefined {
  const normalized = normalizePhoneTH(phone);
  return normalized ? hash(normalized) : undefined;
}

function hashName(name: string | null | undefined): string | undefined {
  // Meta matches on the first token only; a full "name" field is usually
  // "First Last" here and hashing the whole string would never match.
  const first = name?.trim().toLowerCase().split(/\s+/)[0];
  if (!first) return undefined;
  return hash(first);
}

/** Read config at call time, never at import time. See the header comment. */
function readConfig(): { pixelId: string; token: string; testCode?: string } | null {
  const token = process.env.META_CAPI_ACCESS_TOKEN;
  if (!token) return null;
  return {
    pixelId: process.env.META_PIXEL_ID || DEFAULT_PIXEL_ID,
    token,
    testCode: process.env.META_CAPI_TEST_EVENT_CODE || undefined,
  };
}

export interface SendResult {
  sent: boolean;
  skipped?: 'not_configured' | 'no_identifiers';
  error?: string;
  eventsReceived?: number;
}

/**
 * Send one booking conversion. Resolves rather than throws: the caller runs
 * inside the booking route's `after()` chain, where an exception would abort
 * the notification steps queued behind it.
 */
export async function sendBookingConversion(
  input: BookingConversionInput,
): Promise<SendResult> {
  const config = readConfig();
  if (!config) {
    console.warn('[MetaCAPI] META_CAPI_ACCESS_TOKEN not set — skipping conversion send');
    return { sent: false, skipped: 'not_configured' };
  }

  const em = hashEmail(input.email);
  const ph = hashPhone(input.phone);
  const fn = hashName(input.firstName);

  // Meta rejects an event with no way to match a person. Sending it anyway
  // burns quota and reports a success that attributed nothing.
  if (!em && !ph && !input.fbp && !input.fbc) {
    return { sent: false, skipped: 'no_identifiers' };
  }

  const userData: Record<string, unknown> = {};
  if (em) userData.em = [em];
  if (ph) userData.ph = [ph];
  if (fn) userData.fn = [fn];
  if (input.fbp) userData.fbp = input.fbp;
  if (input.fbc) userData.fbc = input.fbc;
  if (input.clientIp) userData.client_ip_address = input.clientIp;
  if (input.userAgent) userData.client_user_agent = input.userAgent;

  const body: Record<string, unknown> = {
    data: [
      {
        event_name: EVENT_NAME,
        // Seconds, not milliseconds — Meta silently treats a ms value as a
        // timestamp far in the future and drops the event.
        event_time: Math.floor(input.eventTimeMs / 1000),
        // Same id the browser pixel would use, so a web booking counted by both
        // paths collapses to one conversion instead of double-counting.
        event_id: input.bookingId,
        action_source: 'website',
        ...(input.eventSourceUrl ? { event_source_url: input.eventSourceUrl } : {}),
        user_data: userData,
        custom_data: {
          currency: 'THB',
          value: input.value,
          ...(input.isNewCustomer === undefined
            ? {}
            : { new_customer: input.isNewCustomer }),
        },
      },
    ],
    ...(config.testCode ? { test_event_code: config.testCode } : {}),
  };

  try {
    const res = await fetch(
      `https://graph.facebook.com/${GRAPH_VERSION}/${config.pixelId}/events?access_token=${encodeURIComponent(config.token)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      },
    );

    const json = (await res.json().catch(() => null)) as
      | { events_received?: number; error?: { message?: string } }
      | null;

    if (!res.ok) {
      // Never echo the response wholesale — the request carried an access token
      // and Meta reflects request fragments back in some error shapes.
      const message = json?.error?.message ?? `HTTP ${res.status}`;
      console.error('[MetaCAPI] send failed:', message);
      return { sent: false, error: message };
    }

    return { sent: true, eventsReceived: json?.events_received };
  } catch (e) {
    const message = e instanceof Error ? e.message : 'unknown error';
    console.error('[MetaCAPI] send threw:', message);
    return { sent: false, error: message };
  }
}
