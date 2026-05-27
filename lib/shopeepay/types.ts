/**
 * Type definitions for ShopeePay's CwS (Connect-with-Shopee / Jump App)
 * Checkout API. Hand-typed against the partner UAT documentation —
 * ShopeePay does not publish an OpenAPI spec.
 *
 * Field names match the wire format exactly (snake_case). The client
 * does no normalization so payload-level debugging stays trivial.
 */

// ---------------------------------------------------------------------
// Order create — POST /v3/merchant-host/order/create
// ---------------------------------------------------------------------

export interface CreateOrderRequest {
  /** Caller-generated unique request ID. We use `lengolf-cr-{rental_code}-{epoch_ms}`. */
  request_id: string;
  /** Merchant-side reference. We use `LENGOLF-{rental_code}`. Unique per order. */
  payment_reference_id: string;
  merchant_ext_id: string;
  store_ext_id: string;
  /** Amount in satang (THB * 100). 150.00 THB = 15000. */
  amount: number;
  currency: 'THB';
  /** URL ShopeePay redirects the customer back to after payment. */
  return_url: string;
  /** 'mweb' for LIFF/mobile browsers, 'pc' for desktop, 'app' for native apps. */
  platform_type: 'mweb' | 'pc' | 'app';
  /** Order validity in seconds. Up to 432,000 (5 days) in TH; we use 1800. */
  validity_period: number;
  /** Optional JSON-encoded merchant metadata visible on ShopeePay receipt. */
  additional_info?: string;
  /** Optional. If 'spay_later', SPayLater is preselected on the checkout page. */
  preferredPaymentMethodType?: 'spay_later';
}

export interface CreateOrderResponse {
  errcode: number;
  debug_msg?: string;
  /** URL we redirect the customer to (Jump App handles the deep-link). */
  redirect_url_http?: string;
  /** Static QR content (for desktop fallback display). */
  qr_content?: string;
  /** Hosted QR image URL. */
  qr_url?: string;
}

// ---------------------------------------------------------------------
// Notify Transaction Status — webhook FROM ShopeePay TO our endpoint
// ---------------------------------------------------------------------

/**
 * Inbound notify payload from ShopeePay.
 *
 * Wire-name caveat (observed during UAT 2026-05-15): the CwS APIs are
 * internally inconsistent on the merchant-reference field name. The
 * order/create REQUEST uses `payment_reference_id`, but the notify
 * webhook and the transaction/check request use `reference_id`. Live
 * UAT traffic transmits `reference_id` only — `payment_reference_id`
 * is absent. Both are typed optional so the webhook handler can read
 * whichever is present (preferring `reference_id`).
 *
 * `payment_method` is also looser than the docs imply: UAT delivered
 * an integer (`16`), so we widen to `string | number`.
 */
export interface NotifyTransactionPayload {
  /** Wire field on the actual notify webhook + transaction/check. */
  reference_id?: string;
  /** Docs-promised field name; kept as a fallback in case ShopeePay normalizes later. */
  payment_reference_id?: string;
  /**
   * CwS uses `status` / `transaction_status`. 3 = success.
   * The CsB flow uses `payment_status: 1` instead — different field, different value.
   * We handle CwS only.
   */
  status?: number;
  transaction_status?: number;
  amount: number;
  currency?: string;
  transaction_sn?: string;
  user_id_hash?: string;
  merchant_ext_id?: string;
  store_ext_id?: string;
  /** Present on the wire as `13` for Checkout-with-Shopee. We don't branch on it. */
  transaction_type?: number;
  payment_channel?: number;
  payment_method?: string | number;
  /** Present on refund notifications (phase 2). */
  refund_reference_id?: string;
}

/**
 * Read the merchant-reference id from a notify webhook payload,
 * accepting either wire name. Prefers `reference_id` (what UAT
 * actually sends) and falls back to `payment_reference_id` (the
 * docs-promised name) so we stay forward-compatible.
 *
 * Normalizes empty strings to `undefined` so callers that use
 * `if (referenceId === undefined)` style checks behave the same as
 * `if (!referenceId)` style. Without this, an empty `reference_id`
 * field would fall through `??` and the caller would receive `''`.
 */
