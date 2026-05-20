import 'server-only';
import { NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { OpnRefund } from '@/lib/opn/types';
import { claimAndSendRefundEmail } from '@/lib/payments/markRefundAsRefunded';

/**
 * Handle a refund.create webhook event from Opn. Mirrors the ShopeePay
 * handleRefundNotify shape:
 *
 *   1. Find the original payment_transactions row by gateway_charge_id.
 *   2. Upsert a payment_refunds row (on conflict: gateway_refund_id stored
 *      as refund_reference_id). Atomically increments refunded_amount on
 *      the transaction.
 *   3. Derives the new transaction status (refunded vs partially_refunded)
 *      and mirrors it to the rental's payment_status.
 *   4. Fires the customer refund email via the shared
 *      claimAndSendRefundEmail helper (claim-and-send, idempotent).
 *   5. Fires a staff LINE notification (best-effort, fire-and-forget).
 *
 * Opn's refund.create event only fires for successful refunds — there is
 * no equivalent of ShopeePay's pending/failed refund notify. The upsert
 * therefore unconditionally writes status='success'. Idempotent replays of
 * the same event will hit the upsert's onConflict path and re-attempt the
 * email (which is safe — the email helper's IS NULL guard prevents doubles).
 *
 * Always returns 200 on events we can recognise; 500 only for server-side
 * failures.
 */

interface RefundNotifyOptions {
  baseUrl: string;
}

interface PaymentTransactionRow {
  id: string;
  club_rental_id: string | null;
  amount: number;
  refunded_amount: number;
}

export async function handleRefundNotify(
  supabase: SupabaseClient,
  refund: OpnRefund,
  opts: RefundNotifyOptions
): Promise<NextResponse> {
  const chargeId = refund.charge;   // chrg_*
  const refundId = refund.id;       // rfnd_*

  // 1. Find the payment_transactions row for the original charge.
  const { data: txn, error: txnErr } = await supabase
    .from('payment_transactions')
    .select('id, club_rental_id, amount, refunded_amount')
    .eq('gateway_charge_id', chargeId)
    .maybeSingle<PaymentTransactionRow>();

  if (txnErr) {
    console.error('[opn/handleRefundNotify] txn lookup failed:', txnErr);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
  if (!txn) {
    // We don't recognise this charge — probably a webhook for a charge
    // created outside this system. Ack so Opn stops retrying.
    console.warn(`[opn/handleRefundNotify] no txn for charge ${chargeId} — ack`);
    return NextResponse.json({ object: 'ok' });
  }

  // 2. Upsert the payment_refunds row.
  //    refund_reference_id is the gateway-agnostic unique key the table
  //    uses for all gateways (ShopeePay stores its refund_reference_id
  //    there; we store Opn's rfnd_* id). status is always 'success' for
  //    Opn's refund.create event — the event only fires after the gateway
  //    confirms the refund, so there is no pending/failed variant.
  const { data: upsertedRefund, error: upsertErr } = await supabase
    .from('payment_refunds')
    .upsert(
      {
        payment_transaction_id: txn.id,
        refund_reference_id: refundId,
        amount: refund.amount,
        status: 'success',
        refunded_at: new Date().toISOString(),
        raw_webhook_payload: refund as unknown as Record<string, unknown>,
      },
      { onConflict: 'refund_reference_id' }
    )
    .select('id')
    .single();

  if (upsertErr || !upsertedRefund) {
    console.error('[opn/handleRefundNotify] refund upsert failed:', upsertErr);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }

  // 3. Atomically increment the parent transaction's refunded_amount and
  //    derive the new status. We re-read txn.refunded_amount fresh after
  //    the upsert so concurrent refunds accumulate correctly.
  const { data: freshTxn, error: freshTxnErr } = await supabase
    .from('payment_transactions')
    .select('refunded_amount')
    .eq('id', txn.id)
    .single<Pick<PaymentTransactionRow, 'refunded_amount'>>();

  const baseRefunded = freshTxnErr ? txn.refunded_amount : (freshTxn?.refunded_amount ?? 0);
  const newRefundedAmount = (baseRefunded ?? 0) + refund.amount;
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
    console.error('[opn/handleRefundNotify] txn update failed:', txnUpdateErr);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }

  // 4. Mirror the new status to the rental's payment_status.
  if (txn.club_rental_id) {
    const { error: rentalUpdateErr } = await supabase
      .from('club_rentals')
      .update({ payment_status: newTxnStatus })
      .eq('id', txn.club_rental_id);
    if (rentalUpdateErr) {
      // Non-fatal — txn is the source of truth; staff can reconcile.
      console.error('[opn/handleRefundNotify] rental update failed:', rentalUpdateErr);
    }
  }

  // 5. Customer refund email — claim-and-send prevents double delivery on
  //    idempotent webhook replays. Fire-and-forget: errors are logged but
  //    don't affect the 200 ack (Opn must not retry for email issues).
  void claimAndSendRefundEmail(supabase, upsertedRefund.id, {
    refundSn: refundId,
  }).catch(err => console.error('[opn/handleRefundNotify] email error:', err));

  // 6. Staff LINE notification — best-effort, fire-and-forget.
  if (opts.baseUrl && txn.club_rental_id) {
    const { data: rentalForLine } = await supabase
      .from('club_rentals')
      .select('rental_code, customer_name')
      .eq('id', txn.club_rental_id)
      .single();

    const refundThb = (refund.amount / 100).toLocaleString();
    const lineMessage = [
      `Refund ${newTxnStatus === 'refunded' ? 'Completed' : 'Issued (partial)'} (${rentalForLine?.rental_code ?? '?'})`,
      rentalForLine?.customer_name ? `Customer: ${rentalForLine.customer_name}` : null,
      `Refund: ฿${refundThb}`,
      `Refund ID: ${refundId}`,
    ]
      .filter(Boolean)
      .join('\n');

    fetch(`${opts.baseUrl}/api/notifications/line`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: lineMessage }),
    }).catch(err =>
      console.error('[opn/handleRefundNotify] LINE notification error:', err)
    );
  }

  return NextResponse.json({ object: 'ok' });
}
