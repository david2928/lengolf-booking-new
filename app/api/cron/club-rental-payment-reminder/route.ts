/**
 * GET /api/cron/club-rental-payment-reminder
 *
 * The T+30min abandoned-payment nudge. Online course-rental orders get a
 * 2-hour payment window; a minute pg_cron job (`club-rental-payment-reminder-1min`,
 * net.http_get + Bearer CRON_API_KEY — same auth as the other booking.len.golf
 * jobs) calls this route, which finds orders still unpaid ~30 min after
 * creation and sends:
 *   1. ONE customer reminder email with a /payment/start link (the page mints
 *      a fresh gateway link at click time, so nothing in the email can go
 *      stale before the reservation itself expires), and
 *   2. ONE staff LINE ping — the human-recovery hook (staff chasing via the
 *      customer's preferred channel converts better than any email).
 *
 * Idempotency: claim-then-send on `payment_reminder_sent_at` (guarded
 * UPDATE ... IS NULL). The claim is rolled back only when NOTHING went out
 * (email skipped/failed AND LINE failed) so the next tick retries; a partial
 * success keeps the claim — we never send a customer two reminder emails.
 *
 * Scope guards: online orders only (`payment_method_chosen='online_shopeepay'`),
 * `is_test` skipped, reservation must still have ≥10 min of life left (a
 * reminder that lands as the window slams shut is worse than none), and a
 * 24h creation lookback so a long job outage can't replay history.
 */
import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/utils/supabase/server';
import { composeOrderPaymentReminderLineMessage } from '@/lib/club-rental/lineMessage';
import { sendCourseRentalPaymentReminderEmail, resolveEmailLocale } from '@/lib/emailService';

export const dynamic = 'force-dynamic';
// Up to BATCH_LIMIT sequential email + LINE sends per tick — keep comfortably
// inside the function's wall clock. Minute cadence drains any backlog.
export const maxDuration = 60;

const BATCH_LIMIT = 5;
const REMIND_AFTER_MS = 30 * 60 * 1000;
const MIN_WINDOW_LEFT_MS = 10 * 60 * 1000;
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

interface ReminderOrderRow {
  id: string;
  order_code: string;
  customer_name: string;
  customer_phone: string | null;
  customer_email: string | null;
  contact_preference: string | null;
  language: string | null;
  start_date: string | null;
  end_date: string | null;
  duration_days: number | null;
  total_price: number | string;
  expires_at: string;
}

