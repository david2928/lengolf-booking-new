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

export interface NotifyTransactionPayload {
  payment_reference_id: string;
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
  payment_channel?: number;
  payment_method?: string;
  /** Present on refund notifications (phase 2). */
  refund_reference_id?: string;
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
  payment_method?: string;
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
