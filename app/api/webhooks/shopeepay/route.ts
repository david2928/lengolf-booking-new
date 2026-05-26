import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/utils/supabase/admin';
import { verifySignature } from '@/lib/shopeepay/client';
import {
  extractReferenceId,
  isFinalSuccess,
  type NotifyTransactionPayload,
} from '@/lib/shopeepay/types';
import { claimAndSendConfirmationEmail } from '@/lib/shopeepay/markRentalAsPaid';
import { handleRefundNotify } from '@/lib/shopeepay/handleRefundNotify';
import { composeRentalLineMessage } from '@/lib/club-rental/lineMessage';

/**
 * POST /api/webhooks/shopeepay
 *
 * Receives ShopeePay's "Notify Transaction Status" callback. Verifies
 * the HMAC signature, checks idempotency on transaction_sn, and on
 * confirmed success (status=3 or transaction_status=3 per the CwS UAT
 * self-assessment) flips the rental's payment_status to 'paid' and
 * fires the customer confirmation email + staff LINE notification.
 *
 * Per the partner UAT guideline:
 *   - Always respond { errcode: 0, debug_msg: 'success' } on rows we
 *     recognize, even on idempotent replays. Thailand retries up to 2x
 *     at 5-min intervals on non-zero responses.
 *   - Never use the `return_url` redirect as proof of success — the
 *     webhook (or the Check Transaction Status fallback) is the only
 *     trusted source.
 */

