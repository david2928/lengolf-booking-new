# ShopeePay Payment Gateway Integration — Implementation Plan

## Document Info
- **Created**: 2026-04-04
- **Status**: Draft / Research Complete
- **Scope**: Add ShopeePay payment to LENGOLF club rental flow (indoor + course rentals)

---

## 1. Executive Summary

LENGOLF's club rental system currently has **no payment gateway** — pricing is calculated and shown to customers, but payment is collected manually (at venue or via staff follow-up). This document outlines integrating **ShopeePay's Checkout API** to collect payment at booking time.

### What ShopeePay Supports in Thailand
| Method | Status |
|---|---|
| ShopeePay Wallet | Available |
| Credit/Debit Cards (Visa, Mastercard, Amex, JCB) | Available |
| Linked Bank Accounts (Bangkok Bank, KTB, SCB, KBank) | Available |
| SPayLater (BNPL — 3/6/9/12 months) | Available |

### Why ShopeePay
- Single integration covers wallet, cards, bank accounts, and installments
- Thailand is a fully supported market with all payment methods active
- T+1 daily settlement in THB
- Auth & Capture support (hold funds, charge later — useful for course rentals with delivery)

---

## 2. Current Club Rental Flow (No Payment)

### Indoor Bay + Club Rental
```
Customer books bay → Selects club tier (none/standard/premium/premium-plus)
→ Cost calculated → Booking created → Confirmation shown
→ Club selection stored as text in bookings.customer_notes
→ NO PAYMENT COLLECTED
```

### Course Rental (Standalone)
```
Customer selects dates → Picks club set → Adds delivery/add-ons
→ POST /api/clubs/reserve → club_rentals record created (status: 'reserved')
→ Confirmation email + LINE notification
→ Staff follows up for manual payment
```

### Key Files
| File | Purpose |
|---|---|
| `app/api/clubs/reserve/route.ts` | Creates club rental reservation |
| `app/api/clubs/availability/route.ts` | Checks club set availability |
| `app/api/bookings/create/route.ts` | Creates bay booking (includes club selection) |
| `lib/pricing.ts` | Dynamic pricing fetcher |
| `lib/cost-calculator.ts` | Cost breakdown calculator |
| `types/golf-club-rental.ts` | TypeScript types for rentals |

### Database Tables
- **`rental_club_sets`** — Club inventory (sets, pricing, specs)
- **`club_rentals`** — Rental reservations (status, pricing, customer info)
- **`bookings`** — Bay bookings (club selection in `customer_notes`)

---

## 3. ShopeePay API Overview

### Base URLs (Thailand)
| Environment | URL |
|---|---|
| **Staging/UAT** | `https://api.uat.wallet.airpay.co.th` |
| **Production** | `https://api.wallet.airpay.co.th` |

### Authentication
- **Headers**: `X-Airpay-ClientId` + `X-Airpay-Req-H` (HMAC signature)
- **Algorithm**: HMAC-SHA256 → Base64
- **TLS**: v1.2 or v1.3 required
- **No SDK** — direct REST API integration

### Signature Generation (JavaScript)
```javascript
import crypto from 'crypto';

function generateSignature(body: string, secretKey: string): string {
  return crypto
    .createHmac('sha256', secretKey)
    .update(body)
    .digest('base64');
}
```

### Request Headers
```
Content-Type: application/json
X-Airpay-ClientId: <SHOPEEPAY_CLIENT_ID>
X-Airpay-Req-H: <generated_signature>
```

---

## 4. Integration Strategy: Checkout Flow

We will use **Checkout with ShopeePay** (`/v3/merchant-host/order/create`) as the primary integration. This is the redirect-based online payment flow — the simplest to implement and covers all payment methods (wallet, cards, bank, SPayLater).

### Payment Flow

