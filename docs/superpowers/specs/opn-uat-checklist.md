# Opn Payments — UAT Checklist

Execute against `lengolf-opn-uat.vercel.app` (manual alias on the `feat/opn-payments` branch's preview deployment).

## Prerequisites

- [ ] All `OPN_*` env vars set in Vercel **Preview** environment
- [ ] Manual alias `lengolf-opn-uat.vercel.app` created and points at the latest `feat/opn-payments` preview deployment
- [ ] Opn dashboard webhook endpoint configured: `https://lengolf-opn-uat.vercel.app/api/webhooks/opn`
- [ ] OPN_WEBHOOK_SECRET in Vercel Preview matches the dashboard endpoint's secret

## Case 1 — Successful card payment (no 3DS)

- [ ] Visit `/course-rental`, create a rental, get redirected to `/payment/checkout?ref=CR…`
- [ ] Pay with test card `4242 4242 4242 4242`
- [ ] Redirected to `/payment/return?ref=CR…` showing spinner → success card within ~5s
- [ ] Receipt shows `chrg_*`, `4242 •••• 4242`, paid timestamp
- [ ] Confirmation email arrives at customer email within ~30s
- [ ] Supabase: `payment_transactions.status='success'`, `gateway_charge_id` populated, `confirmation_email_sent_at` not null
- [ ] Supabase: `club_rentals.payment_status='paid'`, `expires_at` cleared
- [ ] Staff LINE notification fires (check the LINE channel)

## Case 2 — Successful card payment (with 3DS)

- [ ] Toggle 3DS ON in Opn dashboard Settings
- [ ] Repeat Case 1 — expect a redirect to Opn's 3DS simulator, approve, redirect back
- [ ] `payment_transactions.is_3ds=true`
- [ ] All other assertions from Case 1 hold

## Case 3 — Card declined

- [ ] Pay with `4242 4242 4242 4241` (insufficient funds)
- [ ] `/payment/return` shows "Your card was declined" with retry + LINE-contact CTAs
- [ ] `payment_transactions.status='failed'`, `failure_code='insufficient_fund'`
- [ ] `club_rentals.payment_status='failed'`
- [ ] No confirmation email sent

## Case 4 — User cancels

- [ ] Start a payment, abandon during 3DS (close the tab)
- [ ] After ~15s, polling exhausts and `/payment/return` shows "Payment cancelled" with retry CTA
- [ ] `payment_transactions.status='pending'` (cleanup cron will mark it failed eventually)

## Case 5 — Webhook idempotency

- [ ] Trigger a payment to success
- [ ] In Opn dashboard, click "Resend" on the webhook delivery
- [ ] Server log shows "ack 200" with no double-email (the email-claim dedup blocks it)

## Case 6 — Refund (dashboard-initiated)

- [ ] In Opn dashboard, find the successful charge from Case 1 and issue a full refund
- [ ] Within ~10s, a row appears in `payment_refunds` with `gateway_refund_id='rfnd_*'`
- [ ] `club_rentals.payment_status='refunded'`
- [ ] Refund email fires

## Case 7 — Signature attack rejection

- [ ] Use `curl` to POST a forged payload to `/api/webhooks/opn` with no `Omise-Signature` header
- [ ] Server returns 401 (NOT 200) so a real attacker can't replay
- [ ] Server log shows "signature verification failed"

## Manual smoke-test the i18n

- [ ] Visit `/th/payment/checkout?ref=CR…` — entire form is in Thai, no `MISSING_MESSAGE` warnings in server log
- [ ] Same for `/ko/`, `/ja/`, `/zh/`

## After UAT signs off

- [ ] Document any failure cases observed → file as issues
- [ ] Notify user → they handle cutover (set OPN_* in Prod env, approve merge to main, decommission timeline starts)
