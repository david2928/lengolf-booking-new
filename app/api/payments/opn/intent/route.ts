import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/utils/supabase/admin';
import { createCharge, retrieveCharge, OpnApiError } from '@/lib/opn/client';
import { classifyFailure, isChargeSuccessful, type OpnCharge } from '@/lib/opn/types';
import { processChargeResult } from '@/lib/opn/processChargeResult';
import { isValidLocale, routing } from '@/i18n/routing';
import { createHash } from 'crypto';

/**
 * POST /api/payments/opn/intent
 *
 * Body: { rental_code, token: 'tokn_*', locale? }
 *
 * Charges the tokenized card for a course rental. Auth model is
 * implicit-via-rental_code, identical to the ShopeePay create route.
 *
 * Double-charge protections (layered):
 *   1. The PayElement submit button disables while submitting.
 *   2. A pending txn with a charge already in flight is REUSED: a
 *      successful/pending probe short-circuits instead of charging the
 *      new token (covers back-button + second-tab cases).
 *   3. The Omise Idempotency-Key header — SHA256(rental_code:token) —
 *      makes a network-level retry of the same submission return the
 *      original charge instead of creating a second one.
 *
 * Sync (non-3DS) results are processed through the shared
 * processChargeResult writer so the rental flip + email + staff LINE
 * behave identically across intent/webhook/polling triggers.
 */

