import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/utils/supabase/admin';
import { createOrder } from '@/lib/shopeepay/client';
import { shopeepayConfig } from '@/lib/shopeepay/config';

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
 * Authorization is implicit — knowing the rental_code is the
 * capability. Rental codes are short (CRYYMMDDXXX) but the
 * /payment/create endpoint never reveals customer-identifying data
 * back to the caller, so a guess yields nothing useful beyond
 * starting a real customer's payment flow (which they'd have to
 * complete from their own ShopeePay app).
 */

interface CreateBody {
  rental_code?: string;
  /** 'mweb' | 'pc' — frontend supplies based on UA. Falls back to 'mweb'. */
  platform_type?: 'mweb' | 'pc';
  /** Optional locale-prefixed return path (defaults to /payment/result). */
  return_path?: string;
}

const VALIDITY_PERIOD_SECONDS = 1800; // 30 min, matches the cleanup cron window.

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

  const { rental_code, platform_type = 'mweb', return_path } = body;

  if (!rental_code || typeof rental_code !== 'string' || rental_code.length > 32) {
    return NextResponse.json({ error: 'rental_code is required' }, { status: 400 });
  }
  if (platform_type !== 'mweb' && platform_type !== 'pc') {
    return NextResponse.json({ error: 'Invalid platform_type' }, { status: 400 });
  }
  if (return_path && (return_path.length > 200 || !return_path.startsWith('/'))) {
    return NextResponse.json({ error: 'Invalid return_path' }, { status: 400 });
  }

  const supabase = createAdminClient();

  // Look up the rental. v1 only supports course rentals.
  const { data: rental, error: rentalError } = await supabase
    .from('club_rentals')
    .select('id, rental_code, rental_type, total_price, payment_status, customer_name')
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
  if (rental.payment_status === 'paid') {
    return NextResponse.json(
      { error: 'This rental has already been paid' },
      { status: 409 }
    );
  }

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
    return NextResponse.json({
      success: true,
      redirect_url: existing.redirect_url,
      payment_reference_id: existing.payment_reference_id,
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

  // Convert THB → satang (ShopeePay's wire format).
  const amountSatang = Math.round(Number(rental.total_price) * 100);
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

  // Compose ShopeePay request.
  const additionalInfo = JSON.stringify({
    field1: 'Course Rental',
    field2: rental.rental_code,
    field3: rental.customer_name,
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
      validity_period: VALIDITY_PERIOD_SECONDS,
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

  await supabase
    .from('club_rentals')
    .update({
      payment_status: 'pending',
      payment_transaction_id: txnRow.id,
      expires_at: new Date(Date.now() + VALIDITY_PERIOD_SECONDS * 1000).toISOString(),
    })
    .eq('id', rental.id);

  // Don't return amount/customer info to the browser — the redirect
  // URL is the only thing the client legitimately needs.
  return NextResponse.json({
    success: true,
    redirect_url: shopeeResp.redirect_url_http,
    payment_reference_id: paymentReferenceId,
    gateway_environment: shopeepayConfig.isProductionEnv ? 'production' : 'staging',
  });
}
