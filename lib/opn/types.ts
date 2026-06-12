/**
 * Narrow shapes of the omise-node SDK responses we touch. The SDK
 * types are loose (lots of `any`); these discriminators tighten our
 * server code. Re-exported from one place so the codebase has a
 * single Opn type vocabulary.
 */

export type FailureReason = 'declined' | 'cancelled' | 'expired' | 'unknown';

/**
 * Subset of an Omise Charge object that we read. Source:
 * https://www.omise.co/charges-api (fields confirmed against
 * omise-node 0.12+ responses).
 */
export interface OpnCharge {
  object: 'charge';
  id: string;                 // chrg_*
  amount: number;             // in satang
  currency: string;           // 'thb'
  paid: boolean;
  status: 'pending' | 'successful' | 'failed' | 'reversed' | 'expired';
  authorize_uri: string | null;
  return_uri: string | null;
  authorized: boolean;
  captured: boolean;
  failure_code: string | null;
  failure_message: string | null;
  card?: {
    brand?: string | null;
    last_digits?: string | null;
    name?: string | null;
  };
  authorization_type?: 'pre_auth' | 'final_auth' | null;
  transaction_fees?: {
    fee_rate?: number;
    vat_rate?: number;
  };
  metadata?: Record<string, unknown>;
}

export interface OpnRefund {
  object: 'refund';
  id: string;                 // rfnd_*
  amount: number;
  currency: string;
  charge: string;             // chrg_*
  voided: boolean;
  reason?: string | null;
  metadata?: Record<string, unknown>;
}

/**
 * Webhook event envelope.
 */
export interface OpnWebhookEvent<T = OpnCharge | OpnRefund> {
  object: 'event';
  id: string;                 // evnt_*
  key:
    | 'charge.create'
    | 'charge.complete'
    | 'charge.capture'
    | 'refund.create'
    | string;
  created_at: string;
  data: T;
}

const DECLINED_CODES = new Set([
  'insufficient_fund',
  'insufficient_balance',
  'stolen_or_lost_card',
  'payment_rejected',
  'confirmed_amount_mismatch',
]);

const CANCELLED_CODES = new Set(['payment_cancelled']);

/**
 * Map Opn's `failure_code` enum to our four-value FailureReason
 * taxonomy. Anything we don't recognize → 'unknown'. Note: 'expired'
 * is NOT inferred here — callers detect it from time-budget exhaustion
 * (polling/cleanup cron) and pass it separately.
 */
export function classifyFailure(code: string | null | undefined): FailureReason {
  if (!code) return 'unknown';
  if (DECLINED_CODES.has(code)) return 'declined';
  if (CANCELLED_CODES.has(code)) return 'cancelled';
  return 'unknown';
}

/** True iff the charge is in its terminal success state. */
export function isChargeSuccessful(charge: OpnCharge): boolean {
  return charge.status === 'successful' && charge.paid === true;
}

/** True iff the charge is in any terminal state (success or failure). */
export function isChargeTerminal(charge: OpnCharge): boolean {
  return charge.status === 'successful' || charge.status === 'failed' ||
    charge.status === 'reversed' || charge.status === 'expired';
}