```
                                                          ShopeePay
Customer              LENGOLF (Next.js)                   Gateway
   |                       |                                |
   | 1. Confirm rental     |                                |
   |---------------------->|                                |
   |                       | 2. Create club_rental           |
   |                       |    (status: 'pending_payment')  |
   |                       |                                |
   |                       | 3. POST /order/create           |
   |                       |------------------------------->|
   |                       |    { redirect_url, qr_url }    |
   |                       |<-------------------------------|
   |                       |                                |
   | 4. Redirect to ShopeePay                               |
   |<----------------------|                                |
   |                                                        |
   | 5. Customer pays (wallet/card/bank/SPayLater)          |
   |------------------------------------------------------->|
   |                                                        |
   | 6. Redirect back to return_url                         |
   |<-------------------------------------------------------|
   |                       |                                |
   |                       | 7. Webhook: Notify Txn Status  |
   |                       |<-------------------------------|
   |                       |                                |
   |                       | 8. Verify signature + amount   |
   |                       | 9. Update club_rental status   |
   |                       |    → 'confirmed' / 'failed'    |
   |                       |                                |
   | 10. Show result page  |                                |
   |<----------------------|                                |
```

### Key Principle
> **"Redirect to return_url should NEVER be used as an indication of payment success."**
> Always rely on the webhook callback + Check Transaction Status API for payment confirmation.

---

## 5. API Endpoints Used

### 5.1 Create Checkout Order
**`POST /v3/merchant-host/order/create`**

```json
{
  "request_id": "lengolf-cr-<rental_code>-<timestamp>",
  "payment_reference_id": "LENGOLF-<rental_code>",
  "merchant_ext_id": "<SHOPEEPAY_MERCHANT_ID>",
  "store_ext_id": "<SHOPEEPAY_STORE_ID>",
  "amount": 15000,
  "currency": "THB",
  "return_url": "https://booking.len.golf/payment/result?ref=<rental_code>",
  "platform_type": "mweb",
  "validity_period": 1800,
  "additional_info": "{\"field1\":\"Club Rental\",\"field2\":\"CR241124ABC\",\"field3\":\"Premium Set\"}"
}
```

**Notes:**
- `amount` is in satang (THB x 100): 150.00 THB = `15000`
- `platform_type`: `"mweb"` for LIFF/mobile, `"pc"` for desktop
- `validity_period`: 1800 seconds (30 min) — Thailand supports up to 432,000 (5 days)
- `return_url`: Our payment result page (NOT used to confirm success)

**Response:**
```json
{
  "errcode": 0,
  "debug_msg": "success",
  "redirect_url_http": "https://pay.shopee.co.th/...",
  "qr_content": "00020101021...",
  "qr_url": "https://qr.shopeepay.co.th/..."
}
```

### 5.2 Notify Transaction Status (Webhook)
**`POST /api/webhooks/shopeepay`** (our endpoint, called by ShopeePay)

ShopeePay sends:
```json
{
  "payment_reference_id": "LENGOLF-CR241124ABC",
  "payment_status": 1,
  "amount": 15000,
  "transaction_sn": "019703251690639893",
  "user_id_hash": "15e455125fba...",
  "merchant_ext_id": "<SHOPEEPAY_MERCHANT_ID>",
  "store_ext_id": "<SHOPEEPAY_STORE_ID>",
  "payment_channel": 1
}
```

**We must respond:**
```json
{ "errcode": 0, "debug_msg": "success" }
```

**Thailand retry policy:** If we don't respond `errcode: 0`, ShopeePay retries up to **2 times at 5-minute intervals**.

### 5.3 Check Transaction Status
**`POST /v3/merchant-host/transaction/check`**

Used as fallback when webhook is delayed or customer returns before webhook arrives.

```json
{
  "request_id": "check-<rental_code>-<timestamp>",
  "reference_id": "LENGOLF-<rental_code>",
  "transaction_type": 13,
  "merchant_ext_id": "<SHOPEEPAY_MERCHANT_ID>",
  "store_ext_id": "<SHOPEEPAY_STORE_ID>",
  "amount": 15000
}
```

**Retry strategy:**
- Phase 1: Every 5s for up to 100s
- Phase 2: Every 5min for up to 24h

### 5.4 Refund
**`POST /v3/merchant-host/transaction/refund/create-new`**

