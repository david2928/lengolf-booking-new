import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/utils/supabase/admin';
import { checkTransaction } from '@/lib/shopeepay/client';
import { isFinalSuccess } from '@/lib/shopeepay/types';
import { loadRentalOrderSummary } from '@/lib/shopeepay/order-summary';
import { claimAndSendConfirmationEmail } from '@/lib/shopeepay/markRentalAsPaid';
import { applyOrderPaymentState } from '@/lib/shopeepay/orderPayment';
import {
  LINK_CODE_PATTERN,
  finalizeAdhocPaid,
  markPaymentLinkFailed,
  loadPaymentLink,
} from '@/lib/shopeepay/adhocLink';
import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * GET /api/payments/shopeepay/status?ref=<rental_code>
 *
 * Frontend polls this from /payment/result. Returns the current
 * payment_transactions.status, calling ShopeePay's /transaction/check
 * as a fallback when the webhook is delayed or the row is still
 * pending. Per the partner UAT contract, the redirect back to
 * /payment/result is NOT trusted as proof of success.
 *
 * Modern UX requirements:
 *  - On poll-detected success, fire the customer confirmation email
 *    via claimAndSendConfirmationEmail() (idempotent vs the webhook).
 *  - Return a normalized failure_reason so the client can render
 *    decline-vs-cancelled-vs-expired UX, not a generic "failed".
 *  - Return the order summary so /payment/result can render a real
 *    receipt without a separate roundtrip.
 */

type PublicStatus = 'pending' | 'redirected' | 'success' | 'failed' | 'refunded';
type FailureReason = 'declined' | 'cancelled' | 'expired' | 'unknown' | null;

const SHOPEEPAY_DECLINED_CODES = new Set([3, 4]); // ShopeePay's declined-by-issuer / failure codes
const SHOPEEPAY_CANCELLED_CODES = new Set([5]); // user-initiated cancel

function classifyFailure(errcode: number | null | undefined): FailureReason {
  if (errcode == null) return 'unknown';
  if (SHOPEEPAY_DECLINED_CODES.has(errcode)) return 'declined';
  if (SHOPEEPAY_CANCELLED_CODES.has(errcode)) return 'cancelled';
  return 'unknown';
}

/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Ad-hoc payment-link branch of the status poll.
 *
 * Mirrors the rental logic, with two deliberate differences:
 *  - No customer confirmation email (v1 scope decision — staff notification only).
 *  - The paid flip goes through finalizeAdhocPaid(), the SAME helper the webhook
 *    uses, so whichever path confirms first fires exactly one staff notification.
 *  - `summary` is always null: an ad-hoc link has no club sets or dates to
 *    itemise. The result page already guards on `summary` and renders the
 *    `description` line instead.
 */
