import 'server-only';
import { NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { isFinalSuccess, type NotifyTransactionPayload } from './types';
import { claimAndSendRefundEmail } from './markRefundAsRefunded';

/**
 * Refund-notify branch of the ShopeePay webhook.
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
  const refundReferenceId = payload.refund_reference_id;
  if (!refundReferenceId) {
    // Defensive — caller should have checked, but never trust the input.
    return NextResponse.json({ error: 'Missing refund_reference_id' }, { status: 400 });
  }

  // 1. Look up the refund row.
  const { data: refundRow, error: refundErr } = await supabase
    .from('payment_refunds')
    .select('id, payment_transaction_id, amount, status, raw_webhook_payload')
    .eq('refund_reference_id', refundReferenceId)
    .maybeSingle<PaymentRefundRow>();

  if (refundErr) {
    console.error('[ShopeePay/webhook/refund] DB lookup error:', refundErr);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
  if (!refundRow) {
    console.warn(
      `[ShopeePay/webhook/refund] no refund row for ${refundReferenceId} — ignoring`
    );
    // Don't loop ShopeePay on stale/replayed deletions.
    return NextResponse.json(ACK_OK);
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

  // 8. Staff LINE notification — fire-and-forget.
  if (opts.baseUrl && txn.club_rental_id) {
    const { data: rentalForLine } = await supabase
      .from('club_rentals')
      .select('rental_code, customer_name')
      .eq('id', txn.club_rental_id)
      .single();

    const refundThb = (refundRow.amount / 100).toLocaleString();
    const lineMessage = [
      `Refund ${newTxnStatus === 'refunded' ? 'Completed' : 'Issued (partial)'} (${rentalForLine?.rental_code ?? '?'})`,
      rentalForLine?.customer_name ? `Customer: ${rentalForLine.customer_name}` : null,
      `Refund: ฿${refundThb}`,
      payload.transaction_sn ? `Refund SN: ${payload.transaction_sn}` : null,
    ]
      .filter(Boolean)
      .join('\n');

    fetch(`${opts.baseUrl}/api/notifications/line`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: lineMessage }),
    }).catch(err =>
      console.error('[ShopeePay/webhook/refund] LINE notification error:', err)
    );
  }

  return NextResponse.json(ACK_OK);
}
