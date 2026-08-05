/**
 * Meta Conversions API transport for booking conversions.
 *
 * The server is the SOLE source of the Purchase conversion: the GTM container
 * fires PageView / CompleteRegistration / custom micro-events, no Purchase, and
 * passes no eventID to any fbq call. So there is nothing on the browser side to
 * deduplicate against today.
 *
 * The stable event_id is kept regardless, because the live duplicate risk is
 * ours: a retried cron tick, two overlapping ticks, or a send that succeeds and
 * then fails to record. Meta collapses same-name + same-id events within 48h.
 */
import { buildUserData, type MetaUserData, type MatchKey } from './identity';
import type { MetaCapiConfig } from './config';

/**
 * Per-booking conversion value. Derived in the notes on GTM tag 62 in container
 * GTM-MKCHVJKW. Do NOT use 1813 — that is the per-CUSTOMER figure and overstates
 * a single booking by ~46%.
 */
export const BOOKING_CONVERSION_VALUE_THB = 1200;

export const GRAPH_API_VERSION = 'v22.0';

export type MetaActionSource = 'website' | 'physical_store';

/** One row of public.meta_capi_pending. */
export interface PendingBooking {
  booking_id: string;
  event_time: string;
  customer_name: string | null;
  booking_email: string | null;
  customer_email: string | null;
  phone: string | null;
  action_source: MetaActionSource;
}

export interface MetaServerEvent {
  event_name: 'Purchase';
  event_id: string;
  event_time: number;
  action_source: MetaActionSource;
  user_data: MetaUserData;
  custom_data: { value: number; currency: string };
}

export interface BuiltEvent {
  bookingId: string;
  event: MetaServerEvent;
  matchKeys: MatchKey[];
}

/** Stable and derived purely from the primary key, so retries collapse. */
export function eventIdForBooking(bookingId: string): string {
  return `booking-${bookingId}`;
}

/**
 * PostgREST serialises timestamptz with an explicit zone, and we require one.
 * Without it `Date.parse` silently reads the string as local time in the
 * runtime zone (UTC on Vercel) instead of failing — producing a wrong but
 * plausible instant, which misattributes the conversion rather than skipping
 * it. Note the time component is mandatory in this pattern: a bare `±HH`
 * offset rule would match the `-30` in `2026-07-30`.
 */
const HAS_EXPLICIT_ZONE = /\d{2}:\d{2}(?::\d{2})?(?:\.\d+)?(?:Z|[+-]\d{2}(?::?\d{2})?)$/;

/**
 * V8's `Date.parse` accepts `+07:00` and `+0700` but returns NaN for the bare
 * `+07` form — even though it's a valid ISO 8601 offset and HAS_EXPLICIT_ZONE
 * already accepts it above. Pad it to `+07:00` so a legitimately-zoned string
 * doesn't get rejected purely because of which offset spelling it used. Only
 * matches a trailing `[+-]DD`, so it can't touch `+0700` (last 3 chars are
 * `700`, not `+DD`) or the date portion (already gated behind
 * HAS_EXPLICIT_ZONE, which requires a preceding time component).
 */
function normalizeShortOffset(value: string): string {
  return value.replace(/([+-]\d{2})$/, '$1:00');
}

export function buildPurchaseEvent(row: PendingBooking): BuiltEvent | null {
  const built = buildUserData({
    bookingEmail: row.booking_email,
    customerEmail: row.customer_email,
    phone: row.phone,
    name: row.customer_name,
  });
  if (!built) return null;

  if (!HAS_EXPLICIT_ZONE.test(row.event_time)) return null;

  const ms = Date.parse(normalizeShortOffset(row.event_time));
  if (Number.isNaN(ms)) return null;

  return {
    bookingId: row.booking_id,
    matchKeys: built.matchKeys,
    event: {
      event_name: 'Purchase',
      event_id: eventIdForBooking(row.booking_id),
      // Unix SECONDS. Milliseconds would read as the year ~57000 and be rejected.
      event_time: Math.floor(ms / 1000),
      action_source: row.action_source,
      user_data: built.userData,
      custom_data: {
        value: BOOKING_CONVERSION_VALUE_THB,
        currency: 'THB',
      },
    },
  };
}

/** Meta's documented per-request ceiling. */
export const MAX_EVENTS_PER_REQUEST = 1000;

export interface SendResult {
  ok: boolean;
  eventsReceived: number;
  fbTraceId: string | null;
  error: string | null;
  /**
   * Meta's numeric error code (e.g. 190 = invalid token, 100 = missing
   * perms). Task 8's retry logic needs this to tell a permanent failure from
   * a transient one — without it, a bad token burns the same 3 retries as a
   * network blip instead of failing loud on the first attempt. `null` on
   * success and on a network exception, where there is no HTTP response to
   * read a code from.
   */
  errorCode: number | null;
}

/**
 * POST one batch to the dataset. Never throws — a cron route that dies mid-run
 * leaves rows staged 'pending' with no diagnostic, so every failure path has to
 * come back as data the caller can record.
 */
export async function sendEvents(
  config: MetaCapiConfig,
  events: MetaServerEvent[],
): Promise<SendResult> {
  if (events.length === 0) {
    return { ok: true, eventsReceived: 0, fbTraceId: null, error: null, errorCode: null };
  }

  const url = `https://graph.facebook.com/${GRAPH_API_VERSION}/${config.datasetId}/events`;

  // The token goes in the BODY. In the query string it would land in access
  // logs and any proxy in between.
  const body: Record<string, unknown> = {
    data: events,
    access_token: config.accessToken,
  };
  if (config.testEventCode) {
    body.test_event_code = config.testEventCode;
  }

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    const payload = (await response.json()) as {
      events_received?: number;
      fbtrace_id?: string;
      error?: { message?: string; code?: number; fbtrace_id?: string };
    };

    if (!response.ok || payload.error) {
      const message = payload.error?.message ?? `HTTP ${response.status}`;
      return {
        ok: false,
        eventsReceived: 0,
        fbTraceId: payload.error?.fbtrace_id ?? payload.fbtrace_id ?? null,
        error: message,
        errorCode: payload.error?.code ?? null,
      };
    }

    return {
      ok: true,
      eventsReceived: payload.events_received ?? 0,
      fbTraceId: payload.fbtrace_id ?? null,
      error: null,
      errorCode: null,
    };
  } catch (err) {
    return {
      ok: false,
      eventsReceived: 0,
      fbTraceId: null,
      error: err instanceof Error ? err.message : String(err),
      // No HTTP response to read a code from — this is a network-level
      // failure (DNS, TLS, socket), not a Graph API rejection.
      errorCode: null,
    };
  }
}

/** Split a batch into request-sized chunks. */
export function chunkEvents<T>(events: T[], size = MAX_EVENTS_PER_REQUEST): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < events.length; i += size) {
    chunks.push(events.slice(i, i + size));
  }
  return chunks;
}