```json
{
  "request_id": "refund-<rental_code>-<timestamp>",
  "reference_id": "LENGOLF-<rental_code>",
  "transaction_type": 13,
  "refund_reference_id": "REFUND-<rental_code>-<sequence>",
  "merchant_ext_id": "<SHOPEEPAY_MERCHANT_ID>",
  "store_ext_id": "<SHOPEEPAY_STORE_ID>",
  "amount": 15000
}
```

**Key details:**
- Full and partial refunds supported
- Partial refunds are sequential (wait for each to complete)
- Refund window: **365 days** from original payment
- Idempotent — duplicate requests with same payload won't double-refund
- **Blocked period**: Refunds cannot be processed 12am–5am (Thai time)

---

## 6. Database Changes

### New Table: `payment_transactions`
```sql
CREATE TABLE payment_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Link to rental or booking
  club_rental_id UUID REFERENCES club_rentals(id),
  booking_id UUID REFERENCES bookings(id),
  
  -- ShopeePay identifiers
  payment_reference_id TEXT NOT NULL UNIQUE,
  transaction_sn TEXT,
  request_id TEXT NOT NULL,
  
  -- Payment details
  amount INTEGER NOT NULL,              -- in satang (THB x 100)
  currency TEXT NOT NULL DEFAULT 'THB',
  status TEXT NOT NULL DEFAULT 'pending',
  -- pending | redirected | success | failed | refunded | partially_refunded
  
  payment_channel INTEGER,              -- ShopeePay payment_channel code
  payment_method TEXT,                  -- wallet, card, bank, spay_later
  user_id_hash TEXT,                    -- ShopeePay customer identifier
  
  -- Redirect URLs
  redirect_url TEXT,                    -- ShopeePay checkout URL
  return_url TEXT,                      -- Our return URL
  
  -- Refund tracking
  refunded_amount INTEGER DEFAULT 0,    -- total refunded in satang
  
  -- Metadata
  platform_type TEXT,                   -- app, mweb, pc
  gateway TEXT NOT NULL DEFAULT 'shopeepay',
  raw_webhook_payload JSONB,            -- store full webhook for audit
  error_code INTEGER,
  error_message TEXT,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  paid_at TIMESTAMPTZ,
  refunded_at TIMESTAMPTZ
);

-- Indexes
CREATE INDEX idx_payment_txn_rental ON payment_transactions(club_rental_id);
CREATE INDEX idx_payment_txn_booking ON payment_transactions(booking_id);
CREATE INDEX idx_payment_txn_ref ON payment_transactions(payment_reference_id);
CREATE INDEX idx_payment_txn_sn ON payment_transactions(transaction_sn);
CREATE INDEX idx_payment_txn_status ON payment_transactions(status);
```

### Modify `club_rentals` Table
```sql
-- Add payment-related columns
ALTER TABLE club_rentals
  ADD COLUMN payment_status TEXT DEFAULT 'unpaid',
  -- unpaid | pending | paid | refunded | partially_refunded
  ADD COLUMN payment_transaction_id UUID REFERENCES payment_transactions(id);
```

### New Status Flow for `club_rentals.status`
```
reserved (no payment)
  ↓ (payment initiated)
pending_payment
  ↓ (webhook: success)        ↓ (webhook: failed / timeout)
confirmed                     payment_failed
  ↓                             ↓
picked_up                     cancelled
  ↓
returned
```

---

## 7. New API Endpoints

### 7.1 `POST /api/payments/shopeepay/create`
Creates a ShopeePay checkout order for a club rental.

**Request:**
```typescript
{
  club_rental_id: string;   // UUID of the club_rentals record
  platform_type: 'mweb' | 'pc' | 'app';
  return_url?: string;      // override default return URL
}
```

**Logic:**
1. Fetch `club_rentals` record, validate status is `reserved`
2. Calculate total amount from `club_rentals.total_price`
3. Generate `payment_reference_id`: `LENGOLF-{rental_code}`
4. Call ShopeePay `POST /v3/merchant-host/order/create`
5. Store `payment_transactions` record
6. Update `club_rentals.status` → `pending_payment`
7. Return `redirect_url` to frontend

