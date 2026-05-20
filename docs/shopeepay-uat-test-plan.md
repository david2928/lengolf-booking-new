# [Lengolf][TH] ShopeePay CwS UAT Test Plan

**UAT Environment:** https://lengolf-shopeepay-uat.vercel.app  
**Product Flow:** CwS (Jump App)  
**Merchant Name:** Lengolf  
**Merchant External ID:** lngolf  
**Store External ID:** lngolf  
**Client ID (Host Name):** 12001707  
**Date Prepared:** 2026-04-30  

---

## UAT Needed Information (Submit to ShopeePay)

| Information Required | Value |
|---|---|
| **Endpoint for Notify Transactions Status callback** | `https://lengolf-shopeepay-uat.vercel.app/api/webhooks/shopeepay` |
| **Device IP address to access ShopeePay app in UAT** | `184.22.233.86` (public IP) |

---

## Test Account Credentials

| Field | Value |
|---|---|
| Login Phone No. | 0066859394145 |
| OTP | 111111 |
| ShopeePay Wallet PIN | 456123 |
| Starting Wallet Balance | 3,922.63 THB |

**UAT APK:** `shopeepay-thailand-internal-play-5.35.05@10v1_master_apk02.apk` (Android only)

---

## Partner Self-Assessment

| Question | Our Answer |
|---|---|
| **What platforms does your service operate on?** | ✅ Mobile web, ✅ PC web (no iOS/Android app) |
| **(App platforms) Opens redirect_url in external browser or webview?** | N/A — web only, no app |
| **(App platforms, inside webview) Does your platform restrict 3rd-party redirection?** | N/A — web only, no app |
| **Confirm: no domain whitelisting, length check, or parameter check on any URLs returned by ShopeePay** | ✅ Confirmed |
| **Confirm: does not block universal link mechanism for any URLs returned by ShopeePay** | ✅ Confirmed |
| **Transaction success criteria — only regard as successful if Check Transaction Status returns errcode=0 and status=3, OR Notify API delivers status/transaction_status=3** | ✅ Confirmed — our polling route (`/api/payments/shopeepay/status`) calls `/v3/merchant-host/transaction/check` and only marks paid on status=3. Webhook handler also verifies status=3 before updating DB. |
| **Refund success criteria — same as above** | ✅ Confirmed (acknowledged, though refund is Phase 2 — see Case 2 below) |

---

## UAT Test Case Summary

| No. | Case | Applicability | Remarks | Result |
|---|---|---|---|---|
| 1 | Payment - Checkout with ShopeePay | **Yes** | Full flow tested on mobile web + PC web | ⬜ Pending |
| 2 | Create Refund | **Skipped** | Refund not implemented in Phase 1; will be added in a future release | — |
| 3 | Notify Transaction Status | **Partial** | Step 1 (payment notify): Yes. Step 2 (refund notify): Skipped — no refund in Phase 1 | ⬜ Pending |
| 4 | Check Transaction Status | **Yes** | Result page polls `/v3/merchant-host/transaction/check` for up to ~30s | ⬜ Pending |
| 5 | Email Settlement Report | **Yes** | Receive and verify D+1 email | ⬜ Pending |

---

## Case 1: Payment — Checkout with ShopeePay

**How to trigger:** Navigate to the course rental flow on the UAT site:  
`https://lengolf-shopeepay-uat.vercel.app/course-rental`  
Select dates/club set → proceed to review → choose **Card / ShopeePay** → click **Pay with ShopeePay**.

| Step | Description | Records (screenshots / API logs) | Test Result |
|---|---|---|---|
| 1 | User is on partner's interface and selects ShopeePay/SPayLater to proceed with payment | | |
| 2 | Partner calls `/v3/merchant-host/order/create` and obtains the `webRedirectUrl` | _Attach: server log or network tab showing POST to ShopeePay create endpoint and response with `web_redirect_url`_ | |
| 3 | The user is redirected to the ShopeePay page to select a payment method | | |
| 3.1 | (ShopeePay/Shopee App installed) User redirected to **App checkout** | | |
| 3.2 | (ShopeePay/Shopee App not installed) User redirected to **ShopeePay web checkout** | | |
| 4 | (If `preferredPaymentMethodType = 'spay_later'` set) SPayLater pre-selected on ShopeePay Payment Page | _N/A for this integration — we do not set a preferred method_ | N/A |
| 5 | User inputs PIN `456123` successfully | | |
| 6 | (If user selects Credit/Debit Card or Bank Account) User goes through 3DS or OTP from the payment method | | |
| 7 | User sees Payment Successful page and **auto-redirects** back to `https://lengolf-shopeepay-uat.vercel.app/payment/result?ref=<rental_code>` | _Attach: screenshot of result page showing "Payment Confirmed" + receipt_ | |
| 8 | Partner is notified of successful payment via Notify Payment API (webhook fires to `/api/webhooks/shopeepay`) | _Attach: server logs showing webhook received + `errcode=0` response sent_ | |

---

## Case 2: Create Refund

