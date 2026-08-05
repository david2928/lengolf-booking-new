/**
 * GET /api/cron/meta-capi-upload
 *
 * Nightly upload of bookings to the Meta Conversions API (dataset LENGOLF v2,
 * 1326508338698235). Meta sees ~14% of bookings without this: LIFF loads no GTM
 * and staff-created bookings never touch a browser we own.
 *
 * Scheduled by pg_cron ('meta-capi-upload-nightly', 20:00 UTC = 03:00 Bangkok;
 * net.http_get + Bearer CRON_API_KEY from Vault).
 *
 * Idempotency is belt-and-braces: public.meta_capi_pending anti-joins rows
 * already uploaded or retry-exhausted, AND every event carries a stable
 * event_id derived from the booking id so Meta collapses any duplicate that
 * slips through a crashed run. ('pending' and 'skipped' are deliberately NOT
 * terminal — see migration 20260805120070.)
 *
 * `?dryRun=1` builds the payload and reports counts without POSTing.
 */
import { NextRequest, NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createServerClient } from '@/utils/supabase/server';
import { getMetaCapiConfig } from '@/lib/meta/config';
import {
  buildPurchaseEvent,
  chunkEvents,
  sendEvents,
  eventIdForBooking,
  BOOKING_CONVERSION_VALUE_THB,
  type PendingBooking,
  type BuiltEvent,
  type MetaActionSource,
} from '@/lib/meta/capi';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const CRON_SECRET_MIN_LENGTH = 32;
const BATCH_LIMIT = 200;
/** Meta rejects the ENTIRE request if any event_time exceeds 7 days. */
const MAX_EVENT_AGE_MS = 7 * 24 * 60 * 60 * 1000;
/** Safety margin so a row cannot age past the limit between query and POST. */
const AGE_SAFETY_MS = 60 * 60 * 1000;

function verifyCronSecret(request: NextRequest): { ok: true } | { ok: false; status: number; message: string } {
  const expected = process.env.CRON_API_KEY;
  if (!expected || expected.length < CRON_SECRET_MIN_LENGTH) {
    return {
      ok: false,
      status: 503,
      message: 'Cron endpoint is not configured. Set CRON_API_KEY (32+ chars) in this environment.',
    };
  }
  const header = request.headers.get('authorization');
  if (!header || !header.startsWith('Bearer ')) {
    return { ok: false, status: 401, message: 'Missing or malformed Authorization header' };
  }
  const presented = header.slice('Bearer '.length).trim();
  if (presented.length !== expected.length) {
    return { ok: false, status: 401, message: 'Invalid token' };
  }
  // Constant-time compare to avoid timing attacks. Cheap defense for a
  // bearer-token check.
  let diff = 0;
  for (let i = 0; i < expected.length; i++) {
    diff |= presented.charCodeAt(i) ^ expected.charCodeAt(i);
  }
  if (diff !== 0) {
    return { ok: false, status: 401, message: 'Invalid token' };
  }
  return { ok: true };
}

/**
 * A row as PostgREST actually returns it, which is NOT `PendingBooking`.
 * `action_source` is a plain `text` column produced by a CASE expression in the
 * view; TypeScript cannot check its contents at runtime, so it arrives here as
 * an unvalidated string and is narrowed below.
 */
interface PendingCandidateRow {
  booking_id: string;
  event_time: string;
  customer_name: string | null;
  booking_email: string | null;
  customer_email: string | null;
  phone: string | null;
  action_source: string | null;
}

/**
 * Meta accepts exactly these two for our purposes. Rejecting anything else at
 * the fetch boundary is a guard against a future edit to the view's CASE
 * expression adding a third branch: an unrecognised action_source would
 * otherwise be POSTed verbatim and rejected by Meta for the WHOLE batch.
 */
function isMetaActionSource(value: unknown): value is MetaActionSource {
  return value === 'website' || value === 'physical_store';
}

/**
 * A timestamp `buildPurchaseEvent` is guaranteed to resolve, used only to tell
 * its two null paths apart (see below). Never sent.
 */
const PROBE_EVENT_TIME = '2026-01-01T00:00:00+07:00';

/**
 * `buildPurchaseEvent` returns null for two unrelated reasons — no strong
 * identifier, or an `event_time` it cannot resolve to an instant — and the
 * tracking table wants to say which. Re-running it against a timestamp that is
 * definitely resolvable separates them without restating the parser's zone
 * rules here, where they would drift from `lib/meta/capi.ts`. Pure, cheap, and
 * only ever reached on the failure path.
 */
function explainBuildFailure(row: PendingBooking): string {
  return buildPurchaseEvent({ ...row, event_time: PROBE_EVENT_TIME })
    ? 'Unparseable event_time'
    : 'No usable email or phone identifier';
}

/**
 * `marketing.meta_capi_uploads.event_time` is NOT NULL, but a row can be
 * skipped precisely BECAUSE its timestamp is unusable. Skipped rows are never
 * uploaded, so this value is diagnostic only — falling back to now() keeps the
 * skip recorded (and therefore excluded by the view) rather than losing it.
 */
