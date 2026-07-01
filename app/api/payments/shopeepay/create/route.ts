import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/utils/supabase/admin';
import { createOrder } from '@/lib/shopeepay/client';
import { shopeepayConfig } from '@/lib/shopeepay/config';
import { applyOrderPaymentState, loadOrderChargeContext } from '@/lib/shopeepay/orderPayment';

/**
 * POST /api/payments/shopeepay/create
 *
 * Creates a Checkout-with-ShopeePay order for an existing course
 * club rental row, records a payment_transactions audit row, and
 * returns the redirect URL the frontend should send the customer to.
 *
 * Idempotent on (club_rental_id, status='pending'): if a pending
 * order already exists for the rental, return the existing
 * redirect_url instead of creating a duplicate at ShopeePay.
 *
 * Auth: server-only via SUPABASE_SERVICE_ROLE_KEY (createAdminClient).
 * Authorization is implicit for the customer flow — knowing the
 * rental_code is the capability. Rental codes are short
 * (CRYYMMDDXXX) but the /payment/create endpoint never reveals
 * customer-identifying data back to the caller, so a guess yields
 * nothing useful beyond starting a real customer's payment flow
 * (which they'd have to complete from their own ShopeePay app).
 *
 * Backoffice flow: callers may override the link validity window by
 * supplying `validity_period_seconds` AND a valid `Authorization:
 * Bearer ${BACKOFFICE_API_TOKEN}` header. Staff issuing links from
 * lengolf-forms use this path; customers use the default 30 min.
 */

interface CreateBody {
  rental_code?: string;
  /** 'mweb' | 'pc' — frontend supplies based on UA. Falls back to 'mweb'. */
  platform_type?: 'mweb' | 'pc';
  /** Optional locale-prefixed return path (defaults to /payment/result). */
  return_path?: string;
  /**
   * Optional link-validity override in seconds. Requires Bearer auth.
   * Range [60, 86400]. Customer flow omits this and gets the default.
   */
  validity_period_seconds?: number;
}

const DEFAULT_VALIDITY_PERIOD_SECONDS = 1800; // 30 min, matches the cleanup cron window.
const MIN_VALIDITY_PERIOD_SECONDS = 60;
const MAX_VALIDITY_PERIOD_SECONDS = 86400; // ShopeePay's documented upper bound.
const BACKOFFICE_TOKEN_MIN_LENGTH = 32;

/**
 * Constant-time bearer-token compare, mirroring the helper in
 * app/api/payments/shopeepay/refund/route.ts. Kept in-file (rather
 * than extracted to a shared module) because the two routes have
 * subtly different misconfiguration semantics — refund 503s when
 * the env var is missing because it's strictly a backoffice route,
 * but here a missing env var only matters when a caller is trying
 * to use the bearer path.
 */