interface IntentBody {
  rental_code?: string;
  token?: string;
  locale?: string;
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
  let body: IntentBody;
  try {
    body = (await request.json()) as IntentBody;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { rental_code, token } = body;
  if (!rental_code || typeof rental_code !== 'string' || rental_code.length > 32) {
    return NextResponse.json({ error: 'rental_code is required' }, { status: 400 });
  }
  if (!token || typeof token !== 'string' || !token.startsWith('tokn_')) {
    return NextResponse.json({ error: 'Invalid token' }, { status: 400 });
  }
  // Locale only shapes the 3DS return URL — default locale is unprefixed
  // under next-intl's 'as-needed' strategy.
  const locale =
    body.locale && isValidLocale(body.locale) ? body.locale : routing.defaultLocale;
  const localePrefix = locale === routing.defaultLocale ? '' : `/${locale}`;

  const supabase = createAdminClient();

  const { data: rental, error: rentalErr } = await supabase
    .from('club_rentals')
    .select('id, rental_code, rental_type, status, total_price, payment_status, customer_name, expires_at')
    .eq('rental_code', rental_code)
    .single();

  if (rentalErr || !rental) {
    return NextResponse.json({ error: 'Rental not found' }, { status: 404 });
  }
  if (rental.rental_type !== 'course') {
    return NextResponse.json(
      { error: 'Online payment is not available for this rental type' },
      { status: 400 }
    );
  }
  // State-machine guard: a rental that has left the 'reserved' lifecycle
  // cannot be charged. Critically, the cleanup cron cancels by setting
  // status='cancelled' AND expires_at=NULL — so without this guard a
  // stale checkout tab passes the expiry check below and charges a
  // cancelled rental whose club set may already be rebooked.
  if (rental.status !== 'reserved') {
    return NextResponse.json(
      { error: `This reservation is no longer payable (${rental.status})` },
      { status: 409 }
    );
  }
  if (rental.payment_status === 'paid') {
    return NextResponse.json({ error: 'This rental has already been paid' }, { status: 409 });
  }
  if (rental.payment_status === 'refunded' || rental.payment_status === 'partially_refunded') {
    return NextResponse.json(
      { error: 'This rental has been refunded and cannot be re-billed' },
      { status: 409 }
    );
  }
  if (rental.expires_at && new Date(rental.expires_at) < new Date()) {
    return NextResponse.json({ error: 'This reservation has expired' }, { status: 410 });
  }

  const amountSatang = Math.round(Number(rental.total_price) * 100);
  if (!Number.isFinite(amountSatang) || amountSatang <= 0) {
    return NextResponse.json({ error: 'Rental has an invalid price' }, { status: 500 });
  }

  const baseUrl = getBaseUrl();
  if (!baseUrl) {
    return NextResponse.json({ error: 'Server misconfiguration' }, { status: 500 });
  }
  const returnUri = `${baseUrl}${localePrefix}/payment/return?ref=${rental.rental_code}`;

  // Pending-txn reuse: if a charge is already in flight for this rental
  // (3DS tab still open, double-submit, back button), resolve it instead
  // of creating a second charge against the customer's card.
  //
  // Dedup on the EXACT token, not just status='pending'. The Omise
  // idempotency key is SHA256(rental_code:token), so a given token always
  // maps to a single Omise charge. Keying the lookup on gateway_token_id
  // means a network-level retry of an already-completed request (or a
  // back-button resubmit carrying the same token) resolves the EXISTING
  // charge instead of inserting a second txn row — which would otherwise
  // end up sharing one gateway_charge_id and break the webhook's
  // single-row lookup (it 500s on a multi-row match → Omise retries
  // forever).
  const { data: priorTxn } = await supabase
    .from('payment_transactions')
    .select('id, gateway_charge_id')
    .eq('club_rental_id', rental.id)
    .eq('gateway', 'opn')
    .eq('gateway_token_id', token)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  let reuseTxnId: string | null = null;

  if (priorTxn) {
    if (priorTxn.gateway_charge_id) {
      // A charge already exists for this exact token. Resolve it — never
      // create a second charge for the same token.
      let prior: OpnCharge | null = null;
      try {
        prior = await retrieveCharge(priorTxn.gateway_charge_id);
      } catch (probeErr) {
        console.warn('[opn/intent] prior-charge probe failed:', probeErr);
        // Can't confirm the prior attempt — surface a soft failure rather
        // than risk a parallel charge on the same card.
        return NextResponse.json(
          {
            status: 'failed',
            failure_reason: 'unknown',
            error: 'Could not confirm your previous attempt. Please try again shortly.',
          },
          { status: 502 }
        );
      }

      if (isChargeSuccessful(prior)) {
        await processChargeResult(supabase, prior, { baseUrl });
        return NextResponse.json({ status: 'success', ref: rental.rental_code });
      }
      if (prior.status === 'pending' && prior.authorize_uri) {
        // 3DS still in flight — resume the SAME charge rather than stacking
        // a second authorization on the customer's card.
        return NextResponse.json({ status: 'requires_3ds', authorize_uri: prior.authorize_uri });
      }
      // Terminal failure for this token. Record it and report failure — a
      // retry needs a NEW card (new token, new row). Re-charging the same
      // token would just return this same failed charge.
      await processChargeResult(supabase, prior, { baseUrl });
      return NextResponse.json({
        status: 'failed',
        failure_reason: classifyFailure(prior.failure_code),
      });
    }
    // Row exists for this token but the gateway call never landed a charge
    // id (crash / timeout before createCharge returned). Reuse the row
    // rather than inserting a duplicate.
    reuseTxnId = priorTxn.id;
  }

  // Insert the audit row BEFORE calling Omise — paper trail even on
  // gateway timeout. payment_reference_id / request_id are NOT NULL
  // (shared schema with ShopeePay); Opn's webhook joins on
  // gateway_charge_id, so these exist for audit/uniqueness only.
  let txnId: string;
  if (reuseTxnId) {
    txnId = reuseTxnId;
  } else {
    const epoch = Date.now();
    const { data: txnRow, error: txnInsertErr } = await supabase
      .from('payment_transactions')
      .insert({
        club_rental_id: rental.id,
        gateway: 'opn',
        payment_reference_id: `LENGOLF-OPN-${rental.rental_code}-${epoch.toString(36)}`,
        request_id: `lengolf-opn-${rental.rental_code}-${epoch}`,
        gateway_token_id: token,
        amount: amountSatang,
        currency: 'THB',
        status: 'pending',
        return_url: returnUri,
      })
      .select('id')
      .single();

    if (txnInsertErr || !txnRow) {
      console.error('[opn/intent] txn insert failed:', txnInsertErr);
      return NextResponse.json({ error: 'Failed to record payment intent' }, { status: 500 });
    }
    txnId = txnRow.id;
  }

  const idempotencyKey = createHash('sha256').update(`${rental_code}:${token}`).digest('hex');

  let charge: OpnCharge;
  try {
    charge = await createCharge({
      amountSatang,
      currency: 'thb',
      cardToken: token,
      returnUri,
      metadata: { rental_code, txn_id: txnId },
      idempotencyKey,
    });
  } catch (e) {
    const msg =
      e instanceof OpnApiError ? e.message.slice(0, 500) : ((e as Error).message?.slice(0, 500) ?? 'unknown');
    console.error('[opn/intent] charge create failed:', e);
    await supabase
      .from('payment_transactions')
      .update({ status: 'failed', error_message: msg })
      .eq('id', txnId);
    return NextResponse.json(
      {
        status: 'failed',
        failure_reason: 'unknown',
        error: 'Payment gateway is not reachable. Please try again.',
      },
      { status: 502 }
    );
  }

  await supabase
    .from('payment_transactions')
    .update({
      gateway_charge_id: charge.id,
      is_3ds: charge.authorize_uri !== null,
      raw_create_response: charge as unknown as Record<string, unknown>,
    })
    .eq('id', txnId);

  await supabase
    .from('club_rentals')
    .update({
      payment_status: 'pending',
      payment_transaction_id: txnId,
      expires_at: new Date(Date.now() + 30 * 60_000).toISOString(),
    })
    .eq('id', rental.id);

  // 3DS — same-tab redirect to the issuer; result lands via the webhook
  // and the /payment/return polling fallback.
  if (charge.authorize_uri) {
    return NextResponse.json({
      status: 'requires_3ds',
      authorize_uri: charge.authorize_uri,
    });
  }

  // Synchronous (non-3DS) result — run the shared writer so the rental
  // flip + email + staff LINE happen now, exactly once (the webhook's
  // charge.create delivery for this charge will short-circuit on the
  // terminal txn state).
  const outcome = await processChargeResult(supabase, charge, { baseUrl });
  if (outcome.kind === 'db_error') {
    // Writes failed but the charge may have succeeded — tell the client
    // to poll /payment/return, which repairs state via the probe path.
    return NextResponse.json({ status: 'success', ref: rental.rental_code });
  }

  if (isChargeSuccessful(charge)) {
    return NextResponse.json({ status: 'success', ref: rental.rental_code });
  }
  return NextResponse.json({
    status: 'failed',
    failure_reason: classifyFailure(charge.failure_code),
  });
}
