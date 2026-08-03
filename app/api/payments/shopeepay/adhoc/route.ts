import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/utils/supabase/admin';
import { createOrder } from '@/lib/shopeepay/client';
import { shopeepayConfig } from '@/lib/shopeepay/config';
import { LINK_CODE_PATTERN, type PaymentLinkRow } from '@/lib/shopeepay/adhocLink';

/**
 * POST /api/payments/shopeepay/adhoc
 *
 * Mints a Checkout-with-ShopeePay order for a staff-issued ad-hoc payment link
 * (event/party deposit, custom quote) — anything that is not a club rental.
 *
 * WHY THIS IS A SEPARATE ROUTE from /api/payments/shopeepay/create:
 *
 *  1. Auth. `create` verifies the bearer token ONLY when the caller supplies
 *     `validity_period_seconds`, because customers hit it unauthenticated with
 *     just a rental_code. There is no customer-initiated ad-hoc flow, so this
 *     route requires the bearer on line one, unconditionally. Two auth regimes
 *     in one handler is exactly the kind of conditional that gets a case wrong.
 *
 *  2. Pricing. `create` derives its amount from loadOrderChargeContext(order_id)
 *     and carries ~110 lines of rental state-machine guards. Threading an ad-hoc
 *     subject through would make every one of those conditional, and a mistake
 *     there is a regression on live customer money.
 *
 * THE AMOUNT IS NOT A WIRE PARAMETER. The caller passes only `link_code`; the
 * amount is re-read from public.payment_links here. This preserves the rental
 * path's property that the gateway amount always comes from this app's own DB
 * read, so a compromised BACKOFFICE_API_TOKEN cannot mint an arbitrary charge.
 */

interface AdhocBody {
  link_code?: string;
  platform_type?: 'mweb' | 'pc';
  validity_period_seconds?: number;
}

const MIN_VALIDITY_PERIOD_SECONDS = 60;
const MAX_VALIDITY_PERIOD_SECONDS = 86400; // ShopeePay's documented upper bound.
const BACKOFFICE_TOKEN_MIN_LENGTH = 32;