async function adhocStatus(supabase: SupabaseClient<any, any, any>, ref: string) {
  const link = await loadPaymentLink(supabase, ref);
  if (!link) {
    return NextResponse.json({ error: 'Payment link not found' }, { status: 404 });
  }

  const { data: txnData } = await supabase
    .from('payment_transactions')
    .select('id, status, payment_reference_id, transaction_sn, amount, paid_at, error_code')
    .eq('payment_link_id', link.id)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  const txn = txnData as {
    id: string;
    status: string;
    payment_reference_id: string;
    transaction_sn: string | null;
    amount: number;
    paid_at: string | null;
    error_code: number | null;
  } | null;

  const basePayload = {
    ref,
    total_price: link.amount / 100,
    description: link.description,
    summary: null,
  };

  if (!txn) {
    // Link exists but was never minted (still 'draft', or the mint failed).
    return NextResponse.json({
      ...basePayload,
      status: 'unpaid' as const,
      transaction_sn: null,
      paid_at: null,
      failure_reason: null as FailureReason,
    });
  }

  let status = txn.status as PublicStatus;
  let transactionSn = txn.transaction_sn;
  let paidAt = txn.paid_at;
  let failureReason: FailureReason = status === 'failed' ? classifyFailure(txn.error_code) : null;

  if (status === 'pending' || status === 'redirected') {
    try {
      const probe = await checkTransaction({
        request_id: `check-${link.link_code}-${Date.now()}`,
        reference_id: txn.payment_reference_id,
        amount: txn.amount,
      });

      if (probe.errcode === 0 && isFinalSuccess(probe)) {
        const updates: Record<string, unknown> = {
          status: 'success',
          paid_at: new Date().toISOString(),
        };
        if (probe.transaction_sn) updates.transaction_sn = probe.transaction_sn;
        if (typeof probe.payment_channel === 'number') {
          updates.payment_channel = probe.payment_channel;
        }
        if (probe.payment_method !== undefined && probe.payment_method !== null) {
          updates.payment_method = String(probe.payment_method);
        }

        await supabase.from('payment_transactions').update(updates).eq('id', txn.id);

        // Shared with the webhook — see finalizeAdhocPaid's docstring.
        try {
          await finalizeAdhocPaid(supabase, link.id, {
            transactionSn: probe.transaction_sn ?? transactionSn,
          });
        } catch (err) {
          console.error('[ShopeePay/status] adhoc paid flip failed:', err);
        }

        status = 'success';
        transactionSn = probe.transaction_sn ?? transactionSn;
        paidAt = new Date().toISOString();
        failureReason = null;
      } else if (
        probe.errcode === 0 &&
        (probe.status !== undefined || probe.transaction_status !== undefined)
      ) {
        await supabase
          .from('payment_transactions')
          .update({ status: 'failed', error_code: probe.errcode })
          .eq('id', txn.id);
        try {
          await markPaymentLinkFailed(supabase, link.id, 'gateway declined (status poll)');
        } catch {
          /* already logged */
        }
        status = 'failed';
        failureReason = classifyFailure(
          typeof probe.status === 'number' ? probe.status : probe.errcode
        );
      }
      // else: still processing — leave pending and let the client poll again.
    } catch (e) {
      console.warn('[ShopeePay/status] adhoc /transaction/check probe failed:', e);
    }
  }

  return NextResponse.json({
    ...basePayload,
    status,
    transaction_sn: transactionSn || null,
    paid_at: paidAt || null,
    failure_reason: failureReason,
  });
}

