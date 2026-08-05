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

export function buildPurchaseEvent(row: PendingBooking): BuiltEvent | null {
  const built = buildUserData({
    bookingEmail: row.booking_email,
    customerEmail: row.customer_email,
    phone: row.phone,
    name: row.customer_name,
  });
  if (!built) return null;

  const ms = Date.parse(row.event_time);
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
    return { ok: true, eventsReceived: 0, fbTraceId: null, error: null };
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
      };
    }

    return {
      ok: true,
      eventsReceived: payload.events_received ?? 0,
      fbTraceId: payload.fbtrace_id ?? null,
      error: null,
    };
  } catch (err) {
    return {
      ok: false,
      eventsReceived: 0,
      fbTraceId: null,
      error: err instanceof Error ? err.message : String(err),
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
