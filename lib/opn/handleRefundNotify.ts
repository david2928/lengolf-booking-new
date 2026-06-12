import 'server-only';
import { NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { OpnRefund } from '@/lib/opn/types';
import { claimAndSendRefundEmail } from '@/lib/payments/markRefundAsRefunded';
import { composeRentalLineMessage } from '@/lib/club-rental/lineMessage';

const IS_PROD_ENV = process.env.VERCEL_ENV === 'production';

/**
 * Handle a refund.create webhook event from Opn.
 *
 * Unlike ShopeePay (whose refund webhook is dormant on the gateway
 * side), Opn fires refund.create for EVERY refund — including ones our
 * own /api/payments/opn/refund route initiated and already recorded
 * synchronously. The handler therefore has to distinguish:
 *
 *   A. Row exists with status='success' — our refund route (or a prior
 *      webhook delivery) already recorded it AND incremented
 *      refunded_amount. Record the raw webhook payload if it's missing,
 *      then ack WITHOUT incrementing again. This is what prevents the
 *      API-initiated-refund double-count.
 *   B. Row exists but isn't terminal (defensive — shouldn't happen in
 *      the Opn flow) — confirm it as success and run the increment +
 *      rental flip + side-effects.
 *   C. No row exists — dashboard-initiated refund (staff used Opn's
 *      merchant dashboard, bypassing our backend). Self-create the row
 *      with synthetic audit values (mirrors ShopeePay's orphan-refund
 *      path), then increment + flip + side-effects.
 *
 * Invariant carried over from the ShopeePay refund paths: a FULL refund
 * flips club_rentals.status='cancelled' in addition to
 * payment_status='refunded' — the availability query filters on
 * status IN ('reserved','picked_up'), so without the flip a refunded
 * rental silently keeps blocking the club set's dates.
 *
 * Opn's refund.create only fires for confirmed refunds — there is no
 * pending/failed variant of the event.
 */

const ACK_OK = { object: 'ok' as const };

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
  refund: OpnRefund,
  opts: RefundNotifyOptions
): Promise<NextResponse> {
  const chargeId = refund.charge; // chrg_*
  const refundId = refund.id; // rfnd_*

  if (!refundId || !chargeId) {
    console.warn('[opn/refund-notify] payload missing refund/charge id — ack and ignore');
    return NextResponse.json(ACK_OK);
  }

  // 1. Look up an existing refund row. Our /api/payments/opn/refund
  // route stores Opn's rfnd_* id as refund_reference_id, so an
  // API-initiated refund is found here.
  const { data: existingRow, error: lookupErr } = await supabase
    .from('payment_refunds')
    .select('id, payment_transaction_id, amount, status, raw_webhook_payload')
    .eq('refund_reference_id', refundId)
    .maybeSingle<PaymentRefundRow>();

  if (lookupErr) {
    console.error('[opn/refund-notify] refund lookup failed:', lookupErr);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }

  let refundRow = existingRow;
  let isFirstRecording = false;

  if (refundRow) {
    // Amount tampering check.
    if (typeof refund.amount !== 'number' || refund.amount !== refundRow.amount) {
      console.error(
        `[opn/refund-notify] amount mismatch for ${refundId}: ` +
          `expected ${refundRow.amount}, got ${refund.amount}`
      );
      return NextResponse.json({ error: 'Amount mismatch' }, { status: 400 });
    }

    if (refundRow.status === 'success') {
      // Path A: already recorded (API route or earlier delivery). The
      // increment + rental flip + side-effects ran when the row reached
      // 'success' — do NOT run them again. Just capture the webhook
      // payload for the audit trail if this is the first delivery.
      if (!refundRow.raw_webhook_payload) {
        await supabase
          .from('payment_refunds')
          .update({ raw_webhook_payload: refund as unknown as Record<string, unknown> })
          .eq('id', refundRow.id);
      }
      return NextResponse.json(ACK_OK);
    }

    // Path B: row exists but not terminal-success (defensive). Confirm
    // it and fall through to the increment + side-effects.
    const { error: confirmErr } = await supabase
      .from('payment_refunds')
      .update({
        status: 'success',
        refunded_at: new Date().toISOString(),
        raw_webhook_payload: refund as unknown as Record<string, unknown>,
      })
      .eq('id', refundRow.id);

    if (confirmErr) {
      console.error('[opn/refund-notify] refund confirm failed:', confirmErr);
      return NextResponse.json({ error: 'Internal error' }, { status: 500 });
    }
    isFirstRecording = true;
  } else {
    // Path C: orphan refund — initiated from Opn's merchant dashboard,
    // never passed through our backend. Self-create the row so refunds
    // are captured regardless of origin (same lesson as ShopeePay UAT
    // 2026-05-23: a portal refund was acked but never recorded, leaving
    // the rental 'paid' while the customer's card was credited).
    const { data: parentTxn, error: parentErr } = await supabase
      .from('payment_transactions')
      .select('id, amount, refunded_amount')
      .eq('gateway_charge_id', chargeId)
      .maybeSingle();

    if (parentErr) {
      console.error('[opn/refund-notify] parent txn lookup failed:', parentErr);
      return NextResponse.json({ error: 'Internal error' }, { status: 500 });
    }
    if (!parentTxn) {
      // A charge created outside this system (e.g. dashboard test
      // charge). Ack so Opn doesn't retry forever.
      console.warn(`[opn/refund-notify] orphan refund ${refundId} — no txn for ${chargeId}`);
      return NextResponse.json(ACK_OK);
    }

    // Refund-amount sanity check before insert.
    if (
      typeof refund.amount !== 'number' ||
      refund.amount <= 0 ||
      refund.amount > parentTxn.amount
    ) {
      console.error(
        `[opn/refund-notify] orphan refund ${refundId}: invalid amount ` +
          `${refund.amount} vs parent ${parentTxn.amount}`
      );
      return NextResponse.json({ error: 'Invalid refund amount' }, { status: 400 });
    }

    const { data: insertedRefund, error: insertErr } = await supabase
      .from('payment_refunds')
      .insert({
        payment_transaction_id: parentTxn.id,
        refund_reference_id: refundId,
        // Synthetic values satisfy the NOT NULL audit columns and flag
        // the out-of-band origin for forensic tracing.
        request_id: `merchant-dashboard-${refundId}`,
        amount: refund.amount,
        reason: 'Opn dashboard refund (originated outside our backend)',
        status: 'success',
        initiated_by_email: 'merchant-dashboard@opn',
        initiated_by_name: 'Opn Merchant Dashboard',
        refund_sn: refundId,
        refunded_at: new Date().toISOString(),
        raw_webhook_payload: refund as unknown as Record<string, unknown>,
      })
      .select('id, payment_transaction_id, amount, status, raw_webhook_payload')
      .single<PaymentRefundRow>();

    if (insertErr || !insertedRefund) {
      console.error('[opn/refund-notify] orphan refund insert failed:', insertErr);
      return NextResponse.json({ error: 'Internal error' }, { status: 500 });
    }

    refundRow = insertedRefund;
    isFirstRecording = true;
    console.log(`[opn/refund-notify] self-created orphan refund row ${refundRow.id} for ${refundId}`);
  }

  if (!isFirstRecording) {
    return NextResponse.json(ACK_OK);
  }

  // ----- First recording of this refund: increment + flip + notify -----

  // 2. Increment the parent transaction's refunded_amount and derive
  // the new status. Read-then-write — acceptable because this path runs
  // exactly once per rfnd_* id (Path A short-circuits replays).
  const { data: txn, error: txnErr } = await supabase
    .from('payment_transactions')
    .select('id, club_rental_id, amount, refunded_amount')
    .eq('id', refundRow.payment_transaction_id)
    .single<PaymentTransactionRow>();

  if (txnErr || !txn) {
    console.error('[opn/refund-notify] txn load failed:', txnErr);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }

  const newRefundedAmount = (txn.refunded_amount ?? 0) + refundRow.amount;
  const newTxnStatus = newRefundedAmount >= txn.amount ? 'refunded' : 'partially_refunded';

  const { error: txnUpdateErr } = await supabase
    .from('payment_transactions')
    .update({
      refunded_amount: newRefundedAmount,
      status: newTxnStatus,
      refunded_at: new Date().toISOString(),
    })
    .eq('id', txn.id);

  if (txnUpdateErr) {
    console.error('[opn/refund-notify] txn update failed:', txnUpdateErr);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }

  // 3. Mirror to the rental — and for a FULL refund, flip lifecycle
  // status to 'cancelled' so the availability slot frees up.
  if (txn.club_rental_id) {
    const rentalUpdates: Record<string, unknown> = { payment_status: newTxnStatus };
    if (newTxnStatus === 'refunded') {
      rentalUpdates.status = 'cancelled';
    }

    const { error: rentalUpdateErr } = await supabase
      .from('club_rentals')
      .update(rentalUpdates)
      .eq('id', txn.club_rental_id);
    if (rentalUpdateErr) {
      // Non-fatal — txn is the source of truth; staff can reconcile.
      console.error('[opn/refund-notify] rental update failed:', rentalUpdateErr);
    }
  }

  // 4. Customer refund email — claim-and-send dedup. AWAIT + try/catch:
  // fire-and-forget dies on Vercel once the response is sent.
  try {
    await claimAndSendRefundEmail(supabase, refundRow.id, { refundSn: refundId });
  } catch (err) {
    console.error('[opn/refund-notify] email side-effect failed:', err);
  }

  // 5. Staff LINE notification — unified composer.
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
                refundSn: refundId,
              }
            : {
                kind: 'PartiallyRefunded',
                refundedThisTimeSatang: refundRow.amount,
                totalRefundedSatang: newRefundedAmount,
                refundSn: refundId,
              },
        uatPrefix: !IS_PROD_ENV,
      });

      try {
        await fetch(`${opts.baseUrl}/api/notifications/line`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message: lineMessage }),
        });
      } catch (err) {
        console.error('[opn/refund-notify] LINE notification error:', err);
      }
    }
  }

  return NextResponse.json(ACK_OK);
}