function verifyBearerToken(
  request: NextRequest
): { ok: true } | { ok: false; status: number; message: string } {
  const expected = process.env.BACKOFFICE_API_TOKEN;
  if (!expected || expected.length < BACKOFFICE_TOKEN_MIN_LENGTH) {
    return {
      ok: false,
      status: 503,
      message:
        'Backoffice payment-link path is not configured. Set BACKOFFICE_API_TOKEN (32+ chars) in this environment.',
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
  let diff = 0;
  for (let i = 0; i < expected.length; i++) {
    diff |= presented.charCodeAt(i) ^ expected.charCodeAt(i);
  }
  if (diff !== 0) {
    return { ok: false, status: 401, message: 'Invalid token' };
  }
  return { ok: true };
}

function getBaseUrl(): string {
  if (process.env.VERCEL_ENV && process.env.VERCEL_ENV !== 'development' && process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL}`;
  }
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.NEXTAUTH_URL || '';
  if (baseUrl && !baseUrl.startsWith('http')) return `http://${baseUrl}`;
  if (!baseUrl && process.env.NODE_ENV !== 'production') return 'http://localhost:3000';
  return baseUrl;
}

export async function POST(request: NextRequest) {
  let body: CreateBody;
  try {
    body = (await request.json()) as CreateBody;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { rental_code, platform_type = 'mweb', return_path, validity_period_seconds } = body;

  if (!rental_code || typeof rental_code !== 'string' || rental_code.length > 32) {
    return NextResponse.json({ error: 'rental_code is required' }, { status: 400 });
  }
  if (platform_type !== 'mweb' && platform_type !== 'pc') {
    return NextResponse.json({ error: 'Invalid platform_type' }, { status: 400 });
  }
  if (return_path && (return_path.length > 200 || !return_path.startsWith('/'))) {
    return NextResponse.json({ error: 'Invalid return_path' }, { status: 400 });
  }

  // Resolve the link validity. Customer flow omits the field and gets
  // the 30-min default. Backoffice flow (lengolf-forms) supplies it and
  // must authenticate via bearer token first.
  let effectiveValidity = DEFAULT_VALIDITY_PERIOD_SECONDS;
  if (validity_period_seconds !== undefined) {
    const tokenResult = verifyBearerToken(request);
    if (!tokenResult.ok) {
      return NextResponse.json({ error: tokenResult.message }, { status: tokenResult.status });
    }
    if (
      !Number.isInteger(validity_period_seconds) ||
      validity_period_seconds < MIN_VALIDITY_PERIOD_SECONDS ||
      validity_period_seconds > MAX_VALIDITY_PERIOD_SECONDS
    ) {
      return NextResponse.json(
        {
          error: `validity_period_seconds must be an integer in [${MIN_VALIDITY_PERIOD_SECONDS}, ${MAX_VALIDITY_PERIOD_SECONDS}]`,
        },
        { status: 400 }
      );
    }
    effectiveValidity = validity_period_seconds;
  }

  const supabase = createAdminClient();

  // Look up the rental. v1 only supports course rentals.
  //
  // `status` + `expires_at` are read together so the reused-path response
  // below can use the rental's own expiry without a second query. That
  // dodges a race with `shopeepay_expire_unpaid_rentals()` (pg_cron, runs
  // every minute) which sets `expires_at=NULL` + `status='cancelled'` +
  // flips the matching `payment_transactions.status` to 'failed' in one
  // transaction.
  const { data: rental, error: rentalError } = await supabase
    .from('club_rentals')
    // customer_name is ORDER-canonical (a DROP column on lines) — read from the
    // order header below (via order_id) for the payment metadata field.
    .select('id, rental_code, rental_type, status, total_price, payment_status, expires_at, order_id')
    .eq('rental_code', rental_code)
    .single();

  if (rentalError || !rental) {
    return NextResponse.json({ error: 'Rental not found' }, { status: 404 });
  }
  if (rental.rental_type !== 'course') {
    return NextResponse.json(
      { error: 'Online payment is not available for this rental type' },
      { status: 400 }
    );
  }
  // State-machine guard: a rental that has moved out of the 'reserved'
  // lifecycle cannot be re-billed. Catches the cleanup-cron race (where
  // a rental is auto-cancelled before the customer pays) and the staff
  // who-cancelled-then-tried-to-resend case.
  if (rental.status !== 'reserved') {
    return NextResponse.json(
      { error: `Cannot create payment link for rental in '${rental.status}' state` },
      { status: 409 }
    );
  }
  if (rental.payment_status === 'paid') {
    return NextResponse.json(
      { error: 'This rental has already been paid' },
      { status: 409 }
    );
  }
  // partially_refunded / refunded are terminal on the payment side — even
  // if the lifecycle is still 'reserved' for some reason, do not let staff
  // mint another payment link against a refunded rental.
  if (rental.payment_status === 'refunded' || rental.payment_status === 'partially_refunded') {
    return NextResponse.json(
      { error: 'This rental has been refunded and cannot be re-billed' },
      { status: 409 }
    );
  }

  // Course-rental payment is ORDER-level: one ShopeePay charge covers the whole
  // order (all its lines), so charge order.total_price — not just this bearer
  // line. Order-less rentals (legacy /api/clubs/reserve, order_id NULL) charge
  // their own total. The customer-facing ref stays the bearer line's rental_code.
  const orderCtx = await loadOrderChargeContext(supabase, rental.order_id);
  if (orderCtx && orderCtx.paymentStatus === 'paid') {
    return NextResponse.json({ error: 'This rental has already been paid' }, { status: 409 });
  }
  const chargeTotal = orderCtx ? orderCtx.totalPrice : Number(rental.total_price);

  // Idempotency: reuse the most recent pending order for this rental
  // if one already exists. This matters when the customer hits the
  // back button or the /payment/start page re-runs.
  const { data: existing } = await supabase
    .from('payment_transactions')
    .select('id, payment_reference_id, redirect_url, status')
    .eq('club_rental_id', rental.id)
    .eq('status', 'pending')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existing && existing.redirect_url) {
    // Use rental.expires_at as read above — the prior code re-SELECTed
    // expires_at here, which opened a race window with the cleanup cron
    // that nulls expires_at while we're between queries. Reading once
    // up-front + the status-guard above eliminates that.
    // We do NOT extend the window here — the original validity wins;
    // that's the booking-app's idempotency contract.
    return NextResponse.json({
      success: true,
      redirect_url: existing.redirect_url,
      payment_reference_id: existing.payment_reference_id,
      expires_at: rental.expires_at,
      reused: true,
    });
  }

  // Build a fresh request_id every call, but keep payment_reference_id
  // tied to the rental — ShopeePay enforces uniqueness on
  // payment_reference_id, so a retry must use a NEW value if the
  // previous attempt was abandoned. We append a short suffix when
  // ShopeePay rejects with errcode=11 (duplicate).
  const epoch = Date.now();
  const paymentReferenceId = `LENGOLF-${rental.rental_code}-${epoch.toString(36)}`;
  const requestId = `lengolf-cr-${rental.rental_code}-${epoch}`;

  const baseUrl = getBaseUrl();
  if (!baseUrl) {
    console.error('[ShopeePay/create] base URL is not resolvable');
    return NextResponse.json({ error: 'Server misconfiguration' }, { status: 500 });
  }

  const returnUrl = `${baseUrl}${return_path || `/payment/result`}?ref=${rental.rental_code}`;

  // Convert THB → satang (ShopeePay's wire format). chargeTotal is the order
  // total for order-linked rentals, else this single line's total.
  const amountSatang = Math.round(chargeTotal * 100);
  if (!Number.isFinite(amountSatang) || amountSatang <= 0) {
    return NextResponse.json({ error: 'Rental has an invalid price' }, { status: 500 });
  }

  // Insert the audit row BEFORE calling ShopeePay so we always have
  // a paper trail even if the gateway call fails or times out.
  const { data: txnRow, error: txnInsertError } = await supabase
    .from('payment_transactions')
    .insert({
      club_rental_id: rental.id,
      gateway: 'shopeepay',
      payment_reference_id: paymentReferenceId,
      request_id: requestId,
      amount: amountSatang,
      currency: 'THB',
      status: 'pending',
      return_url: returnUrl,
      platform_type,
    })
    .select('id')
    .single();

  if (txnInsertError || !txnRow) {
    console.error('[ShopeePay/create] payment_transactions insert failed:', txnInsertError);
    return NextResponse.json({ error: 'Failed to record payment intent' }, { status: 500 });
  }

  // customer_name is order-canonical — read it off the order header for the
  // payment metadata (course rentals are always order-backed).
  let orderCustomerName: string | null = null;
  if (rental.order_id) {
    const { data: o } = await supabase
      .from('club_rental_orders')
      .select('customer_name')
      .eq('id', rental.order_id)
      .maybeSingle();
    orderCustomerName = o?.customer_name ?? null;
  }

  // Compose ShopeePay request.
  const additionalInfo = JSON.stringify({
    field1: 'Course Rental',
    field2: rental.rental_code,
    field3: orderCustomerName,
  });

  let shopeeResp;
  try {
    shopeeResp = await createOrder({
      request_id: requestId,
      payment_reference_id: paymentReferenceId,
      amount: amountSatang,
      currency: 'THB',
      return_url: returnUrl,
      platform_type,
      validity_period: effectiveValidity,
      additional_info: additionalInfo,
    });
  } catch (e) {
    console.error('[ShopeePay/create] gateway call failed:', e);
    await supabase
      .from('payment_transactions')
      .update({
        status: 'failed',
        error_message: (e as Error).message?.slice(0, 500) ?? 'unknown',
      })
      .eq('id', txnRow.id);
    return NextResponse.json(
      { error: 'Payment gateway is not reachable. Please try again.' },
      { status: 502 }
    );
  }

  if (shopeeResp.errcode !== 0 || !shopeeResp.redirect_url_http) {
    console.error('[ShopeePay/create] gateway returned error:', shopeeResp);
    await supabase
      .from('payment_transactions')
      .update({
        status: 'failed',
        error_code: shopeeResp.errcode,
        error_message: shopeeResp.debug_msg?.slice(0, 500) ?? null,
        raw_create_response: shopeeResp as unknown as Record<string, unknown>,
      })
      .eq('id', txnRow.id);
    return NextResponse.json(
      { error: 'Payment gateway rejected the order. Please try again.' },
      { status: 502 }
    );
  }

  // Persist redirect_url + raw response for audit. Also link the rental
  // back to this transaction so /payment/result can find it via either side.
  const { error: txnUpdateError } = await supabase
    .from('payment_transactions')
    .update({
      redirect_url: shopeeResp.redirect_url_http,
      raw_create_response: shopeeResp as unknown as Record<string, unknown>,
    })
    .eq('id', txnRow.id);

  if (txnUpdateError) {
    console.error('[ShopeePay/create] post-create update failed:', txnUpdateError);
    // Non-fatal — we still got a redirect URL. Continue.
  }

  const expiresAtIso = new Date(Date.now() + effectiveValidity * 1000).toISOString();
  if (orderCtx) {
    // Order-level: mark the header + every line pending (one payment per order),
    // so the expire cron clears the whole order together and forms reads consistent.
    await applyOrderPaymentState(supabase, orderCtx.orderId, {
      payment_status: 'pending',
      payment_transaction_id: txnRow.id,
      expires_at: expiresAtIso,
    });
  } else {
    await supabase
      .from('club_rentals')
      .update({
        payment_status: 'pending',
        payment_transaction_id: txnRow.id,
        expires_at: expiresAtIso,
      })
      .eq('id', rental.id);
  }

  // Don't return amount/customer info to the browser — the redirect
  // URL is the only thing the client legitimately needs.
  return NextResponse.json({
    success: true,
    redirect_url: shopeeResp.redirect_url_http,
    payment_reference_id: paymentReferenceId,
    expires_at: expiresAtIso,
    gateway_environment: shopeepayConfig.isProductionEnv ? 'production' : 'staging',
  });
}
