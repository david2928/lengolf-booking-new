import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { claimAndSendConfirmationEmail } from '@/lib/payments/markRentalAsPaid';
import { composeRentalLineMessage } from '@/lib/club-rental/lineMessage';
import { isChargeSuccessful, type OpnCharge } from '@/lib/opn/types';

const IS_PROD_ENV = process.env.VERCEL_ENV === 'production';

/**
 * Single writer for a TERMINAL Opn charge result.
 *
 * Three triggers feed the same function so the DB writes and the
 * side-effects (customer email, staff LINE) have exactly one shape:
 *   1. /api/webhooks/opn        — charge.complete / terminal charge.create
 *   2. /api/payments/opn/intent — synchronous (non-3DS) charge results
 *   3. /api/payments/opn/return — polling fallback after a gateway probe
 *
 * Exactly-once posture:
 *   - The terminal-state idempotency guard makes repeat invocations
 *     short-circuit, so the transition (and its side-effects) runs once.
 *   - The email additionally goes through claimAndSendConfirmationEmail's
 *     atomic claim, so even a true race between two triggers cannot
 *     double-send. The LINE ping has no claim — in a tight race between
 *     two triggers staff could very rarely see a duplicate ping, which
 *     is operationally harmless (a missing ping is not).
 *
 * Idempotency guard details (ported from the hardened ShopeePay
 * webhook, commits 305a1dc + 15eec1a):
 *   - ALL four terminal txn states short-circuit. 'refunded' and
 *     'partially_refunded' matter most: a refunded Omise charge still
 *     reads status:'successful', paid:true, so a charge.complete replay
 *     after a refund would otherwise reset the rental to paid.
 *   - For terminal 'success', the rental is verified consistent
 *     (payment_status='paid') before short-circuiting; a half-committed
 *     prior delivery (txn updated, rental update failed → retry) falls
 *     through and gets repaired.
 *
 * All side-effects are awaited in try/catch — `void promise()` dies on
 * Vercel once the response is sent.
 */

export type ChargeProcessOutcome =
  | { kind: 'no_txn' }
  | { kind: 'amount_mismatch' }
  | { kind: 'db_error' }
  | { kind: 'already_terminal'; txnStatus: string }
  | { kind: 'processed'; isSuccess: boolean };

export async function processChargeResult(
  supabase: SupabaseClient,
  charge: OpnCharge,
  opts: { baseUrl: string }
): Promise<ChargeProcessOutcome> {
  // Defensive: order + limit(1) rather than a bare maybeSingle so a stray
  // duplicate gateway_charge_id (which a partial-unique index now prevents,
  // but belt-and-suspenders) picks the most recent row instead of throwing
  // PGRST116 → db_error → an infinite webhook-retry storm.
  const { data: txn, error: txnErr } = await supabase
    .from('payment_transactions')
    .select('id, club_rental_id, amount, status')
    .eq('gateway_charge_id', charge.id)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (txnErr) {
    console.error('[opn/processCharge] txn lookup failed:', txnErr);
    return { kind: 'db_error' };
  }
  if (!txn) {
    // e.g. a dashboard-created test charge that never went through our
    // intent route.
    console.warn(`[opn/processCharge] no txn for charge ${charge.id}`);
    return { kind: 'no_txn' };
  }

  // Amount tampering check (both sides are satang).
  if (charge.amount !== txn.amount) {
    console.error(
      `[opn/processCharge] amount mismatch for ${charge.id}: expected ${txn.amount}, got ${charge.amount}`
    );
    return { kind: 'amount_mismatch' };
  }

  const TERMINAL_TXN_STATUSES = new Set(['success', 'failed', 'refunded', 'partially_refunded']);
  if (TERMINAL_TXN_STATUSES.has(txn.status)) {
    if (txn.status === 'success' && txn.club_rental_id) {
      const { data: rentalCheck } = await supabase
        .from('club_rentals')
        .select('payment_status')
        .eq('id', txn.club_rental_id)
        .maybeSingle();
      if (rentalCheck && rentalCheck.payment_status === 'paid') {
        return { kind: 'already_terminal', txnStatus: txn.status };
      }
      console.warn(
        `[opn/processCharge] replay for ${charge.id} but rental payment_status is ` +
          `${rentalCheck?.payment_status ?? 'unknown'} — re-running rental update + side-effects`
      );
    } else {
      return { kind: 'already_terminal', txnStatus: txn.status };
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

  // Conditional update doubles as a single-writer lock: only transition if
  // the row is STILL in the state we read. Two concurrent deliveries (a
  // webhook + the polling probe, or a replayed delivery) both read the same
  // pre-terminal status, but only the first UPDATE matches the .eq('status')
  // guard — the loser gets zero rows back and bails, so the rental flip +
  // side-effects run once. (The email is additionally claim-deduped; this
  // also single-fires the LINE ping and rental write.)
  const { data: locked, error: updateErr } = await supabase
    .from('payment_transactions')
    .update(updates)
    .eq('id', txn.id)
    .eq('status', txn.status)
    .select('id')
    .maybeSingle();

  if (updateErr) {
    console.error('[opn/processCharge] txn update failed:', updateErr);
    return { kind: 'db_error' };
  }
  if (!locked) {
    // Another writer transitioned this row between our read and update.
    console.warn(`[opn/processCharge] lost transition race for ${charge.id} — already handled`);
    return { kind: 'already_terminal', txnStatus: isSuccess ? 'success' : 'failed' };
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

      if (opts.baseUrl && failedRental) {
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
          await fetch(`${opts.baseUrl}/api/notifications/line`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ message: lineMessage }),
          });
        } catch (err) {
          console.error('[opn/processCharge] LINE notification error (failed):', err);
        }
      }
    }
    return { kind: 'processed', isSuccess: false };
  }

  // ----- Success path -----

  if (!txn.club_rental_id) {
    console.warn(`[opn/processCharge] success but no club_rental_id for ${charge.id}`);
    return { kind: 'processed', isSuccess: true };
  }

  const { data: rental, error: rentalErr } = await supabase
    .from('club_rentals')
    .update({ payment_status: 'paid', expires_at: null })
    .eq('id', txn.club_rental_id)
    .select('*')
    .single();

  if (rentalErr || !rental) {
    console.error('[opn/processCharge] rental update failed:', rentalErr);
    // Txn is terminal but the rental isn't — report db_error so the
    // webhook caller returns non-2xx and Opn retries; the consistency
    // fallthrough above repairs it on the next invocation.
    return { kind: 'db_error' };
  }

  try {
    await claimAndSendConfirmationEmail(supabase, txn.id, txn.club_rental_id, {
      transactionSn: charge.id,
    });
  } catch (err) {
    console.error('[opn/processCharge] email side-effect failed:', err);
  }

  if (opts.baseUrl) {
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
      await fetch(`${opts.baseUrl}/api/notifications/line`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: lineMessage }),
      });
    } catch (err) {
      console.error('[opn/processCharge] LINE notification error:', err);
    }
  }

  return { kind: 'processed', isSuccess: true };
}