**Response:**
```typescript
{
  success: true;
  redirect_url: string;     // ShopeePay checkout page
  qr_url?: string;          // QR code image (for desktop)
  qr_content?: string;      // QR raw content
  payment_reference_id: string;
}
```

### 7.2 `POST /api/webhooks/shopeepay`
Receives payment notifications from ShopeePay.

**Logic:**
1. Verify HMAC signature from `X-Airpay-Req-H` header
2. Parse webhook payload
3. Look up `payment_transactions` by `payment_reference_id`
4. Validate amount matches
5. Update `payment_transactions.status` → `success` or `failed`
6. Update `club_rentals.status` → `confirmed` or `payment_failed`
7. Update `club_rentals.payment_status` → `paid` or `unpaid`
8. Send confirmation LINE message / email on success
9. Respond `{ "errcode": 0, "debug_msg": "success" }`

**Security:**
- Verify HMAC-SHA256 signature on every webhook
- Validate `payment_reference_id` exists in our DB
- Validate `amount` matches what we sent
- Reject duplicate notifications (idempotency check on `transaction_sn`)

### 7.3 `GET /api/payments/shopeepay/status?ref=<payment_reference_id>`
Frontend polls this after redirect back. Also used as fallback.

**Logic:**
1. Look up `payment_transactions` by `payment_reference_id`
2. If status is still `pending` or `redirected`:
   - Call ShopeePay `POST /v3/merchant-host/transaction/check`
   - Update local record if ShopeePay has a final status
3. Return current status to frontend

### 7.4 `POST /api/payments/shopeepay/refund`
Staff-initiated refund from admin panel.

**Request:**
```typescript
{
  payment_reference_id: string;
  amount?: number;          // partial refund in THB (omit for full)
  reason?: string;
}
```

---

## 8. Frontend Changes

### 8.1 Payment Step in Course Rental Flow
**File:** New component in `app/liff/` or `app/(features)/`

```
Current:  Select → Details → Confirm → Done
Proposed: Select → Details → Confirm → PAY → Result
```

After the customer confirms their rental:
1. Call `POST /api/payments/shopeepay/create`
2. Redirect to `redirect_url` (ShopeePay checkout page)
3. Customer pays via wallet/card/bank/SPayLater
4. Redirected back to `/payment/result?ref=<payment_reference_id>`

### 8.2 Payment Result Page
**File:** `app/payment/result/page.tsx` (new)

```
On load:
  1. Read `ref` from URL params
  2. Poll GET /api/payments/shopeepay/status?ref=<ref>
  3. Show loading state while pending
  4. Show success or failure UI
  5. On success: show rental confirmation + receipt
  6. On failure: show retry button → re-create checkout order
```

### 8.3 Indoor Booking Flow (Optional Phase 2)
For bay bookings with premium club rentals, we could add payment before confirmation. This is **Phase 2** since indoor club rental pricing is smaller (150-950 THB) and currently collected at venue.

---

## 9. Environment Variables

```bash
# ShopeePay Gateway
SHOPEEPAY_CLIENT_ID=                    # From ShopeePay onboarding
SHOPEEPAY_SECRET_KEY=                   # HMAC signing key
SHOPEEPAY_MERCHANT_EXT_ID=              # Merchant identifier
SHOPEEPAY_STORE_EXT_ID=                 # Store identifier
SHOPEEPAY_BASE_URL=                     # api.uat.wallet.airpay.co.th (staging)
                                        # api.wallet.airpay.co.th (production)
SHOPEEPAY_WEBHOOK_SECRET=               # For verifying incoming webhooks
NEXT_PUBLIC_PAYMENT_RETURN_URL=         # https://booking.len.golf/payment/result
```

---

## 10. Implementation Plan