export function extractReferenceId(
  payload: Pick<NotifyTransactionPayload, 'reference_id' | 'payment_reference_id'>
): string | undefined {
  const ref = payload.reference_id ?? payload.payment_reference_id;
  return ref && ref.length > 0 ? ref : undefined;
}

export interface NotifyAck {
  errcode: 0;
  debug_msg: 'success';
}

// ---------------------------------------------------------------------
// Check Transaction Status — POST /v3/merchant-host/transaction/check
// ---------------------------------------------------------------------

/**
 * transaction_type 13 corresponds to the Checkout-with-ShopeePay
 * product flow per the partner docs. Other values are for different
 * products we don't use (CsB QR, account linking, etc.).
 */
export const TRANSACTION_TYPE_CHECKOUT = 13 as const;

export interface CheckTransactionRequest {
  request_id: string;
  reference_id: string;
  transaction_type: typeof TRANSACTION_TYPE_CHECKOUT;
  merchant_ext_id: string;
  store_ext_id: string;
  amount: number;
}

export interface CheckTransactionResponse {
  errcode: number;
  debug_msg?: string;
  /** Same contract as Notify: status=3 means terminal success. */
  status?: number;
  transaction_status?: number;
  amount?: number;
  transaction_sn?: string;
  payment_channel?: number;
  /** Widened to `string | number` for symmetry with the notify webhook (UAT 2026-05-15). */
  payment_method?: string | number;
}

// ---------------------------------------------------------------------
// Create Refund — POST /v3/merchant-host/transaction/refund/create-new
// ---------------------------------------------------------------------
//
// Path + field-name caveat (confirmed by ShopeePay support pearpearpearpearpear,
// 2026-05-25): the refund endpoint on prod is NOT `/v3/merchant-host/refund/create`
// (which returns nginx 404). The correct path is
// `/v3/merchant-host/transaction/refund/create-new`. It also uses
// `reference_id` (matching the `transaction/check` endpoint's naming),
// NOT `payment_reference_id` — confirmed via probe sequence:
//   - `payment_reference_id` → errcode:1 "Payment reference ID must not be empty"
//   - `reference_id` → errcode:1 "Non-refundable transaction type" (expected;
//     the probe txn was already fully refunded — confirms field accepted)

export interface CreateRefundRequest {
  /** Caller-generated unique request ID. We use `lengolf-rfd-{rental_code}-{epoch_ms}`. */
  request_id: string;
  /**
   * The parent payment's merchant reference. Same value used at order/create
   * time (`payment_reference_id` in that request body), but on this endpoint
   * the field name is `reference_id` (matches transaction/check naming).
   */
  reference_id: string;
  /**
   * Required per ShopeePay docs (uint32). Must match the original payment's
   * transaction_type — 13 = Checkout-with-Shopee. Missing field returns
   * errcode:1 "Non-refundable transaction type" even though the message
   * sounds like a business-rule rejection.
   * See https://product.shopeepay.com/integration/api/refund-a-payment/
   */
  transaction_type: typeof TRANSACTION_TYPE_CHECKOUT;
  /** Per-refund unique reference. We use `${payment_reference_id}-R<n>`. */
  refund_reference_id: string;
  merchant_ext_id: string;
  store_ext_id: string;
  /** Refund amount in satang (int64). Must be <= remaining (amount - already-refunded). */
  amount: number;
  currency: 'THB';
  /** Optional reason surfaced in ShopeePay's merchant dashboard. */
  reason?: string;
}

export interface CreateRefundResponse {
  errcode: number;
  debug_msg?: string;
  /** ShopeePay's serial number for this refund. May be absent on async-queued refunds. */
  refund_sn?: string;
}

// ---------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------

/**
 * Final-success predicate per ShopeePay UAT self-assessment for CwS:
 * "transaction_status / status = 3" or Check Transaction errcode=0+status=3.
 */
export function isFinalSuccess(payload: {
  status?: number;
  transaction_status?: number;
}): boolean {
  return payload.status === 3 || payload.transaction_status === 3;
}