function diagnosticEventTime(raw: string): string {
  const ms = Date.parse(raw);
  return Number.isNaN(ms) ? new Date().toISOString() : new Date(ms).toISOString();
}

/**
 * `types/supabase.ts` declares `Database` with only a `public` key, and
 * `.schema()` is constrained to `keyof Database` — so `.schema('marketing')`
 * does not typecheck against it, even though `.from()` and `.rpc()` do (their
 * `Schema` widens to `any` because an `interface` gets no implicit index
 * signature and therefore fails supabase-js's `GenericSchema` check).
 *
 * Accepting the default-generic `SupabaseClient` here is the narrowest way
 * through: it loosens the schema NAME only, at one call site. No new grant is
 * involved — the route runs as service_role, which already holds the write.
 */
function uploadsTable(supabase: SupabaseClient) {
  return supabase.schema('marketing').from('meta_capi_uploads');
}

interface SkippedRow {
  row: PendingCandidateRow;
  reason: string;
}

function tally(values: string[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const value of values) {
    counts[value] = (counts[value] ?? 0) + 1;
  }
  return counts;
}

export async function GET(request: NextRequest) {
  const auth = verifyCronSecret(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  }

  const dryRun = request.nextUrl.searchParams.get('dryRun') === '1';

  // Deliberately NOT an assertion. A throw here would fire during Next.js
  // `Collecting page data` and block every deploy until the env vars land in
  // all three Vercel environments — this repo has lost two production builds
  // to exactly that (MARKETING_PREFS_SECRET, SHOPEEPAY_*). A dry run is still
  // useful unconfigured: it reports what WOULD be sent.
  //
  // 503 rather than 200, because the pg_cron job is already live: a 200 would
  // no-op silently every night with nothing to alert on, and `net._http_response`
  // would record a clean run. That is precisely how the marketing-consent bug
  // stayed invisible for three months. 503 keeps "fail soft" intact — nothing
  // throws, no build breaks — while making the unconfigured state observable.
  // Same distinction the auth check draws: 503 is a deployment fault, not a
  // caller fault.
  const config = getMetaCapiConfig();
  if (!config && !dryRun) {
    console.warn(
      '[meta-capi] META_CAPI_ACCESS_TOKEN / META_CAPI_DATASET_ID are not set — skipping this run.',
    );
    return NextResponse.json({ skipped: 'not configured' }, { status: 503 });
  }

  const supabase = createServerClient();

  const { data, error: listError } = await supabase
    .from('meta_capi_pending')
    .select('booking_id, event_time, customer_name, booking_email, customer_email, phone, action_source')
    // Oldest first: those are the rows closest to Meta's 7-day cliff, so if a
    // backlog exceeds BATCH_LIMIT the ones about to expire go out first.
    .order('event_time', { ascending: true })
    .limit(BATCH_LIMIT);

  if (listError) {
    console.error('[meta-capi] candidate query failed:', listError);
    return NextResponse.json({ error: 'Candidate query failed' }, { status: 500 });
  }

  const rows = (data ?? []) as PendingCandidateRow[];
  if (rows.length === 0) {
    return NextResponse.json({ scanned: 0, sent: 0, skipped: 0, failed: 0 });
  }

  // Computed once per run, not per row, so every row in a batch is judged
  // against the same cutoff.
  const ageFloor = Date.now() - MAX_EVENT_AGE_MS + AGE_SAFETY_MS;

  const built: BuiltEvent[] = [];
  const skippedRows: SkippedRow[] = [];

  for (const row of rows) {
    if (!isMetaActionSource(row.action_source)) {
      skippedRows.push({ row, reason: 'Unexpected action_source' });
      continue;
    }

    const candidate: PendingBooking = {
      booking_id: row.booking_id,
      event_time: row.event_time,
      customer_name: row.customer_name,
      booking_email: row.booking_email,
      customer_email: row.customer_email,
      phone: row.phone,
      action_source: row.action_source,
    };

    const event = buildPurchaseEvent(candidate);
    if (!event) {
      skippedRows.push({ row, reason: explainBuildFailure(candidate) });
      continue;
    }

    // Checked against the instant the builder actually resolved, not a second
    // parse of the raw string. The view already applies a 7-day floor in SQL;
    // this is the app-side half, and the safety margin covers the gap between
    // the query and the POST.
    if (event.event.event_time * 1000 < ageFloor) {
      skippedRows.push({ row, reason: 'Older than the Meta 7-day event_time window' });
      continue;
    }

    built.push(event);
  }

  if (dryRun) {
    return NextResponse.json({
      dryRun: true,
      configured: config !== null,
      scanned: rows.length,
      wouldSend: built.length,
      skipped: skippedRows.length,
      // Identifier KINDS and skip reasons only — no values, ever. `[...]` so
      // sorting for a stable histogram key cannot reorder the built event's
      // own matchKeys.
      matchKeyHistogram: tally(built.map((b) => [...b.matchKeys].sort().join('+'))),
      skipReasons: tally(skippedRows.map((s) => s.reason)),
    });
  }

  if (skippedRows.length > 0) {
    const { error: skipError } = await uploadsTable(supabase).upsert(
      skippedRows.map((s) => ({
        booking_id: s.row.booking_id,
        event_id: eventIdForBooking(s.row.booking_id),
        event_time: diagnosticEventTime(s.row.event_time),
        value: BOOKING_CONVERSION_VALUE_THB,
        // Recorded raw rather than normalised: if the view ever grows a third
        // branch, the offending literal is the whole diagnosis.
        action_source: s.row.action_source ?? 'unknown',
        match_keys: null,
        status: 'skipped',
        error_message: s.reason,
      })),
      { onConflict: 'booking_id' },
    );
    // Not fatal. A skip that fails to record simply gets re-evaluated (and
    // re-skipped) on the next tick; nothing is sent and nothing double-counts.
    if (skipError) {
      console.error(`[meta-capi] could not record ${skippedRows.length} skipped rows:`, skipError);
    }
  }

  if (built.length === 0) {
    console.log(
      `[meta-capi] scanned=${rows.length} sent=0 skipped=${skippedRows.length} failed=0 (nothing to send)`,
    );
    return NextResponse.json({ scanned: rows.length, sent: 0, skipped: skippedRows.length, failed: 0 });
  }

  // Stage BEFORE sending. Events that reach Meta with no tracking row are
  // untracked duplicates on the next tick — the view would hand them back and
  // we would send them again with nothing recording that we already had.
  // `retry_count` is deliberately absent from the payload: PostgREST only
  // updates the columns it is given, so a row returning from 'failed' keeps
  // its accumulated count and stays on course to exhaust.
  const { error: stageError } = await uploadsTable(supabase).upsert(
    built.map((b) => ({
      booking_id: b.bookingId,
      event_id: b.event.event_id,
      event_name: b.event.event_name,
      event_time: new Date(b.event.event_time * 1000).toISOString(),
      value: b.event.custom_data.value,
      currency: b.event.custom_data.currency,
      action_source: b.event.action_source,
      match_keys: b.matchKeys,
      status: 'pending',
      // Cleared so a previous attempt's message can never be read as the
      // current state; the outcome below rewrites it either way.
      error_message: null,
    })),
    { onConflict: 'booking_id' },
  );

  if (stageError) {
    console.error('[meta-capi] tracking staging failed — sending nothing this tick:', stageError);
    return NextResponse.json({ error: 'Tracking staging failed' }, { status: 500 });
  }

  let sent = 0;
  let failed = 0;

  for (const chunk of chunkEvents(built)) {
    const bookingIds = chunk.map((b) => b.bookingId);
    // `config` is non-null here: the only path that reaches this point with a
    // null config is a dry run, and that returned above.
    const result = await sendEvents(config!, chunk.map((b) => b.event));

    if (result.ok) {
      sent += chunk.length;
      const { error: markError } = await uploadsTable(supabase)
        .update({
          status: 'uploaded',
          uploaded_at: new Date().toISOString(),
          events_received: result.eventsReceived,
          fbtrace_id: result.fbTraceId,
          error_message: null,
        })
        .in('booking_id', bookingIds)
        // Only promote rows THIS run staged. Two overlapping ticks read the
        // same candidates; if the other one already resolved these rows, its
        // outcome is the current truth and must not be overwritten by ours.
        .eq('status', 'pending');

      if (markError) {
        // The events ARE at Meta. The rows stay 'pending', which the view
        // treats as retryable — safe, because the stable event_id makes Meta
        // collapse the resend rather than double-count it.
        console.error(
          `[meta-capi] ${chunk.length} events reached Meta but the tracking update failed; rows stay pending and will resend (deduplicated by event_id):`,
          markError,
        );
      }
      continue;
    }

    failed += chunk.length;
    // The Graph error code is the difference between "retry tonight" and "go
    // fix the token" (#190 invalid/expired, #100 missing permission). Without
    // it in the recorded message, a permanent failure burns its three retries
    // looking exactly like a network blip.
    const message =
      result.errorCode !== null
        ? `#${result.errorCode} ${result.error ?? 'Graph API error'}`
        : result.error ?? 'Unknown error';
    console.error(`[meta-capi] chunk of ${chunk.length} events failed: ${message}`);

    // RPC rather than a read-then-write: two overlapping ticks reading the same
    // retry_count would each write back the same +1 and a permanently-broken
    // row would never exhaust.
    const { error: retryError } = await supabase.rpc('increment_meta_capi_retry', {
      p_booking_ids: bookingIds,
      p_error_message: message,
      p_fbtrace_id: result.fbTraceId,
    });
    if (retryError) {
      console.error('[meta-capi] retry bookkeeping failed; rows stay pending:', retryError);
    }
  }

  console.log(
    `[meta-capi] scanned=${rows.length} sent=${sent} skipped=${skippedRows.length} failed=${failed}`,
  );
  return NextResponse.json({ scanned: rows.length, sent, skipped: skippedRows.length, failed });
}