export async function GET(request: NextRequest) {
  const auth = verifyCronSecret(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  }

  const supabase = createServerClient();
  const now = Date.now();

  const { data: orders, error: listError } = await supabase
    .from('club_rental_orders')
    .select(
      'id, order_code, customer_name, customer_phone, customer_email, contact_preference, language, start_date, end_date, duration_days, total_price, expires_at',
    )
    .eq('status', 'reserved')
    .eq('payment_status', 'pending')
    .eq('payment_method_chosen', 'online_shopeepay')
    // WEBSITE-checkout orders only: both online write paths always stamp
    // `language`; forms/staff orders never do (verified live: 37 staff orders
    // carry online_shopeepay — a staff-issued 24h payment link must NOT get a
    // "your payment didn't go through" email at T+30min; that cohort's
    // recovery runs through the staff LINE chat). Also makes order.language
    // always present for the email locale below.
    .not('language', 'is', null)
    .not('is_test', 'is', true)
    .is('payment_reminder_sent_at', null)
    .not('expires_at', 'is', null)
    .gt('expires_at', new Date(now + MIN_WINDOW_LEFT_MS).toISOString())
    .lte('created_at', new Date(now - REMIND_AFTER_MS).toISOString())
    .gte('created_at', new Date(now - LOOKBACK_MS).toISOString())
    .order('created_at', { ascending: true })
    .limit(BATCH_LIMIT);

  if (listError) {
    console.error('[payment-reminder] candidate query failed:', listError);
    return NextResponse.json({ error: 'Candidate query failed' }, { status: 500 });
  }

  const candidates = (orders ?? []) as ReminderOrderRow[];
  let reminded = 0;
  let skipped = 0;
  let failed = 0;

  const baseUrl = getBaseUrl();

  for (const order of candidates) {
    // Claim BEFORE sending — a concurrent tick loses the guarded UPDATE and
    // skips, so the customer never gets a duplicate reminder. The claim also
    // re-verifies reserved+pending: a slow payer can complete payment (webhook
    // flips the header to paid) between the candidate SELECT and this claim —
    // sequential SMTP sends earlier in the batch make that window real — and a
    // just-paid customer must never get a "payment didn't go through" email.
    const { data: claimed, error: claimError } = await supabase
      .from('club_rental_orders')
      .update({ payment_reminder_sent_at: new Date().toISOString() })
      .eq('id', order.id)
      .eq('status', 'reserved')
      .eq('payment_status', 'pending')
      .is('payment_reminder_sent_at', null)
      .select('id');

    if (claimError) {
      console.error(`[payment-reminder] claim failed for ${order.order_code}:`, claimError);
      failed += 1;
      continue;
    }
    if (!claimed || claimed.length === 0) {
      skipped += 1;
      continue;
    }

    let emailSent = false;
    let lineSent = false;
    try {
      const { data: lines, error: linesError } = await supabase
        .from('club_rentals')
        .select('rental_code, created_at, status, rental_club_sets ( name, tier, gender )')
        .eq('order_id', order.id)
        .order('created_at', { ascending: true });
      if (linesError) {
        console.warn(`[payment-reminder] lines load failed for ${order.order_code}:`, linesError);
      }

      type SetRef = { name: string; tier: string; gender: string } | null;
      type LineRow = { rental_code: string; status: string; rental_club_sets: SetRef };
      const lineRows = ((lines ?? []) as unknown as LineRow[]).filter(
        l => l.status === 'reserved',
      );
      if (lineRows.length === 0) {
        // Order drifted (e.g. cancelled between query and claim) — release
        // the claim untouched-looking rather than reminding about nothing.
        console.warn(`[payment-reminder] no reserved lines for ${order.order_code}, releasing claim`);
        await supabase
          .from('club_rental_orders')
          .update({ payment_reminder_sent_at: null })
          .eq('id', order.id);
        skipped += 1;
        continue;
      }
      const sets = lineRows.map(l => ({
        name: l.rental_club_sets?.name ?? '?',
        tier: l.rental_club_sets?.tier ?? 'premium',
        gender: l.rental_club_sets?.gender ?? 'mens',
      }));

      // /payment/start mints a fresh gateway link at click time — any of the
      // order's line codes resolves to the same order-total charge; use the
      // earliest-created reserved line (the canonical payment line).
      // Locale prefix: 'en' is unprefixed under localePrefix 'as-needed'.
      // The candidate query guarantees order.language is present (website
      // orders only), so the preferred_language fallback from PR #60 is
      // intentionally not needed here.
      const locale = resolveEmailLocale(order.language);
      const localePrefix = locale === 'en' ? '' : `/${locale}`;
      const paymentUrl = `https://booking.len.golf${localePrefix}/payment/start?ref=${encodeURIComponent(lineRows[0].rental_code)}`;

      if (order.customer_email) {
        emailSent = await sendCourseRentalPaymentReminderEmail({
          customerName: order.customer_name,
          email: order.customer_email,
          orderCode: order.order_code,
          setNames: sets.map(s => s.name),
          startDate: order.start_date ?? '',
          endDate: order.end_date ?? order.start_date ?? '',
          durationDays: order.duration_days ?? 1,
          totalPrice: Number(order.total_price) || 0,
          paymentUrl,
          expiresAt: order.expires_at,
          language: locale,
        });
      }

      const expiresAtDisplay = new Intl.DateTimeFormat('en-GB', {
        hour: '2-digit',
        minute: '2-digit',
        timeZone: 'Asia/Bangkok',
      }).format(new Date(order.expires_at));

      const message = composeOrderPaymentReminderLineMessage({
        order_code: order.order_code,
        customer_name: order.customer_name,
        customer_phone: order.customer_phone,
        customer_email: order.customer_email,
        contact_preference: order.contact_preference,
        sets,
        total_price: order.total_price,
        expiresAtDisplay,
        emailStatus: order.customer_email ? (emailSent ? 'sent' : 'failed') : 'none',
        uatPrefix: !IS_PROD_ENV,
      });

      try {
        const res = await fetch(`${baseUrl}/api/notifications/line`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message }),
        });
        lineSent = res.ok;
        if (!res.ok) {
          console.error(`[payment-reminder] LINE notify responded ${res.status} for ${order.order_code}`);
        }
      } catch (err) {
        console.error(`[payment-reminder] LINE notify error for ${order.order_code}:`, err);
      }

      if (emailSent || lineSent) {
        reminded += 1;
      } else {
        // Nothing reached anyone — roll the claim back so the next tick
        // retries (still inside the expiry window thanks to MIN_WINDOW_LEFT).
        throw new Error('neither email nor LINE went out');
      }
    } catch (err) {
      console.error(`[payment-reminder] send failed for ${order.order_code}, rolling back claim:`, err);
      failed += 1;
      const { error: rollbackError } = await supabase
        .from('club_rental_orders')
        .update({ payment_reminder_sent_at: null })
        .eq('id', order.id);
      if (rollbackError) {
        console.error(
          `[payment-reminder] claim rollback failed for ${order.order_code} — reminder is lost:`,
          rollbackError,
        );
      }
    }
  }

  return NextResponse.json({ checked: candidates.length, reminded, skipped, failed });
}