const ACK_OK = { errcode: 0, debug_msg: 'success' as const };

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
  // Read the body as text BEFORE parsing — signature is computed over
  // the exact bytes ShopeePay sent, and JSON.stringify(JSON.parse(x))
  // is not always equal to x.
  const rawBody = await request.text();
  const headerSig = request.headers.get('x-airpay-req-h');

  if (!verifySignature(rawBody, headerSig)) {
    console.warn('[ShopeePay/webhook] signature verification failed');
    // Returning 401 (not errcode:0) so ShopeePay retries — but only
    // when the signature really is bad. Don't include any body so we
    // don't echo info back to potential probes.
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let payload: NotifyTransactionPayload;
  try {
    payload = JSON.parse(rawBody) as NotifyTransactionPayload;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { transaction_sn, amount } = payload;
  // ShopeePay's notify webhook sends `reference_id` (matches the
  // transaction/check request shape), NOT `payment_reference_id`
  // (which the order/create request uses). Observed in UAT
  // 2026-05-15 — a real successful payment was logged on their side
  // but we returned 400 `Missing payment_reference_id`. See
  // extractReferenceId in lib/shopeepay/types.ts.
  const referenceId = extractReferenceId(payload);
  if (!referenceId) {
    // Log the payload keys (NOT values — may contain PII or sig data) so
    // a future ShopeePay-side wire-name change surfaces from logs alone.
    // The 2026-05-15 outage would have been a 5-minute fix if this log
    // had been here from day one.
    console.warn(
      '[ShopeePay/webhook] no reference field — payload keys:',
      Object.keys(payload as unknown as Record<string, unknown>)
    );
    return NextResponse.json({ error: 'Missing reference_id' }, { status: 400 });
  }

  const supabase = createAdminClient();

  // Branch: refund notification. ShopeePay routes both payment and
  // refund notify-transaction-status callbacks to the same registered
  // endpoint. The presence of refund_reference_id is the only signal —
  // see lib/shopeepay/types.ts NotifyTransactionPayload.
  if (payload.refund_reference_id) {
    return handleRefundNotify(supabase, payload, { baseUrl: getBaseUrl() });
  }

  const { data: txnRow, error: txnError } = await supabase
    .from('payment_transactions')
    .select(
      'id, club_rental_id, amount, status, transaction_sn, payment_reference_id, raw_webhook_payload'
    )
    .eq('payment_reference_id', referenceId)
    .maybeSingle();

  if (txnError) {
    console.error('[ShopeePay/webhook] DB lookup error:', txnError);
    // Server-side issue — return non-zero so ShopeePay retries.
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
  if (!txnRow) {
    console.warn(
      `[ShopeePay/webhook] no transaction found for ${referenceId} — ignoring`
    );
    // Don't surface this as a non-zero — if it's a stale/replayed
    // webhook for a deleted record, we don't want infinite retries.
    return NextResponse.json(ACK_OK);
  }

  // Amount tampering check.
  if (typeof amount !== 'number' || amount !== txnRow.amount) {
    console.error(
      `[ShopeePay/webhook] amount mismatch for ${referenceId}: ` +
        `expected ${txnRow.amount}, got ${amount}`
    );
    return NextResponse.json({ error: 'Amount mismatch' }, { status: 400 });
  }

  // Idempotency: if we already recorded this transaction_sn AND the
  // row is already in a terminal state, ack and skip side effects.
  if (
    transaction_sn &&
    txnRow.transaction_sn === transaction_sn &&
    (txnRow.status === 'success' || txnRow.status === 'failed')
  ) {
    return NextResponse.json(ACK_OK);
  }

  const isSuccess = isFinalSuccess(payload);

  // Update the transaction row in all cases (we've now verified sig +
  // amount). raw_webhook_payload is overwritten on each delivery — fine
  // because every delivery for a given transaction_sn carries the same
  // terminal payload by ShopeePay's contract.
  const newTxnStatus = isSuccess ? 'success' : payload.status === undefined ? 'pending' : 'failed';

  const txnUpdates: Record<string, unknown> = {
    status: newTxnStatus,
    raw_webhook_payload: payload as unknown as Record<string, unknown>,
  };
  if (transaction_sn) txnUpdates.transaction_sn = transaction_sn;
  if (typeof payload.payment_channel === 'number') {
    txnUpdates.payment_channel = payload.payment_channel;
  }
  // UAT delivered payment_method as a number (16); coerce to string
  // since the DB column is TEXT.
  if (payload.payment_method !== undefined && payload.payment_method !== null) {
    txnUpdates.payment_method = String(payload.payment_method);
  }
  if (payload.user_id_hash) txnUpdates.user_id_hash = payload.user_id_hash;
  if (isSuccess) txnUpdates.paid_at = new Date().toISOString();

  const { error: updateError } = await supabase
    .from('payment_transactions')
    .update(txnUpdates)
    .eq('id', txnRow.id);

  if (updateError) {
    console.error('[ShopeePay/webhook] transaction update failed:', updateError);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }

  if (!isSuccess) {
    // Failed / non-terminal payload — update the rental to 'failed' if
    // ShopeePay returned a non-success terminal state, otherwise leave
    // it 'pending' and let the cleanup cron expire it.
    if (newTxnStatus === 'failed' && txnRow.club_rental_id) {
      const { data: failedRental } = await supabase
        .from('club_rentals')
        .update({ payment_status: 'failed' })
        .eq('id', txnRow.club_rental_id)
        .select('*')
        .single();

      // Staff LINE ping — fire-and-forget. Same unified format as the
      // other lifecycle events, with PaymentFailed status.
      const baseUrl = getBaseUrl();
      if (baseUrl && failedRental) {
        const { data: clubSet } = await supabase
          .from('rental_club_sets')
          .select('name, tier, gender')
          .eq('id', failedRental.rental_club_set_id)
          .single();

        // ShopeePay's notify-failure payload sometimes carries debug_msg
        // alongside the standard fields; cast to read it without polluting
        // the canonical NotifyTransactionPayload type.
        const failureReason =
          (payload as unknown as { debug_msg?: string }).debug_msg ?? null;

        const lineMessage = composeRentalLineMessage({
          rental: failedRental,
          clubSet,
          status: { kind: 'PaymentFailed', reason: failureReason },
          uatPrefix: !IS_PROD_ENV,
        });

        try {
          await fetch(`${baseUrl}/api/notifications/line`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ message: lineMessage }),
          });
        } catch (err) {
          console.error('[ShopeePay/webhook] LINE notification error (failed):', err);
        }
      }
    }
    return NextResponse.json(ACK_OK);
  }

  // ----- Success path -----

  if (!txnRow.club_rental_id) {
    console.warn(
      `[ShopeePay/webhook] success but no club_rental_id linked for ${referenceId}`
    );
    return NextResponse.json(ACK_OK);
  }

  // Flip the rental and clear expiry. Side-effect order:
  //   1. DB write (must succeed)
  //   2. Email send (best-effort, async)
  //   3. LINE staff notification (best-effort, async)
  // Use select('*') to keep the Database row type — multi-column
  // concatenated select strings break supabase-js type inference.
  const { data: rental, error: rentalErr } = await supabase
    .from('club_rentals')
    .update({ payment_status: 'paid', expires_at: null })
    .eq('id', txnRow.club_rental_id)
    .select('*')
    .single();

  if (rentalErr || !rental) {
    console.error('[ShopeePay/webhook] rental update failed:', rentalErr);
    // The transaction is updated; the rental update is what fires the
    // confirmation. Return non-zero so ShopeePay retries and gives us
    // another shot.
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }

  // Customer confirmation email — uses the shared dedup helper so the
  // polling status route doesn't re-send if it claimed the email first
  // (and vice versa). AWAIT so Vercel keeps the function alive until
  // the helper's DB queries + SMTP send complete; under the old
  // `void`-fire pattern (2026-05-26 UAT) Vercel tore the function down
  // mid-fetch and the email silently failed with `TypeError: fetch failed`.
  // Wrap in try/catch so a side-effect failure never breaks the ACK to
  // ShopeePay.
  try {
    await claimAndSendConfirmationEmail(supabase, txnRow.id, txnRow.club_rental_id, {
      transactionSn: transaction_sn,
    });
  } catch (err) {
    console.error('[ShopeePay/webhook] email side-effect failed:', err);
  }

  // Staff LINE notification. Fire-and-forget. Uses the unified
  // composeRentalLineMessage helper so the format stays consistent
  // with the reservation-created, refund, and payment-failed pings.
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
      status: { kind: 'Paid', transactionSn: transaction_sn },
      uatPrefix: !IS_PROD_ENV,
    });

    // AWAIT so Vercel doesn't tear down the function mid-fetch.
    // Self-fetch is subject to the same lifecycle as the email send above.
    try {
      await fetch(`${baseUrl}/api/notifications/line`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: lineMessage }),
      });
    } catch (err) {
      console.error('[ShopeePay/webhook] LINE notification error:', err);
    }
  }

  return NextResponse.json(ACK_OK);
}
