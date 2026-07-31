# Booking confirmation latency: ~13s → ~4s

Date: 2026-07-31
Branch: `perf/booking-confirm-latency` → PR into `feat/booking-ux-overhaul` (not `main`)

## Problem

`POST /api/bookings/create` holds its response open for the entire side-effect
chain, so the customer watches the "Confirming Your Booking" modal for the whole
thing.

Measured from `public.booking_process_logs`, 349 bookings over 30 days:

| | n | p50 booking row | p50 notifications | p50 end | p95 end |
|---|---|---|---|---|---|
| new customer | 56 | 5.3s | 10.8s | **12.9s** | 15.8s |
| everyone else | 293 | 3.7s | 8.3s | **7.9s** | 13.4s |

Review-request scheduling runs only for `isNewCustomer && !isLiffContext`
(`route.ts:981`), so the ~13s figure is the first-time-customer path. The other
84% still wait ~7.9s.

Two things the original problem statement did not cover:

- **The 10s timeout wall fires on ~7% of bookings.** 21 rows log step
  `Notifications` at p50 `10002ms` — exactly `executeParallel`'s timeout. Those
  customers wait the full 10s and are then shown a "notifications failed" toast.
- **Pre-booking timings are silently lost.** `logTiming` runs with
  `bookingId = 'pending'` until the row exists.
  `booking_process_logs.booking_id` has `FOREIGN KEY ... REFERENCES bookings(id)`
  (`fk_booking`), so every insert before `Booking creation` violates the FK and is
  swallowed by the catch at `route.ts:232`. ~3s of the request is unmeasured.

## Root cause

Two independent causes, one of which dominates.

### 1. The functions run on the wrong continent

```
X-Vercel-Id: sin1::iad1::...
             ^^^^  ^^^^
             edge  function execution region
```

Functions execute in **`iad1` (Washington DC)**. Supabase is in
**`ap-southeast-1` (Singapore)**. `vercel.json` pins no `regions`, so the project
has been on Vercel's US default since it was created. Every Supabase query
crosses the Pacific: ~230ms RTT baseline, plus 2–3 RTTs for a cold TLS handshake.

Measured DB-side execution versus observed wall time:

| Operation | DB-side | Observed |
|---|---|---|
| `check_all_bays_availability` | 118ms | — |
| `get_customer_packages` | 44ms | — |
| `normalize_phone_number`, customer lookup | ~0ms | — |
| **Total real query work** | **~165ms** | |
| One `INSERT` (`Booking creation` step) | ~1ms | **990ms p50** |
| Pre-response (~5 sequential round trips) | — | **~3s** |
| Email send | — | **4.6s** |

The email is the same story. SMTP is a 9-round-trip conversation (connect → EHLO
→ STARTTLS → EHLO → AUTH → MAIL → RCPT → DATA → QUIT) and `mail.len.golf` is
Thai-hosted; from US East that is ~2.3s of pure latency before any work happens.

### 2. Everything is awaited before responding

Notifications (~4.6s) and review scheduling (~4.5s including its caller's
lookups) are awaited even though neither affects what the customer is told. The
review request fires 30 minutes *after the session ends*.

Notifications also go out over **self-HTTP** — `route.ts:99` and `:152` fetch
`${baseUrl}/api/notifications/{email,line}`, so the route invokes its own
serverless functions over the public URL. That is a second invocation (cold start
possible) plus a network round trip plus TLS on top of the real SMTP/LINE work.

## Non-goal: naked fire-and-forget

The obvious move — stop awaiting — is banned by this repo's `CLAUDE.md`, and the
ban is correct. On Vercel, `void promise()` / `.catch()` after the response gets
its sockets torn down mid-flight, surfacing as `TypeError: fetch failed` 2–10s
later. That rule is not being reverted.

The sanctioned mechanism is `waitUntil`, which keeps the instance alive until the
side effects settle. **We use `after()` from `next/server` rather than
`waitUntil` from `@vercel/functions`.** They are the same mechanism — on Vercel
`after()` registers against the invocation's `waitUntil` — but `after()` is built
into Next.js 15.1 (verified importable: `typeof require('next/server').after ===
'function'` on 15.1.11), adds no dependency, and works under `next dev` and
`jest` without a Vercel request context.

## Design

Two phases, shipped as separate PRs so their effects can be attributed
separately in `booking_process_logs`.

### Phase 1 — region pin (own PR)

```json
{ "regions": ["sin1"], "functions": { "app/api/**/*": { "maxDuration": 30 } } }
```

Singapore puts the function ~5ms from Supabase instead of ~230ms, ~30ms from the
SMTP host, and in the same PoP already terminating Thai customers' TLS. It
benefits every route in the app, not just booking creation.

Blast radius is the whole app, which is why it ships alone and gets 24–48h of
observation. Nothing in the stack is US-anchored — LINE is JP, ShopeePay SG/TH,
Supabase SG, SMTP TH, Google/Facebook auth are anycast — but that is reasoning,
not measurement, so the deploy is watched. Reverting is a one-line change.

Expected: pre-response path ~4s → ~1s; email 4.6s → ~1s.

### Phase 2 — response boundary moves to the booking commit

```
   auth → availability + customer service → package lookup
   INSERT bookings
   club-set post-insert race check      ← stays inline
   logTiming('Response sent')           ← new marker
   return NextResponse.json(...)
   ─────────────────────────────────────────────────────
   after(async () => {
     preferred_language write
     marketing_opt_in write
     formatBookingData + B1G1 eligibility + auto-promo label + credit grant
     email + LINE, called directly, Promise.allSettled
     review-request scheduling
     drain the pending booking_process_logs writes
   })
```

The consent and language writes run *ahead* of the notifications rather than
after them, so they never sit behind a notification that is waiting out its 15s
guard.

