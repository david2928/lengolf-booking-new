import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/utils/supabase/admin';
import { createRefund, OpnApiError } from '@/lib/opn/client';
import { claimAndSendRefundEmail } from '@/lib/payments/markRefundAsRefunded';
import { composeRentalLineMessage } from '@/lib/club-rental/lineMessage';

/**
 * POST /api/payments/opn/refund
 *
 * Backoffice-initiated refund for Opn-paid rentals. Mirrors the
 * ShopeePay refund route's contract (lengolf-forms calls both with the
 * same bearer token + body shape) with one structural difference:
 *
 * Opn DOES emit refund.create webhooks (ShopeePay's are dormant), so
 * the write-ordering is inverted to avoid double-recording:
 *   - ShopeePay route: insert pending row → call gateway → flip row.
 *   - This route: call gateway (with a DETERMINISTIC Idempotency-Key)
 *     → insert the row keyed on the returned rfnd_* id.
 * If the refund.create webhook lands before our insert, the webhook's
 * orphan path records the refund first and our insert hits the UNIQUE
 * constraint on refund_reference_id — which we treat as "already
 * recorded": skip the increment + side-effects and return success.
 * The claim-and-send email dedup guarantees one customer email no
 * matter which writer wins.
 *
 * Crash safety: if the server dies between the gateway call and the
 * insert, the webhook self-creates the row (orphan path) — nothing is
 * lost. Failed gateway attempts still get an audit row (status=failed,
 * synthetic reference — failed refunds emit no webhook).
 *
 * Body: { rental_code, amount?, reason?, initiated_by_email? }
 * amount in satang; omitted = full remaining. Success response matches
 * the ShopeePay route's shape.
 */

const BACKOFFICE_TOKEN_MIN_LENGTH = 32;

interface RefundBody {
  rental_code?: string;
  amount?: number;
  reason?: string;
  initiated_by_email?: string;
}

