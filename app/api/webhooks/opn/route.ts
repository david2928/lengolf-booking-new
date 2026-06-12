import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/utils/supabase/admin';
import { verifyPayloadDetailed } from '@/lib/opn/signature';
import { webhookSecrets } from '@/lib/opn/config';
import { claimAndSendConfirmationEmail } from '@/lib/payments/markRentalAsPaid';
import { handleRefundNotify } from '@/lib/opn/handleRefundNotify';
import { composeRentalLineMessage } from '@/lib/club-rental/lineMessage';
import {
  isChargeSuccessful,
  isChargeTerminal,
  type OpnCharge,
  type OpnRefund,
  type OpnWebhookEvent,
} from '@/lib/opn/types';

/**
 * POST /api/webhooks/opn
 *
 * Receives Opn (Omise) webhook events. Verifies the HMAC signature on
 * the raw body, rejects stale timestamps, and processes:
 *   - charge.complete — terminal result of a pending (3DS/offsite) charge
 *   - charge.create   — terminal result of a synchronously-authorized
 *                       (non-3DS) charge. Omise only fires charge.complete
 *                       for charges that went through a pending state, so
 *                       non-3DS payments would have NO webhook coverage if
 *                       we ack'd this unprocessed (browser dies post-charge
 *                       → cron cancels a PAID rental at expires_at).
 *   - refund.create   — dashboard- or API-initiated refunds
 *
 * Mirrors the hardened ShopeePay handler (app/api/webhooks/shopeepay):
 * idempotency over ALL four terminal txn states, rental-consistency
 * fallthrough on success replays, awaited side-effects, unified LINE
 * composer.
 */

const ACK_OK = { object: 'ok' as const };

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