**Status: SKIPPED — Refund not implemented in Phase 1**

Refund functionality is planned for a future release. This case will be completed as part of Phase 2 UAT.

| Step | Description | Records | Test Result |
|---|---|---|---|
| 1 | Partner calls the Refund endpoint to refund a previous payment | SKIPPED | — |
| 1.1 | (Partial refund) Partner refunds an amount lower than original | SKIPPED | — |
| 2 | Partner is notified of successful refund via Notify Transaction API | SKIPPED | — |

---

## Case 3: Notify Transaction Status

| Step | Description | Records (screenshots / API logs) | Test Result |
|---|---|---|---|
| 1 | Partner is notified once the **payment** is successful (webhook fires to `/api/webhooks/shopeepay`) | _Attach: server log showing POST body and our 200 response_ | |
| 2 | Partner is notified once a **refund** is successful | SKIPPED — no refund in Phase 1 | — |

---

## Case 4: Check Transaction Status

| Step | Description | Records (screenshots / API logs) | Test Result |
|---|---|---|---|
| 1 | In cases where ShopeePay returns transaction in processing or times out, partner calls `/v3/merchant-host/transaction/check` to confirm status | _Trigger by opening `/payment/result?ref=<rental_code>` — the result page polls this endpoint. Attach: network tab showing GET to our status API and the check call it makes to ShopeePay_ | |

---

## Case 5: Email Settlement Report

| Step | Description | Records | Test Result |
|---|---|---|---|
| 1 | Partner receives settlement report via email D+1, and confirms all fields and format are as expected | _Attach: screenshot of email received_ | |

---

## How to Capture API Logs for Cases 2, 3, 4

For cases requiring API request/response evidence:

1. **Vercel runtime logs** (real-time): `vercel logs --follow --scope=david2928s-projects <deployment-id>`
2. **Vercel dashboard**: https://vercel.com → project → Functions tab → click any invocation
3. **Browser Network tab**: Open DevTools → Network → filter `shopeepay` to see client-side calls to our `/api/payments/shopeepay/*` routes
4. **Webhook receipts**: Filter logs for `POST /api/webhooks/shopeepay` — each call logs the decrypted payload and our response

---

## Known Issues Uncovered During UAT

### 2026-05-15 — Notify Transaction Status returned 400 `Missing payment_reference_id`

**Symptom (Case 1 / Case 3):** ShopeePay completed a real successful payment on their side (transaction_sn `160044308330281009`, ฿1,200.00, transaction_status=3), but our UAT result page showed "Payment Cancelled". Their correlation log:

```
response_body: {"error":"Missing payment_reference_id"}
```

against this inbound payload:

```json
{
  "amount": 120000,
  "transaction_sn": "160044308330281009",
  "payment_method": 16,
  "user_id_hash": "4aca8ec7-ad81-4518-a5af-8fd015631e28",
  "merchant_ext_id": "lngolf",
  "store_ext_id": "lngolf",
  "reference_id": "LENGOLF-CR-20260515-0FC6-mp6l29iy",
  "transaction_type": 13,
  "transaction_status": 3,
  "payment_channel": 2
}
```

**Root cause:** ShopeePay's CwS APIs are internally inconsistent on the merchant-reference field name. The `order/create` REQUEST uses `payment_reference_id`, but the notify webhook (and `/transaction/check` request) use `reference_id`. We had typed the notify payload from the partner docs and were destructuring `payment_reference_id`, so we returned 400 on the real wire shape.

**Secondary:** `payment_method` arrived as a number (`16`), but our DB column is TEXT and our type was `string` — a follow-up failure would have hit once the field-name fix unblocked the row update.

**Fix:** `lib/shopeepay/types.ts` now exports `extractReferenceId()` which reads `reference_id ?? payment_reference_id`. The webhook handler (`app/api/webhooks/shopeepay/route.ts`) uses that helper and coerces `payment_method` to a string before the DB update. Regression test added in `__tests__/shopeepay-signature.test.ts` against the verbatim UAT payload.

**Re-run:** Case 1 must be re-tested end-to-end after redeploy. If ShopeePay support can replay `160044308330281009` against the new deployment, the original failing payload should now produce `200 {"errcode":0,"debug_msg":"success"}` — that validates the fix against the real wire bytes.

---

## Test Flow Quick-Reference

```
UAT site: https://lengolf-shopeepay-uat.vercel.app

1. /course-rental → fill form → choose "Card / ShopeePay" → Review step
2. Review step shows: "Pay ฿X,XXX with ShopeePay" button + "Secured by ShopeePay"
3. /payment/start → shows order summary card → auto-redirects to ShopeePay in ~200ms
4. ShopeePay UAT page → log in with 0066859394145 / OTP 111111 → PIN 456123
5. Payment success → auto-redirect to /payment/result?ref=<rental_code>
6. Result page shows: "Payment Confirmed" + full receipt (amount, transaction SN, dates)
7. Webhook fires to /api/webhooks/shopeepay → confirmation email sent to booking email
```