function verifyBearerToken(request: NextRequest): { ok: true } | { ok: false; status: number; message: string } {
  const expected = process.env.BACKOFFICE_API_TOKEN;
  if (!expected || expected.length < BACKOFFICE_TOKEN_MIN_LENGTH) {
    return {
      ok: false,
      status: 503,
      message:
        'Refund endpoint is not configured. Set BACKOFFICE_API_TOKEN (32+ chars) in this environment.',
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

  // Constant-time compare to avoid timing attacks.
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

const IS_PROD_ENV = process.env.VERCEL_ENV === 'production';

export async function POST(request: NextRequest) {
  // 1. Auth
  const auth = verifyBearerToken(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  }

  // 2. Parse + validate body
  let body: RefundBody;
  try {
    body = (await request.json()) as RefundBody;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { rental_code, amount: requestedAmount, reason, initiated_by_email } = body;

  if (!rental_code || typeof rental_code !== 'string' || rental_code.length > 32) {
    return NextResponse.json({ error: 'rental_code is required' }, { status: 400 });
  }
  if (requestedAmount !== undefined && (!Number.isInteger(requestedAmount) || requestedAmount <= 0)) {
    return NextResponse.json(
      { error: 'amount must be a positive integer in satang (or omit for full remaining refund)' },
      { status: 400 }
    );
  }
  // payment_refunds.reason has a DB CHECK (length >= 10) — return a clean
  // 400 rather than a 500 from the DB violation.
  if (
    reason !== undefined &&
    (typeof reason !== 'string' || reason.length < 10 || reason.length > 500)
  ) {
    return NextResponse.json({ error: 'reason must be a string of 10–500 chars' }, { status: 400 });
  }
  if (
    initiated_by_email !== undefined &&
    (typeof initiated_by_email !== 'string' || initiated_by_email.length > 254)
  ) {
    return NextResponse.json({ error: 'initiated_by_email is invalid' }, { status: 400 });
  }

  const supabase = createAdminClient();

  // 3. Load rental + linked parent payment_transaction
  const { data: rental, error: rentalError } = await supabase
    .from('club_rentals')
    .select('id, rental_code, payment_status, payment_transaction_id')
    .eq('rental_code', rental_code)
    .single();

  if (rentalError || !rental) {
    return NextResponse.json({ error: 'Rental not found' }, { status: 404 });
  }
  if (!rental.payment_transaction_id) {
    return NextResponse.json({ error: 'Rental has no Opn transaction to refund' }, { status: 409 });
  }

  const { data: parentTxn, error: txnError } = await supabase
    .from('payment_transactions')
    .select('id, payment_reference_id, gateway_charge_id, amount, refunded_amount, status, gateway')
    .eq('id', rental.payment_transaction_id)
    .single();

  if (txnError || !parentTxn) {
    return NextResponse.json({ error: 'Parent transaction not found' }, { status: 404 });
  }
  if (parentTxn.gateway !== 'opn') {
    return NextResponse.json(
      { error: `Refund via this endpoint is only available for Opn (got ${parentTxn.gateway})` },
      { status: 400 }
    );
  }
  if (!parentTxn.gateway_charge_id) {
    return NextResponse.json(
      { error: 'Parent transaction has no gateway charge id' },
      { status: 409 }
    );
  }
  if (parentTxn.status !== 'success' && parentTxn.status !== 'partially_refunded') {
    return NextResponse.json(
      {
        error: `Cannot refund a transaction in status '${parentTxn.status}' (must be 'success' or 'partially_refunded')`,
      },
      { status: 409 }
    );
  }

  // 4. Compute refund amount + remaining cap
  const alreadyRefunded = parentTxn.refunded_amount ?? 0;
  const remainingSatang = parentTxn.amount - alreadyRefunded;
  if (remainingSatang <= 0) {
    return NextResponse.json({ error: 'Transaction is already fully refunded' }, { status: 409 });
  }
  const refundAmountSatang = requestedAmount ?? remainingSatang;
  if (refundAmountSatang > remainingSatang) {
    return NextResponse.json(
      { error: `amount ${refundAmountSatang} exceeds remaining refundable ${remainingSatang} satang` },
      { status: 400 }
    );
  }

  // 5. Deterministic Idempotency-Key: two racing identical requests
  // (staff double-click) compute the same refund index → same key →
  // Omise returns the SAME rfnd_* instead of refunding twice. A
  // deliberate second partial refund happens after the first row is
  // recorded, so it sees count+1 → a fresh key.
  const { count: existingRefundCount, error: countErr } = await supabase
    .from('payment_refunds')
    .select('id', { count: 'exact', head: true })
    .eq('payment_transaction_id', parentTxn.id);

  if (countErr) {
    console.error('[opn/refund] count existing refunds failed:', countErr);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }

  const refundIndex = (existingRefundCount ?? 0) + 1;
  const idempotencyKey = `${parentTxn.payment_reference_id}-R${refundIndex}`;
  const requestId = `lengolf-rfd-${rental.rental_code}-R${refundIndex}`;

  // 6. Call the gateway FIRST (see write-ordering note in the header).
  let refund;
  try {
    refund = await createRefund(parentTxn.gateway_charge_id, refundAmountSatang, idempotencyKey);
  } catch (e) {
    console.error('[opn/refund] gateway call failed:', e);
    // Audit row for the failed attempt. Synthetic unique reference —
    // failed refunds emit no webhook, so nothing ever joins on it.
    const failMsg =
      e instanceof OpnApiError ? `${e.code}: ${e.message}`.slice(0, 500) : ((e as Error).message?.slice(0, 500) ?? 'unknown');
    await supabase.from('payment_refunds').insert({
      payment_transaction_id: parentTxn.id,
      refund_reference_id: `${parentTxn.payment_reference_id}-RF${Date.now().toString(36)}`,
      request_id: requestId,
      amount: refundAmountSatang,
      reason: reason ?? 'Refund issued via backoffice',
      status: 'failed',
      initiated_by_email: initiated_by_email ?? 'backoffice@lengolf',
      initiated_by_name: 'Backoffice',
      error_message: failMsg,
    });
    const gatewayRejected = e instanceof OpnApiError && e.httpStatus < 500;
    return NextResponse.json(
      {
        error: gatewayRejected
          ? `Payment gateway rejected the refund: ${failMsg}`
          : 'Payment gateway is not reachable. Please try again.',
      },
      { status: 502 }
    );
  }

  // 7. Record the refund. UNIQUE violation on refund_reference_id means
  // the refund.create webhook beat us to it (orphan self-create path) —
  // everything is already recorded + incremented, so just return success.
  const refundedAt = new Date().toISOString();
  const { data: refundRow, error: insertErr } = await supabase
    .from('payment_refunds')
    .insert({
      payment_transaction_id: parentTxn.id,
      refund_reference_id: refund.id, // rfnd_* — what the webhook joins on
      request_id: requestId,
      amount: refundAmountSatang,
      reason: reason ?? 'Refund issued via backoffice',
      status: 'success',
      initiated_by_email: initiated_by_email ?? 'backoffice@lengolf',
      initiated_by_name: 'Backoffice',
      refund_sn: refund.id,
      refunded_at: refundedAt,
      raw_create_response: refund as unknown as Record<string, unknown>,
    })
    .select('id')
    .single();

  if (insertErr || !refundRow) {
    console.warn(
      `[opn/refund] insert raced (webhook likely recorded ${refund.id} first):`,
      insertErr?.code ?? insertErr
    );
    const { data: freshTxn } = await supabase
      .from('payment_transactions')
      .select('status')
      .eq('id', parentTxn.id)
      .maybeSingle();
    return NextResponse.json({
      success: true,
      refund: {
        id: null,
        refund_reference_id: refund.id,
        refund_sn: refund.id,
        amount_satang: refundAmountSatang,
        new_txn_status: freshTxn?.status ?? 'refunded',
      },
    });
  }

  // 8. Increment the parent transaction + flip the rental.
  const newRefundedAmount = alreadyRefunded + refundAmountSatang;
  const newTxnStatus = newRefundedAmount >= parentTxn.amount ? 'refunded' : 'partially_refunded';

  const { error: txnUpdateErr } = await supabase
    .from('payment_transactions')
    .update({
      refunded_amount: newRefundedAmount,
      status: newTxnStatus,
      refunded_at: refundedAt,
    })
    .eq('id', parentTxn.id);

  if (txnUpdateErr) {
    console.error('[opn/refund] parent transaction update failed:', txnUpdateErr);
    // Don't fail the response — gateway has the truth; staff can reconcile.
  }

  // FULL refund also flips lifecycle status to 'cancelled' so the slot
  // frees up (availability filters on status IN ('reserved','picked_up')).
  // Partial refunds leave status alone — the rental stays active for the
  // remaining balance.
  const rentalUpdates: Record<string, unknown> = { payment_status: newTxnStatus };
  if (newTxnStatus === 'refunded') {
    rentalUpdates.status = 'cancelled';
  }

  const { error: rentalUpdateErr } = await supabase
    .from('club_rentals')
    .update(rentalUpdates)
    .eq('id', rental.id);

  if (rentalUpdateErr) {
    console.error('[opn/refund] rental status update failed:', rentalUpdateErr);
  }

  // 9. Customer email + staff LINE — AWAIT + try/catch (fire-and-forget
  // dies on Vercel). Email is claim-deduped against the webhook path.
  try {
    await claimAndSendRefundEmail(supabase, refundRow.id, { refundSn: refund.id });
  } catch (err) {
    console.error('[opn/refund] email side-effect failed:', err);
  }

  const baseUrl = getBaseUrl();
  if (baseUrl) {
    const { data: rentalForLine } = await supabase
      .from('club_rentals')
      .select('*')
      .eq('id', rental.id)
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
                refundedSatang: refundAmountSatang,
                refundSn: refund.id,
              }
            : {
                kind: 'PartiallyRefunded',
                refundedThisTimeSatang: refundAmountSatang,
                totalRefundedSatang: newRefundedAmount,
                refundSn: refund.id,
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
        console.error('[opn/refund] LINE notification error:', err);
      }
    }
  }

  // 10. Return success — same shape as the ShopeePay refund route.
  return NextResponse.json({
    success: true,
    refund: {
      id: refundRow.id,
      refund_reference_id: refund.id,
      refund_sn: refund.id,
      amount_satang: refundAmountSatang,
      new_txn_status: newTxnStatus,
    },
  });
}