export async function POST(request: NextRequest) {
  // Read the body as text BEFORE parsing — the signature is computed
  // over the exact bytes Opn sent.
  const rawBody = await request.text();
  const headerSig = request.headers.get('omise-signature');
  const headerTs = request.headers.get('omise-signature-timestamp');

  const verdict = verifyPayloadDetailed(rawBody, headerSig, headerTs, webhookSecrets());
  if (!verdict.valid) {
    console.warn('[opn/webhook] signature verification failed');
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  // Settle the raw-vs-base64 key-encoding question from logs on the
  // first real delivery (Opn docs say base64-decode the secret; we
  // verify against both conventions).
  console.log(`[opn/webhook] signature ok (key convention: ${verdict.keyKind})`);

  // Anti-replay: reject if more than 5 min skew.
  const tsMs = Number(headerTs) * 1000;
  if (!Number.isFinite(tsMs) || Math.abs(Date.now() - tsMs) > 5 * 60_000) {
    console.warn('[opn/webhook] stale or invalid timestamp:', headerTs);
    return NextResponse.json({ error: 'Stale timestamp' }, { status: 401 });
  }

  let event: OpnWebhookEvent;
  try {
    event = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const supabase = createAdminClient();

  switch (event.key) {
    case 'charge.complete':
    case 'charge.create': {
      const charge = event.data as OpnCharge;
      // charge.create fires for every charge, including 3DS charges that
      // are still pending (the customer is at the issuer page). Only
      // terminal charges carry a result worth recording — pending ones
      // resolve via charge.complete or the polling fallback.
      if (!isChargeTerminal(charge)) {
        return NextResponse.json(ACK_OK);
      }
      return handleChargeResult(supabase, charge);
    }
    case 'refund.create':
      return handleRefundNotify(supabase, event.data as OpnRefund, { baseUrl: getBaseUrl() });
    default:
      console.log('[opn/webhook] unhandled event key:', event.key);
      return NextResponse.json(ACK_OK);
  }
}

async function handleChargeResult(
  supabase: ReturnType<typeof createAdminClient>,
  charge: OpnCharge
): Promise<Response> {
  const { data: txn, error: txnErr } = await supabase
    .from('payment_transactions')
    .select('id, club_rental_id, amount, status')
    .eq('gateway_charge_id', charge.id)
    .maybeSingle();

  if (txnErr) {
    console.error('[opn/webhook] txn lookup failed:', txnErr);
    // Server-side issue — non-2xx so Opn retries.
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
  if (!txn) {
    // e.g. a dashboard-created test charge that never went through our
    // intent route. Ack so Opn doesn't retry forever.
    console.warn(`[opn/webhook] no txn for charge ${charge.id} — ack and ignore`);
    return NextResponse.json(ACK_OK);
  }

  // Amount tampering check (both sides are satang).
  if (charge.amount !== txn.amount) {
    console.error(
      `[opn/webhook] amount mismatch for ${charge.id}: expected ${txn.amount}, got ${charge.amount}`
    );
    return NextResponse.json({ error: 'Amount mismatch' }, { status: 400 });
  }

  // Idempotency: short-circuit when the txn row is already in ANY
  // terminal state. 'refunded' and 'partially_refunded' MUST be in the
  // set — a refunded Omise charge still reads status:'successful',
  // paid:true, so a charge.complete replay after a refund would
  // otherwise reset the txn to 'success' and the rental to 'paid'
  // (the exact ShopeePay bug fixed in 305a1dc).
  //
  // ADDITIONAL guard (W5 pattern): for terminal-success, also verify
  // the rental is consistent (payment_status='paid'). If a previous
  // delivery committed the txn update but failed the rental update
  // mid-handler (transient DB blip → 500 → Opn retry), a strict
  // idempotency check would silence the retry and orphan the rental at
  // payment_status='pending' forever. Falling through re-runs the
  // rental update + side-effects.
  const TERMINAL_TXN_STATUSES = new Set([
    'success',
    'failed',
    'refunded',
    'partially_refunded',
  ]);
  if (TERMINAL_TXN_STATUSES.has(txn.status)) {
    if (txn.status === 'success' && txn.club_rental_id) {
      const { data: rentalCheck } = await supabase
        .from('club_rentals')
        .select('payment_status')
        .eq('id', txn.club_rental_id)
        .maybeSingle();
      if (rentalCheck && rentalCheck.payment_status === 'paid') {
        return NextResponse.json(ACK_OK);
      }
      console.warn(
        `[opn/webhook] idempotency replay for ${charge.id} but rental ` +
          `payment_status is ${rentalCheck?.payment_status ?? 'unknown'} — ` +
          `re-running rental update + side-effects`
      );
    } else {
      // Non-success terminal state — safe to short-circuit. Covers the
      // post-refund replay case.
      return NextResponse.json(ACK_OK);
    }
  }

  const isSuccess = isChargeSuccessful(charge);
  const updates: Record<string, unknown> = {
    status: isSuccess ? 'success' : 'failed',
    raw_webhook_payload: charge as unknown as Record<string, unknown>,
    auth_code: (charge as { authorization_code?: string | null }).authorization_code ?? null,
    failure_code: charge.failure_code,
    failure_message: charge.failure_message,
    card_brand: charge.card?.brand ?? null,
    card_last4: charge.card?.last_digits ?? null,
    is_3ds: charge.authorize_uri !== null,
    transaction_fee_rate: charge.transaction_fees?.fee_rate ?? null,
    transaction_vat_rate: charge.transaction_fees?.vat_rate ?? null,
  };
  if (isSuccess) updates.paid_at = new Date().toISOString();

  const { error: updateErr } = await supabase
    .from('payment_transactions')
    .update(updates)
    .eq('id', txn.id);

  if (updateErr) {
    console.error('[opn/webhook] txn update failed:', updateErr);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }

  // ----- Failure path -----
  if (!isSuccess) {
    if (txn.club_rental_id) {
      const { data: failedRental } = await supabase
        .from('club_rentals')
        .update({ payment_status: 'failed' })
        .eq('id', txn.club_rental_id)
        .select('*')
        .single();

      // Staff LINE ping — AWAIT + try/catch; `void promise()` dies on
      // Vercel (sockets torn down once the response is sent).
      const baseUrl = getBaseUrl();
      if (baseUrl && failedRental) {
        const { data: clubSet } = await supabase
          .from('rental_club_sets')
          .select('name, tier, gender')
          .eq('id', failedRental.rental_club_set_id)
          .single();

        const lineMessage = composeRentalLineMessage({
          rental: failedRental,
          clubSet,
          status: {
            kind: 'PaymentFailed',
            reason: charge.failure_message ?? charge.failure_code ?? null,
          },
          uatPrefix: !IS_PROD_ENV,
        });

        try {
          await fetch(`${baseUrl}/api/notifications/line`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ message: lineMessage }),
          });
        } catch (err) {
          console.error('[opn/webhook] LINE notification error (failed):', err);
        }
      }
    }
    return NextResponse.json(ACK_OK);
  }

  // ----- Success path -----

  if (!txn.club_rental_id) {
    console.warn(`[opn/webhook] success but no club_rental_id for ${charge.id}`);
    return NextResponse.json(ACK_OK);
  }

  const { data: rental, error: rentalErr } = await supabase
    .from('club_rentals')
    .update({ payment_status: 'paid', expires_at: null })
    .eq('id', txn.club_rental_id)
    .select('*')
    .single();

  if (rentalErr || !rental) {
    console.error('[opn/webhook] rental update failed:', rentalErr);
    // Txn is updated but the rental isn't — return non-2xx so Opn
    // retries; the W5 fallthrough above repairs it on the next delivery.
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }

  // Customer confirmation email — shared dedup helper, so the polling
  // return route never double-sends. AWAIT + try/catch: a side-effect
  // failure must not break the ACK, and fire-and-forget dies on Vercel.
  try {
    await claimAndSendConfirmationEmail(supabase, txn.id, txn.club_rental_id, {
      transactionSn: charge.id,
    });
  } catch (err) {
    console.error('[opn/webhook] email side-effect failed:', err);
  }

  // Staff LINE notification — unified composer, same visual language as
  // every other rental lifecycle ping.
  const baseUrl = getBaseUrl();
  if (baseUrl) {
    const { data: clubSet } = await supabase
      .from('rental_club_sets')
      .select('name, tier, gender')
      .eq('id', rental.rental_club_set_id)
      .single();

    const lineMessage = composeRentalLineMessage({
      rental,
      clubSet,
      status: { kind: 'Paid', transactionSn: charge.id, gatewayLabel: 'Opn (card)' },
      uatPrefix: !IS_PROD_ENV,
    });

    try {
      await fetch(`${baseUrl}/api/notifications/line`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: lineMessage }),
      });
    } catch (err) {
      console.error('[opn/webhook] LINE notification error:', err);
    }
  }

  return NextResponse.json(ACK_OK);
}
