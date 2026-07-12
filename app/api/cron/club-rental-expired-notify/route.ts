/**
 * GET /api/cron/club-rental-expired-notify
 *
 * Staff LINE notification for course-rental orders auto-cancelled by the
 * expiry function. `shopeepay_expire_unpaid_rentals()` (minute pg_cron,
 * pure SQL) cancels unpaid orders silently — this route is the notify half:
 * a second minute pg_cron job (`club-rental-expired-notify-1min`,
 * net.http_get + Bearer CRON_API_KEY — same auth as the three existing
 * booking.len.golf pg_cron jobs, e.g. process-review-requests) sweeps
 * orders with `expired_at` stamped and `expired_notify_sent_at` unset and
 * sends one staff-group ping per order.
 *
 * Idempotency: claim-then-send on `expired_notify_sent_at` — the claim is a
 * guarded UPDATE (`IS NULL`), so overlapping ticks can't double-send; a LINE
 * push failure rolls the claim back so the next tick retries.
 *
 * `expired_at` is stamped ONLY by the expiry function's header-cancel UPDATE,
 * so staff cancels / refunds can never surface here. Test orders
 * (`is_test = true`) are skipped. Lookback is 24h: rows older than that (e.g.
 * after a long outage of this job) are intentionally left silent rather than
 * spamming stale pings.
 */
import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/utils/supabase/server';
import { composeOrderExpiredLineMessage } from '@/lib/club-rental/lineMessage';

export const dynamic = 'force-dynamic';

const BATCH_LIMIT = 20;
const LOOKBACK_MS = 24 * 60 * 60 * 1000;
const CRON_SECRET_MIN_LENGTH = 32;

const IS_PROD_ENV = process.env.VERCEL_ENV === 'production';

function getBaseUrl(): string {
  if (process.env.VERCEL_ENV && process.env.VERCEL_ENV !== 'development' && process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL}`;
  }
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.NEXTAUTH_URL || '';
  if (baseUrl && !baseUrl.startsWith('http')) return `http://${baseUrl}`;
  if (!baseUrl && process.env.NODE_ENV !== 'production') return 'http://localhost:3000';
  return baseUrl;
}

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

interface ExpiredOrderRow {
  id: string;
  order_code: string;
  customer_name: string;
  customer_phone: string | null;
  customer_email: string | null;
  contact_preference: string | null;
  start_date: string | null;
  end_date: string | null;
  duration_days: number | null;
  delivery_requested: boolean | null;
  delivery_address: string | null;
  delivery_time: string | null;
  return_time: string | null;
  add_ons: unknown;
  total_price: number | string;
  notes: string | null;
}

export async function GET(request: NextRequest) {
  const auth = verifyCronSecret(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  }

  const supabase = createServerClient();
  const lookbackIso = new Date(Date.now() - LOOKBACK_MS).toISOString();

  const { data: orders, error: listError } = await supabase
    .from('club_rental_orders')
    .select(
      'id, order_code, customer_name, customer_phone, customer_email, contact_preference, start_date, end_date, duration_days, delivery_requested, delivery_address, delivery_time, return_time, add_ons, total_price, notes',
    )
    .not('expired_at', 'is', null)
    .is('expired_notify_sent_at', null)
    .not('is_test', 'is', true)
    .gte('expired_at', lookbackIso)
    .order('expired_at', { ascending: true })
    .limit(BATCH_LIMIT);

  if (listError) {
    console.error('[expired-notify] candidate query failed:', listError);
    return NextResponse.json({ error: 'Candidate query failed' }, { status: 500 });
  }

  const candidates = (orders ?? []) as ExpiredOrderRow[];
  let notified = 0;
  let skipped = 0;
  let failed = 0;

  const baseUrl = getBaseUrl();

  for (const order of candidates) {
    // Claim BEFORE sending — a concurrent tick loses the guarded UPDATE and
    // skips, so the staff group never gets a duplicate ping.
    const { data: claimed, error: claimError } = await supabase
      .from('club_rental_orders')
      .update({ expired_notify_sent_at: new Date().toISOString() })
      .eq('id', order.id)
      .is('expired_notify_sent_at', null)
      .select('id');

    if (claimError) {
      console.error(`[expired-notify] claim failed for ${order.order_code}:`, claimError);
      failed += 1;
      continue;
    }
    if (!claimed || claimed.length === 0) {
      skipped += 1;
      continue;
    }

    try {
      const { data: lines, error: linesError } = await supabase
        .from('club_rentals')
        .select('rental_club_sets ( name, tier, gender )')
        .eq('order_id', order.id);
      if (linesError) {
        // Degrade to a set-less ping rather than dropping the notification.
        console.warn(`[expired-notify] lines load failed for ${order.order_code}:`, linesError);
      }

      type SetRef = { name: string; tier: string; gender: string } | null;
      const sets = ((lines ?? []) as unknown as Array<{ rental_club_sets: SetRef }>).map((l) => ({
        name: l.rental_club_sets?.name ?? '?',
        tier: l.rental_club_sets?.tier ?? 'premium',
        gender: l.rental_club_sets?.gender ?? 'mens',
      }));

      const message = composeOrderExpiredLineMessage({
        order_code: order.order_code,
        customer_name: order.customer_name,
        customer_phone: order.customer_phone,
        customer_email: order.customer_email,
        contact_preference: order.contact_preference,
        start_date: order.start_date,
        end_date: order.end_date,
        duration_days: order.duration_days,
        delivery_requested: order.delivery_requested,
        delivery_address: order.delivery_address,
        delivery_time: order.delivery_time,
        return_time: order.return_time,
        sets,
        add_ons: order.add_ons,
        total_price: order.total_price,
        notes: order.notes,
        uatPrefix: !IS_PROD_ENV,
      });

      const res = await fetch(`${baseUrl}/api/notifications/line`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message }),
      });
      if (!res.ok) {
        throw new Error(`LINE notify responded ${res.status}`);
      }
      notified += 1;
    } catch (err) {
      console.error(`[expired-notify] send failed for ${order.order_code}, rolling back claim:`, err);
      failed += 1;
      // Roll the claim back so the next tick retries this order.
      const { error: rollbackError } = await supabase
        .from('club_rental_orders')
        .update({ expired_notify_sent_at: null })
        .eq('id', order.id);
      if (rollbackError) {
        console.error(
          `[expired-notify] claim rollback failed for ${order.order_code} — notification is lost:`,
          rollbackError,
        );
      }
    }
  }

  return NextResponse.json({ checked: candidates.length, notified, skipped, failed });
}