/**
 * Constant-time bearer compare. Same shape as the helper in
 * app/api/payments/shopeepay/create/route.ts, but unconditional: a missing env
 * var is a hard 503 here (as in the refund route) because this route has no
 * customer path that could legitimately proceed without it.
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
        'Ad-hoc payment links are not configured. Set BACKOFFICE_API_TOKEN (32+ chars) in this environment.',
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
  const tokenResult = verifyBearerToken(request);
  if (!tokenResult.ok) {
    return NextResponse.json({ error: tokenResult.message }, { status: tokenResult.status });
  }

  let body: AdhocBody;
  try {
    body = (await request.json()) as AdhocBody;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { link_code, platform_type = 'mweb', validity_period_seconds } = body;

  if (!link_code || typeof link_code !== 'string' || !LINK_CODE_PATTERN.test(link_code)) {
    return NextResponse.json({ error: 'link_code is required (PL-YYYYMMDD-XXXX)' }, { status: 400 });
  }
  if (platform_type !== 'mweb' && platform_type !== 'pc') {
    return NextResponse.json({ error: 'Invalid platform_type' }, { status: 400 });
  }
  if (
    !Number.isInteger(validity_period_seconds) ||
    (validity_period_seconds as number) < MIN_VALIDITY_PERIOD_SECONDS ||
    (validity_period_seconds as number) > MAX_VALIDITY_PERIOD_SECONDS
  ) {
    return NextResponse.json(
      {
        error: `validity_period_seconds must be an integer in [${MIN_VALIDITY_PERIOD_SECONDS}, ${MAX_VALIDITY_PERIOD_SECONDS}]`,
      },
      { status: 400 }
    );
  }
  const validity = validity_period_seconds as number;

  const supabase = createAdminClient();

  const baseUrl = getBaseUrl();
  if (!baseUrl) {
    console.error('[ShopeePay/adhoc] base URL is not resolvable');
    return NextResponse.json({ error: 'Server misconfiguration' }, { status: 500 });
  }

  const expiresAtIso = new Date(Date.now() + validity * 1000).toISOString();

  // Reserve the mint AND load the row in a single guarded statement.
  //
  // Doing the draft -> pending flip FIRST (rather than select-then-update) means
  // a 'draft' row can never carry a live transaction, which removes a whole cell
  // from the state machine. It also makes double-minting impossible: the second
  // concurrent caller matches zero rows because status is no longer 'draft'.
  const { data: linkData, error: claimError } = await supabase
    .from('payment_links')
    .update({ status: 'pending', expires_at: expiresAtIso })
    .eq('link_code', link_code)
    .eq('status', 'draft')
    .select('*')
    .maybeSingle();

  if (claimError) {
    console.error('[ShopeePay/adhoc] claim update failed:', claimError);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }

  if (!linkData) {
    // Distinguish "no such link" from "already minted / cancelled / paid".
    const { data: existing } = await supabase
      .from('payment_links')
      .select('status')
      .eq('link_code', link_code)
      .maybeSingle();

    if (!existing) {
      return NextResponse.json({ error: 'Payment link not found' }, { status: 404 });
    }
    return NextResponse.json(
      {
        error: `Payment link is '${(existing as { status: string }).status}' and cannot be minted`,
        current_status: (existing as { status: string }).status,
      },
      { status: 409 }
    );
  }

  const link = linkData as PaymentLinkRow;

  // The DB is the price authority — see the header comment.
  const amountSatang = link.amount;
  if (!Number.isFinite(amountSatang) || amountSatang <= 0) {
    console.error('[ShopeePay/adhoc] link has an invalid amount:', link.link_code, amountSatang);
    return NextResponse.json({ error: 'Payment link has an invalid amount' }, { status: 500 });
  }

  // ShopeePay enforces global uniqueness on payment_reference_id and rejects a
  // duplicate with errcode=11, so the base36 epoch suffix is required, not
  // cosmetic. '-pl-' vs the rental path's '-cr-' keeps the two namespaces
  // distinguishable in ShopeePay's merchant console.
  const epoch = Date.now();
  const paymentReferenceId = `LENGOLF-${link.link_code}-${epoch.toString(36)}`;
  const requestId = `lengolf-pl-${link.link_code}-${epoch}`;

  const returnUrl = `${baseUrl}/payment/result?ref=${link.link_code}`;

  // Insert the audit row BEFORE calling the gateway so there is always a paper
  // trail even if the call fails or times out — same ordering as the rental path.
  const { data: txnRow, error: txnInsertError } = await supabase
    .from('payment_transactions')
    .insert({
      payment_link_id: link.id,
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
    // 23505 on payment_txn_one_live_per_link_uidx means another live charge
    // already exists for this link. The claim above should have prevented it,
    // but the index is the real invariant and this is its surfaced form.
    if ((txnInsertError as { code?: string } | null)?.code === '23505') {
      return NextResponse.json(
        { error: 'A payment order already exists for this link' },
        { status: 409 }
      );
    }
    console.error('[ShopeePay/adhoc] payment_transactions insert failed:', txnInsertError);
    return NextResponse.json({ error: 'Failed to record payment intent' }, { status: 500 });
  }

  const additionalInfo = JSON.stringify({
    field1: 'Payment Link',
    field2: link.link_code,
    field3: link.customer_name?.slice(0, 100) ?? null,
  });

  /** Roll the link back out of 'pending' when the gateway leg fails. */
  const failLink = async (txnUpdates: Record<string, unknown>) => {
    // Re-assert the live-status filter at write time: a 'success' txn must never
    // be flipped to failed. Same rule as supersede-payment.ts in lengolf-forms.
    await supabase
      .from('payment_transactions')
      .update(txnUpdates)
      .eq('id', txnRow.id)
      .in('status', ['pending', 'redirected']);
    await supabase
      .from('payment_links')
      .update({ status: 'failed' })
      .eq('id', link.id)
      .eq('status', 'pending');
  };

  let shopeeResp;
  try {
    shopeeResp = await createOrder({
      request_id: requestId,
      payment_reference_id: paymentReferenceId,
      amount: amountSatang,
      currency: 'THB',
      return_url: returnUrl,
      platform_type,
      validity_period: validity,
      additional_info: additionalInfo,
    });
  } catch (e) {
    console.error('[ShopeePay/adhoc] gateway call failed:', e);
    await failLink({
      status: 'failed',
      error_message: (e as Error).message?.slice(0, 500) ?? 'unknown',
    });
    return NextResponse.json(
      { error: 'Payment gateway is not reachable. Please try again.' },
      { status: 502 }
    );
  }

  if (shopeeResp.errcode !== 0 || !shopeeResp.redirect_url_http) {
    console.error('[ShopeePay/adhoc] gateway returned error:', shopeeResp);
    await failLink({
      status: 'failed',
      error_code: shopeeResp.errcode,
      error_message: shopeeResp.debug_msg?.slice(0, 500) ?? null,
      raw_create_response: shopeeResp as unknown as Record<string, unknown>,
    });
    return NextResponse.json(
      { error: 'Payment gateway rejected the order. Please try again.' },
      { status: 502 }
    );
  }

  const { error: txnUpdateError } = await supabase
    .from('payment_transactions')
    .update({
      redirect_url: shopeeResp.redirect_url_http,
      raw_create_response: shopeeResp as unknown as Record<string, unknown>,
    })
    .eq('id', txnRow.id);

  if (txnUpdateError) {
    console.error('[ShopeePay/adhoc] post-create update failed:', txnUpdateError);
    // Non-fatal — we still have a redirect URL. But /p/<code> resolves via
    // redirect_url, so log loudly: without it the short link degrades to
    // "missing" until the link is re-minted.
  }

  return NextResponse.json({
    success: true,
    redirect_url: shopeeResp.redirect_url_http,
    short_url: `${baseUrl}/p/${link.link_code}`,
    payment_reference_id: paymentReferenceId,
    expires_at: expiresAtIso,
    gateway_environment: shopeepayConfig.isProductionEnv ? 'production' : 'staging',
  });
}
