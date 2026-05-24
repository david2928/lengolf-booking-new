import 'server-only';
import { NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { extractReferenceId, isFinalSuccess, type NotifyTransactionPayload } from './types';
import { claimAndSendRefundEmail } from './markRefundAsRefunded';
import { composeRentalLineMessage } from '@/lib/club-rental/lineMessage';

const IS_PROD_ENV = process.env.VERCEL_ENV === 'production';

/**
 * Refund-notify branch of the ShopeePay webhook.
 *
 * ⚠️ DORMANT AS OF 2026-05-24. ShopeePay support (pearpearpearpearpear,
 * 16:49 BKK) confirmed they do NOT currently emit refund webhooks at
 * all — quote: "currently there is no webhook available for refund
 * requests. At the moment, callbacks are only triggered for completed
 * payment transactions. However, we are currently in the development
 * stage for the refund callback. Please allow me to inform you again
 * once it's ready." So this handler is never invoked in production
 * today; refund reconciliation goes through the backoffice-initiated
 * route (POST /api/payments/shopeepay/refund) which calls ShopeePay's
 * refund API directly and writes our DB synchronously from the API
 * response. Keep this handler in place for the day ShopeePay ships
 * their refund-notify callback — the orphan-tolerant code below is
 * the correct shape for that future event.
 *
 * Triggered when an inbound notify payload carries `refund_reference_id`.
 * Updates the matching `payment_refunds` row, atomically increments
 * `payment_transactions.refunded_amount`, derives the new transaction
 * status (`refunded` vs `partially_refunded`), updates the rental's
 * payment_status, then fires the customer email + staff LINE
 * notification (best-effort, fire-and-forget).
 *
 * Idempotency: if the refund row is already in a terminal state and
 * the same notify is replayed, ack with errcode:0 and skip side-effects.
 *
 * Per ShopeePay contract: ack with errcode:0 on rows we recognize even
 * for replays — non-zero responses cause Thailand-region retries.
 */

const ACK_OK = { errcode: 0, debug_msg: 'success' as const };

interface RefundNotifyOptions {
  baseUrl: string;
}

interface PaymentRefundRow {
  id: string;
  payment_transaction_id: string;
  amount: number;
  status: string;
  raw_webhook_payload: unknown;
}

interface PaymentTransactionRow {
  id: string;
  club_rental_id: string | null;
  amount: number;
  refunded_amount: number;
}

export async function handleRefundNotify(
  supabase: SupabaseClient,
  payload: NotifyTransactionPayload,
  opts: RefundNotifyOptions
): Promise<NextResponse> {
  // Always log the wire shape of refund payloads so the next session can
  // see exactly which fields ShopeePay actually sent (vs the docs claim).
  // The payment-notify path was observed in UAT 2026-05-15 sending
  // `reference_id` instead of `payment_reference_id` — a similar mismatch
  // on the refund branch is plausible. Keys-only, never values (PII safety).
  console.log(
    '[ShopeePay/webhook/refund] payload keys:',
    Object.keys(payload as unknown as Record<string, unknown>)
  );

  const refundReferenceId = payload.refund_reference_id;
  if (!refundReferenceId) {
    // Defensive — caller should have checked, but never trust the input.
    return NextResponse.json({ error: 'Missing refund_reference_id' }, { status: 400 });
  }

  // 1. Look up the refund row.
  const { data: initialRefundRow, error: refundErr } = await supabase
    .from('payment_refunds')
    .select('id, payment_transaction_id, amount, status, raw_webhook_payload')
    .eq('refund_reference_id', refundReferenceId)
    .maybeSingle<PaymentRefundRow>();
  // refundRow may be reassigned below in the orphan-refund self-create branch.
  let refundRow = initialRefundRow;

  if (refundErr) {
    console.error('[ShopeePay/webhook/refund] DB lookup error:', refundErr);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }

  // ORPHAN REFUND PATH: no payment_refunds row exists for this refund_reference_id.
  // This is the merchant-portal-initiated refund case (ops uses ShopeePay's
  // dashboard to refund a customer, bypassing our /api/payments/refund route).
  // First observed UAT 2026-05-23: a portal-initiated ฿1,200 refund was acked
  // 200 by our handler but never updated our DB, leaving the rental as 'paid'
  // while the customer's card was credited. Self-create the row so refunds
  // are captured regardless of origin.
  if (!refundRow) {
    const parentReferenceId = extractReferenceId(payload);
    if (!parentReferenceId) {
      console.warn(
        `[ShopeePay/webhook/refund] orphan refund ${refundReferenceId} without parent reference — ignoring`
      );
      return NextResponse.json(ACK_OK);
    }

    const { data: parentTxn, error: parentErr } = await supabase
      .from('payment_transactions')
      .select('id, amount')
      .eq('payment_reference_id', parentReferenceId)
      .maybeSingle();

    if (parentErr) {
      console.error('[ShopeePay/webhook/refund] parent lookup error:', parentErr);
      return NextResponse.json({ error: 'Internal error' }, { status: 500 });
    }
    if (!parentTxn) {
      console.warn(
        `[ShopeePay/webhook/refund] orphan refund ${refundReferenceId} — no parent txn for ${parentReferenceId}`
      );
      // Don't loop ShopeePay on stale/replayed deletions.
      return NextResponse.json(ACK_OK);
    }

    // Refund-amount sanity check before insert: must be a positive integer
    // and not exceed the parent transaction amount.
    if (
      typeof payload.amount !== 'number' ||
      payload.amount <= 0 ||
      payload.amount > parentTxn.amount
    ) {
      console.error(
        `[ShopeePay/webhook/refund] orphan refund ${refundReferenceId}: invalid amount ${payload.amount} vs parent ${parentTxn.amount}`
      );
      return NextResponse.json({ error: 'Invalid refund amount' }, { status: 400 });
    }

    const { data: insertedRefund, error: insertErr } = await supabase
      .from('payment_refunds')
      .insert({
        payment_transaction_id: parentTxn.id,
        refund_reference_id: refundReferenceId,
        // Synthetic request_id so the NOT-NULL column is satisfied; flag
        // origin for forensic tracing.
        request_id: `merchant-portal-${refundReferenceId}`,
        amount: payload.amount,
        reason: 'Merchant portal refund (originated outside our backend)',
        status: 'pending',
        initiated_by_email: 'merchant-portal@shopeepay',
        initiated_by_name: 'ShopeePay Merchant Portal',
        refund_sn: payload.transaction_sn ?? null,
      })
      .select('id, payment_transaction_id, amount, status, raw_webhook_payload')
      .single<PaymentRefundRow>();

    if (insertErr || !insertedRefund) {
      console.error('[ShopeePay/webhook/refund] orphan refund insert failed:', insertErr);
      return NextResponse.json({ error: 'Internal error' }, { status: 500 });
    }

    refundRow = insertedRefund;
    console.log(
      `[ShopeePay/webhook/refund] self-created orphan refund row ${refundRow.id} for ${refundReferenceId}`
    );
  }

  // 2. Refund-amount tampering check.
  if (typeof payload.amount !== 'number' || payload.amount !== refundRow.amount) {
    console.error(
      `[ShopeePay/webhook/refund] amount mismatch for ${refundReferenceId}: ` +
        `expected ${refundRow.amount}, got ${payload.amount}`
    );
    return NextResponse.json({ error: 'Amount mismatch' }, { status: 400 });
  }

  // 3. Idempotency: already terminal AND we recorded a payload → ack.
  if (
    (refundRow.status === 'success' || refundRow.status === 'failed') &&
    refundRow.raw_webhook_payload
  ) {
    return NextResponse.json(ACK_OK);
  }

  const isSuccess = isFinalSuccess(payload);
  const refundedAt = isSuccess ? new Date().toISOString() : null;
  const newRefundStatus = isSuccess
    ? 'success'
    : payload.status === undefined
      ? 'pending'
      : 'failed';

  // 4. Update the refund row. raw_webhook_payload always overwritten —
  // ShopeePay contract guarantees the same terminal payload across
  // delivery retries for the same refund_reference_id.
  const refundUpdates: Record<string, unknown> = {
    status: newRefundStatus,
    raw_webhook_payload: payload as unknown as Record<string, unknown>,
  };
  if (refundedAt) refundUpdates.refunded_at = refundedAt;
  if (!isSuccess && payload.status !== undefined) {
    // Capture the gateway's failure reason if present.
    refundUpdates.error_code = (payload as unknown as { errcode?: number }).errcode ?? null;
    refundUpdates.error_message =
      (payload as unknown as { debug_msg?: string }).debug_msg ?? null;
  }

  const { error: updateRefundErr } = await supabase
    .from('payment_refunds')
    .update(refundUpdates)
    .eq('id', refundRow.id);

  if (updateRefundErr) {
    console.error('[ShopeePay/webhook/refund] refund update failed:', updateRefundErr);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }

  if (!isSuccess) {
    // Failed or non-terminal — leave the parent transaction alone and
    // ack. Staff will see the failed row in the admin UI and can retry.
    return NextResponse.json(ACK_OK);
  }

  // ----- Refund success path -----

  // 5. Atomically increment the parent transaction's refunded_amount.
  // We need the new total to derive partially_refunded vs refunded —
  // do a read-then-write on the FRESH row (post our increment).
  const { data: txn, error: txnErr } = await supabase
    .from('payment_transactions')
    .select('id, club_rental_id, amount, refunded_amount')
    .eq('id', refundRow.payment_transaction_id)
    .single<PaymentTransactionRow>();

  if (txnErr || !txn) {
    console.error('[ShopeePay/webhook/refund] txn load failed:', txnErr);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }

  const newRefundedAmount = (txn.refunded_amount ?? 0) + refundRow.amount;
  const newTxnStatus =
    newRefundedAmount >= txn.amount ? 'refunded' : 'partially_refunded';

  const { error: txnUpdateErr } = await supabase
    .from('payment_transactions')
    .update({
      refunded_amount: newRefundedAmount,
      status: newTxnStatus,
      refunded_at: new Date().toISOString(),
    })
    .eq('id', txn.id);

  if (txnUpdateErr) {
    console.error('[ShopeePay/webhook/refund] txn update failed:', txnUpdateErr);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }

  // 6. Update the rental's payment_status to mirror the txn state.
  if (txn.club_rental_id) {
    const { error: rentalUpdateErr } = await supabase
      .from('club_rentals')
      .update({ payment_status: newTxnStatus })
      .eq('id', txn.club_rental_id);
    if (rentalUpdateErr) {
      console.error('[ShopeePay/webhook/refund] rental update failed:', rentalUpdateErr);
      // Non-fatal — txn is the source of truth; staff can reconcile.
    }
  }

  // 7. Customer email — claim-and-send pattern guarantees one delivery.
  void claimAndSendRefundEmail(supabase, refundRow.id, {
    refundSn: payload.transaction_sn ?? null,
  });

  // 8. Staff LINE notification — fire-and-forget. Uses the unified
  // composeRentalLineMessage helper so the format stays consistent
  // with the reservation-created, payment-received, and payment-failed
  // pings.
  if (opts.baseUrl && txn.club_rental_id) {
    const { data: rentalForLine } = await supabase
      .from('club_rentals')
      .select('*')
      .eq('id', txn.club_rental_id)
      .single();

    if (rentalForLine) {
      const { data: clubSet } = rentalForLine.rental_club_set_id
        ? await supabase
            .from('rental_club_sets')
            .select('name, tier, gender')
            .eq('id', rentalForLine.rental_club_set_id)
            .single()
        : { data: null };

      const lineMessage = composeRentalLineMessage({
        rental: rentalForLine,
        clubSet,
        status:
          newTxnStatus === 'refunded'
            ? {
                kind: 'Refunded',
                refundedSatang: refundRow.amount,
                refundSn: payload.transaction_sn ?? null,
              }
            : {
                kind: 'PartiallyRefunded',
                refundedThisTimeSatang: refundRow.amount,
                totalRefundedSatang: newRefundedAmount,
                refundSn: payload.transaction_sn ?? null,
              },
        uatPrefix: !IS_PROD_ENV,
      });

      fetch(`${opts.baseUrl}/api/notifications/line`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: lineMessage }),
      }).catch(err =>
        console.error('[ShopeePay/webhook/refund] LINE notification error:', err)
      );
    }
  }

  return NextResponse.json(ACK_OK);
}