### Phase 1: Core Payment (Course Rentals)
1. **Database migration** — Create `payment_transactions` table, modify `club_rentals`
2. **ShopeePay client library** — `lib/shopeepay/client.ts` (signature gen, API calls)
3. **Create checkout endpoint** — `POST /api/payments/shopeepay/create`
4. **Webhook handler** — `POST /api/webhooks/shopeepay`
5. **Status check endpoint** — `GET /api/payments/shopeepay/status`
6. **Payment result page** — `app/payment/result/page.tsx`
7. **Update course rental flow** — Add "Pay Now" step after confirmation
8. **Confirmation notifications** — Update LINE/email to include payment status
9. **Testing with UAT** — End-to-end with ShopeePay staging environment

### Phase 2: Refunds & Admin
10. **Refund endpoint** — `POST /api/payments/shopeepay/refund`
11. **Admin payment view** — Show payment status in admin dashboard
12. **Refund UI** — Staff can initiate refunds from admin

### Phase 3: Indoor Bookings (Optional)
13. **Extend to bay bookings** — Add payment step for premium club selection
14. **Combined checkout** — Bay rate + club rental in one payment

### Phase 4: Advanced Features (Future)
15. **Account Linking** (Link & Pay) — Returning customers skip checkout redirect
16. **Auth & Capture** — Hold funds at booking, capture at pickup (14-day max hold)
17. **SPayLater promotion** — Highlight installment options for expensive sets

---

## 11. Onboarding Checklist

Before development can begin, these must be obtained from ShopeePay:

- [ ] Contact ShopeePay Thailand integration team
- [ ] Sign NDA and commercial agreement
- [ ] Receive UAT/staging credentials (Client ID, Secret Key, Merchant ID, Store ID)
- [ ] Configure webhook callback URL in ShopeePay merchant portal
- [ ] Test end-to-end in staging
- [ ] Receive production credentials
- [ ] Go live

---

## 12. Error Handling Matrix

| ShopeePay Error | Our Action |
|---|---|
| `errcode: 0` | Success — update records |
| `errcode: -2, -1` | Server error — retry via Check Transaction Status |
| `errcode: 1` | Invalid params — log error, show user-friendly message |
| `errcode: 2` | Permission denied — alert ops team |
| `errcode: 4` | Not found — verify merchant/store IDs |
| `errcode: 5` | Processing — continue polling |
| `errcode: 11` | Duplicate request — check existing transaction |
| `errcode: 15` | Amount limit exceeded — show limit message |
| `errcode: 1908` | Maintenance — show "try again later" |

---

## 13. Security Considerations

1. **Signature verification** — Verify HMAC-SHA256 on ALL incoming webhooks before processing
2. **Amount validation** — Always confirm webhook amount matches our stored amount
3. **Idempotency** — Handle duplicate webhook deliveries (Thailand retries up to 2x)
4. **No client-side trust** — Never use redirect back to `return_url` as payment confirmation
5. **Secret management** — Store `SHOPEEPAY_SECRET_KEY` in environment variables only, never in code
6. **HTTPS only** — All endpoints must use TLS 1.2+
7. **Refund validation** — Verify refund amount doesn't exceed paid amount, check 12am-5am blocked window
8. **Audit trail** — Store raw webhook payloads in `payment_transactions.raw_webhook_payload`

---

## 14. References

- [ShopeePay Integration — Get Started](https://product.shopeepay.com/integration/get-started/)
- [ShopeePay Product Overview](https://product.shopeepay.com/)
- [Checkout API](https://product.shopeepay.com/integration/api/checkout-with-shopeepay/)
- [Link & Pay API](https://product.shopeepay.com/integration/api/link-and-pay/)
- [Account Linking API](https://product.shopeepay.com/integration/api/account-linking/)
- [Auth & Capture API](https://product.shopeepay.com/integration/api/auth-and-capture/)
- [Check Transaction Status](https://product.shopeepay.com/integration/api/check-transaction-status/)
- [Notify Transaction Status](https://product.shopeepay.com/integration/api/notify-transaction-status/)
- [Refund API](https://product.shopeepay.com/integration/api/refund-a-payment/)
- [Payment Methods by Region](https://product.shopeepay.com/products/functionalities/)