The final drain matters: `logTiming` fires its `booking_process_logs` insert
without awaiting it. That was harmless while the route kept running afterwards,
but the last statement in the deferred callback is itself a `logTiming` — so
without the drain the callback would resolve with an INSERT still in flight and
Vercel could tear the instance down on top of it. That is the same floating
promise the rule above bans, and these rows are the only remaining channel
reporting notification delivery.

**The club-set race check stays inline.** It is a data-integrity check on the row
just written, it only runs when a premium club set was chosen (minority path),
and keeping it avoids reasoning about whether the response carries a stale
`rental_club_set_id`.

**Direct calls replace self-HTTP.** Two behaviour-preserving extractions:

- `lib/notifications/bookingEmail.ts` — the `standardizedData` →
  `sendConfirmationEmail` mapping, lifted from `email/route.ts:46`.
- `lib/notifications/staffLine.ts` — `buildBookingCreatedMessage(payload)` (the
  message builder, moved verbatim) and `pushToStaffGroup(text)` (env check + LINE
  API call, throwing a typed error carrying `status`/`details` so the route can
  reproduce its current response shape).

Both notification routes stay live and behaviourally unchanged — seven other
callers depend on them (`clubs/order`, `clubs/reserve`, the ShopeePay webhook and
refund route, the expiry cron, `lineNotifyService`, `handleRefundNotify`). This
PR changes only who the *booking-create* path calls.

**Two live instances of the banned pattern get fixed here.** `route.ts:739`
(`preferred_language`) and `route.ts:819` (`marketing_opt_in`) are naked `.then()`
writes issued before the response — exactly the shape that dies on Vercel, and
`marketing_opt_in` is the write that was already silently lost once (see the
2026-07-26 note in `CLAUDE.md`). Moving them into `after()` gives them a
guaranteed live instance.

**The 10s wall goes.** `executeParallel(..., {timeout: 10000})` is replaced by
`Promise.allSettled` with a 15s per-task guard, inside the 30s `maxDuration`
budget. No customer is waiting on it, so the ~7% who currently eat the full 10s
stop doing so.

**`notificationsSuccess` is removed**, along with the client toast at
`BookingDetails.tsx:748`. The route cannot know the outcome at response time, and
a customer whose booking succeeded does not benefit from a notification-delivery
warning. Failures still log server-side.

**`scheduleReviewRequest` is trimmed.** It currently builds a fresh Supabase
client per call and re-fetches `date/start_time/duration` from the booking row
the caller already holds (`reviewRequestScheduler.ts:58`). It will accept those
from the caller and reuse the shared admin client.

**The SMTP transporter is left alone.** It has no `pool: true`
(`emailService.ts:47`), so every send pays a full handshake — but at ~12
bookings/day instances are almost always cold, so there is rarely a warm
connection to reuse. Pooling would add risk for no measurable gain.

## Verification

`Response sent` is the marker for customer-visible latency. Post-response steps
keep logging so ops visibility survives, but their `total_duration_ms` no longer
means "customer wait".

```sql
select step, count(*) n,
       round(percentile_cont(0.5) within group (order by total_duration_ms))::int p50,
       round(percentile_cont(0.95) within group (order by total_duration_ms))::int p95
from public.booking_process_logs
where created_at > now() - interval '30 days' and step <> 'cancellation'
group by step order by p50 desc;
```

Note `ENABLE_BOOKING_DETAILED_LOGGING=true` gates that logging
(`route.ts:27`).

Gates: `npx tsc --noEmit`, `npx next lint`, `npx jest`, `npx next build` (build
must show zero `MISSING_MESSAGE` — those are real bugs in this repo, not noise).

Tests:
- Golden-output test pinning `buildBookingCreatedMessage` against the current
  route's string for a representative payload, guarding the extraction.
- Route test mocking `after` to capture the callback, asserting the response
  resolves before any side effect runs, then running the callback and asserting
  notifications and scheduling fired.

A real booking end-to-end is the only proof the write path still works. **Ask the
owner before creating one** — it writes a real row and fires a staff LINE
notification. Cancel afterwards via `POST /api/vip/bookings/{id}/cancel`, not a
raw DB update, so staff get the cancellation notice they expect.

If a booking POST appears to hang with no DB row, **do not retry** — the request
can complete server-side after the client gives up, which produced a duplicate
booking in a previous session. Poll the DB first.

## Client-side note

`BookingDetails.tsx` already imposes a ~4s floor:
`ensureMinimumAnimationDuration(submissionStartTime, 3000)` plus a fixed
`setTimeout(1000)`. The modal shows for ≥4s regardless of server speed. After
both phases the server is well under that floor, so perceived time is ~4–5s and
the animation is never cut short. Tightening that floor is a separate UX decision
and out of scope here.

## Follow-ups (not in scope)

- **A B1G1 reconciliation query.** If the invocation dies between the response
  and the credit grant, the promise is broken *silently* — the
  `[B1G1] FAILED to record` log never fires either. A query for bookings whose
  staff note printed the free-hour promise with no matching `credit_grants` row
  would catch that, and the pre-existing failure modes with it.
- **Derive `NOTIFICATION_TIMEOUT_MS` from the remaining budget** rather than a
  fixed 15s, so a pathological cold start can't push the deferred chain toward
  the 30s `maxDuration`. Worst case today is ~20s, so this is not urgent.

- **Pre-booking logging blackout.** The `bookingId = 'pending'` FK violation
  means ~3s of every request is unmeasured. Fixing it means buffering pre-insert
  log rows and flushing them once the booking id exists.
- **The other seven self-HTTP notification callers** still pay the extra
  invocation + round trip. Same extraction applies; not needed for this problem.
