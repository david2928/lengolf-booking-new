# Opn Payments — Local Dev Setup

Get a working `/payment/checkout` flow against Opn test mode with the webhook firing back to your localhost.

## Prerequisites

1. Opn test account: https://dashboard.omise.co/test/
2. `.env.local` populated:
   ```
   OPN_PUBLIC_KEY=pkey_test_*
   OPN_SECRET_KEY=skey_test_*
   OPN_WEBHOOK_SECRET=<from dashboard > Webhook Endpoints>
   OPN_API_VERSION=2019-05-29
   ```
3. Either the `omise` CLI OR `ngrok` for tunneling webhooks to localhost.

## Option A — omise CLI (recommended)

```bash
# install (one-time)
npm install -g @omise/cli
# or use the binary from https://github.com/omise/omise-cli/releases

omise listen --forward-to http://localhost:3000/api/webhooks/opn
```

Copy the printed webhook signing secret into `.env.local` as `OPN_WEBHOOK_SECRET`. Restart `npm run dev`.

## Option B — ngrok

```bash
ngrok http 3000
# Copy the https://...ngrok-free.app URL.
# In Opn dashboard > Webhook Endpoints, add:
#   https://<your-ngrok-url>/api/webhooks/opn
```

The webhook signing secret is shown after you save the endpoint. Paste into `.env.local`.

## Test cards

- Successful charge: `4242 4242 4242 4242`, any future exp, any CVV
- 3DS-enabled successful: dashboard > Settings > 3DS — enable, then any test card triggers the issuer simulator
- Insufficient funds: `4242 4242 4242 4241`
- Other decline codes: see https://www.omise.co/api-test-cards

## Verify the flow

1. Create a course-rental that needs payment (`/course-rental` → submit form → get redirected to `/payment/checkout?ref=CR…`).
2. Pay with `4242 4242 4242 4242`. Expect either same-page success or 3DS redirect → return → success.
3. Check `payment_transactions` row: `status='success'`, `gateway_charge_id='chrg_*'`, `confirmation_email_sent_at` populated.
4. Check `club_rentals` row: `payment_status='paid'`, `expires_at` cleared.
5. Confirmation email arrived (check the SMTP test inbox or wherever `EMAIL_HOST` points in dev).