export async function GET(request: NextRequest) {
  const ref = request.nextUrl.searchParams.get('ref');
  if (!ref || ref.length > 32 || !/^[A-Za-z0-9-]+$/.test(ref)) {
    return NextResponse.json({ error: 'Invalid ref' }, { status: 400 });
  }

  const supabase = createAdminClient();

  // Ad-hoc payment link (PL-...) rather than a club rental (CR-...). Branch
  // before the club_rentals lookup, which would 404 on a PL- ref.
  if (LINK_CODE_PATTERN.test(ref)) {
    return adhocStatus(supabase, ref);
  }

  // Find the rental + its most recent payment_transactions row.
  const { data: rental, error: rentalError } = await supabase
    .from('club_rentals')
    // total_price is ORDER-canonical (Phase 2 drop) — the receipt total comes
    // from loadRentalOrderSummary (order-aware), never the line.
    .select('id, rental_code, payment_status, rental_type, order_id')
    .eq('rental_code', ref)
    .single();

  if (rentalError || !rental) {
    return NextResponse.json({ error: 'Rental not found' }, { status: 404 });
  }
  if (rental.rental_type !== 'course') {
    return NextResponse.json({ error: 'Not applicable' }, { status: 400 });
  }

  const { data: txn } = await supabase
    .from('payment_transactions')
    .select('id, status, payment_reference_id, transaction_sn, amount, paid_at, error_code')
    .eq('club_rental_id', rental.id)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!txn) {
    // No payment was ever attempted for this rental.
    return NextResponse.json({
      ref,
      status: 'unpaid' as const,
      // Line money is order-canonical (Phase 2 drop) and no order summary is
      // loaded on this path — degrade to null; display-only field.
      total_price: null,
      failure_reason: null as FailureReason,
    });
  }

  let status = txn.status as PublicStatus;
  let transactionSn = txn.transaction_sn;
  let paidAt = txn.paid_at;
  let failureReason: FailureReason = status === 'failed' ? classifyFailure(txn.error_code) : null;

  // If still pending, ask ShopeePay directly. /transaction/check is the
  // documented fallback when the webhook is delayed.
  if (status === 'pending' || status === 'redirected') {
    try {
      const probe = await checkTransaction({
        request_id: `check-${rental.rental_code}-${Date.now()}`,
        reference_id: txn.payment_reference_id,
        amount: txn.amount,
      });

      if (probe.errcode === 0 && isFinalSuccess(probe)) {
        // Promote to success locally. The webhook handler is the
        // source of truth for staff LINE notification — we only
        // claim-and-send the customer email here, which is idempotent
        // via confirmation_email_sent_at.
        const updates: Record<string, unknown> = {
          status: 'success',
          paid_at: new Date().toISOString(),
        };
        if (probe.transaction_sn) updates.transaction_sn = probe.transaction_sn;
        if (typeof probe.payment_channel === 'number') {
          updates.payment_channel = probe.payment_channel;
        }
        // ShopeePay's notify webhook delivered payment_method as a number
        // (16) in UAT 2026-05-15 even though the docs type it as a string.
        // The /transaction/check response uses the same shape, so apply
        // the same defensive coercion here — DB column is TEXT.
        if (probe.payment_method !== undefined && probe.payment_method !== null) {
          updates.payment_method = String(probe.payment_method);
        }

        await supabase.from('payment_transactions').update(updates).eq('id', txn.id);
        if (rental.order_id) {
          // Order-level: mark the header + every line paid (one payment per order).
          await applyOrderPaymentState(supabase, rental.order_id, {
            payment_status: 'paid',
            expires_at: null,
            payment_transaction_id: txn.id,
          });
        } else {
          await supabase
            .from('club_rentals')
            .update({ payment_status: 'paid', expires_at: null })
            .eq('id', rental.id);
        }

        status = 'success';
        transactionSn = probe.transaction_sn ?? transactionSn;
        paidAt = new Date().toISOString();
        failureReason = null;

        // Fire the customer confirmation email (idempotent — webhook
        // arrival later will see the email already claimed and skip).
        // AWAIT so Vercel doesn't tear down the function mid-fetch —
        // the void-fire pattern silently dropped the email under load
        // (observed UAT 2026-05-26). The poll response now waits on
        // the email side-effect, adding ~1-2s, which is acceptable
        // since the customer is on the success page anyway.
        try {
          await claimAndSendConfirmationEmail(supabase, txn.id, rental.id, {
            transactionSn: transactionSn,
          });
        } catch (err) {
          console.error('[ShopeePay/status] email side-effect failed:', err);
        }
      } else if (probe.errcode === 0 && (probe.status !== undefined || probe.transaction_status !== undefined)) {
        // Terminal non-success.
        await supabase
          .from('payment_transactions')
          .update({ status: 'failed', error_code: probe.errcode })
          .eq('id', txn.id);
        if (rental.order_id) {
          await applyOrderPaymentState(supabase, rental.order_id, { payment_status: 'failed' });
        } else {
          await supabase
            .from('club_rentals')
            .update({ payment_status: 'failed' })
            .eq('id', rental.id);
        }
        status = 'failed';
        // The probe's terminal status code can hint at failure reason.
        failureReason = classifyFailure(
          typeof probe.status === 'number' ? probe.status : probe.errcode
        );
      }
      // else: still processing — leave as pending and let the client poll again.
    } catch (e) {
      // Don't fail the response just because the gateway probe didn't
      // come back. The client will poll again.
      console.warn('[ShopeePay/status] /transaction/check probe failed:', e);
    }
  }

  // Also load the order summary so the /payment/result page can render
  // a full receipt on success without an extra roundtrip.
  const summary = await loadRentalOrderSummary(supabase, ref);

  return NextResponse.json({
    ref,
    status,
    // The receipt total is the ORDER total (summary is order-aware). Line money
    // is order-canonical (Phase 2 drop) — degrade to null if the summary failed
    // to load; display-only field.
    total_price: summary ? summary.total_price : null,
    transaction_sn: transactionSn || null,
    paid_at: paidAt || null,
    failure_reason: failureReason,
    summary,
  });
}
