import 'server-only';
import { NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { isFinalSuccess, type NotifyTransactionPayload } from './types';
import { pushToStaffGroup } from '@/lib/notifications/staffLine';

/**
 * Ad-hoc payment links: staff-issued ShopeePay charges that are NOT tied to a
 * club rental (event/party deposits, custom quotes).
 *
 * Split of responsibility:
 *   lengolf-forms  — staff UI, inserts the public.payment_links row (the amount
 *                    lives there and is IMMUTABLE once minted)
 *   this app       — mints the gateway order, owns /p/<code>, owns the paid flip
 *
 * This module is the single place the three consumers (the mint route, the
 * webhook, and the /transaction/check status poll) share. In particular
 * `markPaymentLinkPaid` is deliberately used by BOTH write-to-paid paths so
 * exactly one staff notification fires no matter which arrives first.
 */

const IS_PROD_ENV = process.env.VERCEL_ENV === 'production';

/**
 * PL-YYYYMMDD-XXXXXXXX. Disjoint from club_rentals.rental_code (CR-).
 *
 * 8 chars, not 4: /api/payments/shopeepay/status is unauthenticated and returns
 * the staff-typed `description`, so a narrow suffix would make a day's worth of
 * free-text event/customer details enumerable.
 */
export const LINK_CODE_PATTERN = /^PL-\d{8}-[A-Z0-9]{8}$/;

export interface PaymentLinkRow {
  id: string;
  link_code: string;
  customer_id: string;
  customer_name: string;
  description: string;
  amount: number; // satang
  currency: string;
  status: 'draft' | 'pending' | 'paid' | 'cancelled' | 'expired' | 'failed';
  expires_at: string | null;
  paid_at: string | null;
  /** Survives the paid flip, so it distinguishes a staff cancel from a cron expiry. */
  cancelled_at: string | null;
  created_by: string;
  created_at: string;
}

/* eslint-disable @typescript-eslint/no-explicit-any */
type Admin = SupabaseClient<any, any, any>;

export async function loadPaymentLink(
  supabase: Admin,
  linkCode: string
): Promise<PaymentLinkRow | null> {
  const { data } = await supabase
    .from('payment_links')
    .select('*')
    .eq('link_code', linkCode)
    .maybeSingle();
  return (data as PaymentLinkRow | null) ?? null;
}

export async function loadPaymentLinkById(
  supabase: Admin,
  id: string
): Promise<PaymentLinkRow | null> {
  const { data } = await supabase
    .from('payment_links')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  return (data as PaymentLinkRow | null) ?? null;
}

export interface MarkPaidResult {
  /** The updated row, or null when the link was ALREADY paid (idempotent replay). */
  flipped: PaymentLinkRow | null;
  /** Status immediately before the flip. 'paid' means this call was a no-op. */
  previousStatus: string | null;
}

/**
 * Flip a link to paid.
 *
 * The guard is `.neq('status', 'paid')`, NOT `.eq('status', 'pending')`. Two
 * reasons, both load-bearing:
 *
 *  1. Idempotency across two write paths. The webhook and the /transaction/check
 *     poll can both confirm the same payment. Whichever runs first gets a row
 *     back; the loser gets null and skips every side effect. Exactly one staff
 *     notification, always.
 *
 *  2. Money must never be dropped. ShopeePay exposes no cancel-order API, so a
 *     link we marked 'cancelled' or let expire may STILL be payable on their
 *     side until its own validity lapses. If a payment lands on a cancelled or
 *     expired link we take the money, record it, and escalate loudly — we do not
 *     silently ACK and leave a confirmed charge unrecorded.
 */
export async function markPaymentLinkPaid(
  supabase: Admin,
  linkId: string
): Promise<MarkPaidResult> {
  const paidAt = new Date().toISOString();

  // Two-step guarded flip so `previousStatus` is derived ATOMICALLY from which
  // predicate matched, not from a separate pre-read.
  //
  // A pre-read races the very thing the escalation banner exists to catch: an
  // admin's cancel committing between the SELECT and the UPDATE would report
  // previousStatus='pending' and staff would get a normal green "payment
  // received" for money that landed on a link they had written off — the one
  // case v1 has no in-app remedy for. The inverse interleaving fired a spurious
  // "refund this manually" banner on a perfectly good payment.
  //
  // Step 1: the common case. Winning here PROVES the link was still live.
  const live = await supabase
    .from('payment_links')
    .update({ status: 'paid', paid_at: paidAt })
    .eq('id', linkId)
    .eq('status', 'pending')
    .select('*')
    .maybeSingle();

  if (live.error) throw live.error;
  if (live.data) {
    return { flipped: live.data as PaymentLinkRow, previousStatus: 'pending' };
  }

  // Step 2: not pending. Either already paid (idempotent replay -> null) or the
  // link was cancelled/expired/failed/draft and money arrived anyway. Winning
  // here PROVES it was a late arrival, so escalate.
  const late = await supabase
    .from('payment_links')
    .update({ status: 'paid', paid_at: paidAt })
    .eq('id', linkId)
    .neq('status', 'paid')
    .select('*')
    .maybeSingle();

  if (late.error) throw late.error;
  if (!late.data) {
    // Already paid — idempotent replay.
    return { flipped: null, previousStatus: 'paid' };
  }

  // cancelled_at survives the paid flip, so it still identifies a staff cancel
  // as distinct from a cron expiry.
  const row = late.data as PaymentLinkRow;
  return {
    flipped: row,
    previousStatus: row.cancelled_at ? 'cancelled' : 'expired',
  };
}

/**
 * Guarded pending -> failed. Only ever moves a live link; never touches a paid,
 * cancelled or already-failed one.
 */
export async function markPaymentLinkFailed(
  supabase: Admin,
  linkId: string,
  reason: string
): Promise<PaymentLinkRow | null> {
  const { data, error } = await supabase
    .from('payment_links')
    .update({ status: 'failed' })
    .eq('id', linkId)
    .eq('status', 'pending')
    .select('*')
    .maybeSingle();

  if (error) {
    console.error('[ShopeePay/adhoc] markPaymentLinkFailed error:', reason, error);
    throw error;
  }
  return (data as PaymentLinkRow | null) ?? null;
}

function formatTHB(satang: number): string {
  return `฿${(satang / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function composeAdhocPaidLineMessage(input: {
  link: PaymentLinkRow;
  transactionSn?: string | null;
  previousStatus: string | null;
  uatPrefix?: boolean;
}): string {
  const { link, transactionSn, previousStatus, uatPrefix } = input;
  const prefix = uatPrefix ? '[UAT] ' : '';

  // The escalation case: money arrived on a link staff had already written off.
  // Staff must reconcile this by hand (v1 has no ad-hoc refund tooling), so the
  // banner has to be impossible to skim past.
  const lateArrival =
    previousStatus === 'cancelled' || previousStatus === 'expired' || previousStatus === 'failed';

  const header = lateArrival
    ? `${prefix}⚠️ PAYMENT RECEIVED ON A ${previousStatus!.toUpperCase()} LINK (ID: ${link.link_code}) ⚠️`
    : `${prefix}✅ DEPOSIT / PAYMENT RECEIVED (ID: ${link.link_code}) ✅`;

  const lines = [
    header,
    '',
    `Customer: ${link.customer_name}`,
    `For: ${link.description}`,
    `Amount: ${formatTHB(link.amount)}`,
  ];

  if (transactionSn) lines.push(`ShopeePay ref: ${transactionSn}`);
  lines.push(`Issued by: ${link.created_by}`);

  if (lateArrival) {
    lines.push(
      '',
      `This link was ${previousStatus} before the customer paid. The payment HAS`,
      'been taken and recorded. Refund manually in the ShopeePay merchant portal',
      'if it should not stand.'
    );
  }

  return lines.join('\n');
}

export function composeAdhocFailedLineMessage(input: {
  link: PaymentLinkRow;
  reason?: string | null;
  uatPrefix?: boolean;
}): string {
  const { link, reason, uatPrefix } = input;
  const prefix = uatPrefix ? '[UAT] ' : '';
  const lines = [
    `${prefix}❌ PAYMENT LINK DECLINED (ID: ${link.link_code}) ❌`,
    '',
    `Customer: ${link.customer_name}`,
    `For: ${link.description}`,
    `Amount: ${formatTHB(link.amount)}`,
  ];
  if (reason) lines.push(`Reason: ${reason}`);
  return lines.join('\n');
}

/**
 * Flip a link to paid and, IF this call won the flip, push the staff notification.
 *
 * THIS IS THE SHARED ENTRY POINT for both write-to-paid paths — the webhook and
 * the /transaction/check status poll. Routing both through one guarded flip is
 * what guarantees exactly one staff notification no matter which arrives first,
 * or if both do. Do not inline the flip in a caller.
 *
 * Throws only if the DB flip itself errors, so the webhook can return non-zero
 * and let ShopeePay retry. A LINE failure is caught and swallowed — the money is
 * recorded either way, and a notification hiccup must not cost us a retry.
 */
export async function finalizeAdhocPaid(
  supabase: Admin,
  paymentLinkId: string,
  opts: { transactionSn?: string | null } = {}
): Promise<{ won: boolean; link: PaymentLinkRow | null }> {
  const result: MarkPaidResult = await markPaymentLinkPaid(supabase, paymentLinkId);

  if (!result.flipped) {
    // Already paid — idempotent replay. No second notification.
    return { won: false, link: null };
  }

  try {
    await pushToStaffGroup(
      composeAdhocPaidLineMessage({
        link: result.flipped,
        transactionSn: opts.transactionSn ?? null,
        previousStatus: result.previousStatus,
        uatPrefix: !IS_PROD_ENV,
      })
    );
  } catch (err) {
    console.error('[ShopeePay/adhoc] staff LINE notification failed:', err);
  }

  return { won: true, link: result.flipped };
}

/**
 * Success branch of the webhook for an ad-hoc transaction.
 *
 * Returns 500 (so ShopeePay retries) only when the link flip itself errors.
 */
export async function handleAdhocPaid(
  supabase: Admin,
  txnRow: { id: string; payment_link_id: string | null; payment_reference_id: string },
  payload: NotifyTransactionPayload,
  opts: { transactionSn?: string | null } = {}
): Promise<NextResponse> {
  const ACK_OK = { errcode: 0, debug_msg: 'success' as const };

  if (!txnRow.payment_link_id) return NextResponse.json(ACK_OK);

  try {
    await finalizeAdhocPaid(supabase, txnRow.payment_link_id, {
      transactionSn: opts.transactionSn,
    });
  } catch (e) {
    console.error('[ShopeePay/adhoc] paid flip failed:', e);
    // Non-zero so ShopeePay retries — the money is confirmed on their side and
    // our DB does not yet reflect it.
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }

  return NextResponse.json(ACK_OK);
}

/**
 * Failure branch of the webhook for an ad-hoc transaction. Without this a
 * declined payment would leave the link 'pending' until the expiry cron swept
 * it, and staff would never learn the customer's payment bounced.
 */
export async function handleAdhocFailed(
  supabase: Admin,
  paymentLinkId: string,
  payload: NotifyTransactionPayload
): Promise<void> {
  let failed: PaymentLinkRow | null = null;
  try {
    failed = await markPaymentLinkFailed(supabase, paymentLinkId, 'gateway declined');
  } catch {
    return; // already logged
  }
  if (!failed) return; // wasn't pending — nothing to announce

  const reason = (payload as unknown as { debug_msg?: string }).debug_msg ?? null;
  try {
    await pushToStaffGroup(
      composeAdhocFailedLineMessage({ link: failed, reason, uatPrefix: !IS_PROD_ENV })
    );
  } catch (err) {
    console.error('[ShopeePay/adhoc] failed-notification error:', err);
  }
}

/** Re-exported so callers don't need a second import to test terminality. */
export { isFinalSuccess };
