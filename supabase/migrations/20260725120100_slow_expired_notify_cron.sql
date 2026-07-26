-- Reduce Vercel function-invocation cost: slow club-rental-expired-notify to */5
-- and retire the 404-ing club-rental-payment-reminder job.
--
-- CONTEXT (2026-07-25): the Vercel Pro plan exhausted its $20 monthly credit on
-- ~Jul 24 with 10 days left in the cycle (+67% vs the same point last cycle).
-- Four pg_cron jobs on the LENGOLF project (bisimqmtxjsptehhqpeg) were issuing
-- an HTTP call to a Vercel route EVERY MINUTE — 5,760 calls/day, ~145K measured
-- per billing cycle against a total of 658K invocations (~22%), plus the
-- proportional Function Duration and Observability Events.
--
-- This migration covers the two jobs targeting booking.len.golf:
--
--   job 50  club-rental-expired-notify-1min    1min -> */5      (block 1)
--   job 51  club-rental-payment-reminder-1min  unscheduled      (block 2)
--
-- Job 51's target route does not exist in any repo — see the verification notes
-- at the retire block. Slowing a 404 would have been the wrong fix.
--
-- The two lengolf-forms.vercel.app jobs (45 lalamove-escalate, 46
-- club-rental-dispatch-reminder) are handled by the companion migration in the
-- lengolf-forms repo.
--
-- NOTE: this does NOT touch `shopeepay-expire-unpaid-rentals`, the minute job
-- that actually cancels the unpaid orders. That one is pure SQL
-- (shopeepay_expire_unpaid_rentals()) with no HTTP call, so it costs nothing on
-- Vercel and keeps its 1-minute cancel precision. Only the notify half slows.
--
-- HISTORY NOTE: production already carries both effects — they were applied
-- 2026-07-25 directly to prod as `20260725092743 reduce_cron_vercel_invocations`
-- (and the related token hardening as `20260725093444
-- migrate_cron_bearer_tokens_to_vault`), neither of which has a repo file. This
-- file is the durable in-repo record; against prod it re-applies as a verified
-- no-op (idempotent by construction below).
--
-- ---------------------------------------------------------------------------
-- Why */5 is safe here
-- ---------------------------------------------------------------------------
--   * No firing window to miss. The route sweeps every order with `expired_at`
--     stamped and `expired_notify_sent_at` still null over a 24h lookback, so a
--     later tick simply picks up whatever the earlier one would have.
--   * Idempotent. The claim is a guarded UPDATE (... IS NULL) before the send,
--     so overlapping or delayed ticks cannot double-ping the staff group; a
--     failed LINE push rolls the claim back for the next tick to retry.
--   * Batch capacity is ample. BATCH_LIMIT is 5 orders per tick; at */5 that is
--     still 60 orders/hour of drain, far above realistic expiry volume. The 24h
--     lookback only starts dropping notifications if a backlog were to exceed
--     that rate for a full day.
--   * Latency-insensitive. This is an internal "customer abandoned an unpaid
--     order" notice — nobody acts on it inside 60 seconds.
--
-- Job keeps its jobid and jobname (cron.alter_job, not unschedule+reschedule)
-- so job_run_details history keyed on jobid 50 stays continuous. The name is
-- consequently a cosmetic lie ("...-1min" running every 5 minutes); renaming
-- would churn the jobid, which is not worth it.

DO $migration$
DECLARE
  v_jobid bigint;
BEGIN
  -- Fresh/local environments (supabase db reset, preview branches) may not have
  -- pg_cron at all, and nothing in this repo's migration chain creates job 50 —
  -- it was scheduled out-of-band. Skip quietly there (same guard as
  -- 20260429120100_shopeepay_cleanup_cron.sql); the fail-loud check below is
  -- for prod-like databases where the job SHOULD exist.
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    RAISE NOTICE 'pg_cron not installed — skipping cron cadence change.';
    RETURN;
  END IF;

  SELECT jobid INTO v_jobid
    FROM cron.job
   WHERE jobname = 'club-rental-expired-notify-1min';

  -- EXCEPTION, not NOTICE: a NOTICE is swallowed by apply_migration and by the
  -- Supabase SQL editor, so a missed job would record this migration as applied
  -- while changing nothing. Note pg_cron 1.4+ puts an RLS policy
  -- (username = current_user) on cron.job, so "not found" can also mean the job
  -- is owned by a different role.
  IF v_jobid IS NULL THEN
    RAISE EXCEPTION
      'Job club-rental-expired-notify-1min not found in cron.job (visible as role %). Nothing altered.',
      current_user;
  END IF;

  PERFORM cron.alter_job(v_jobid, schedule := '*/5 * * * *');
  RAISE NOTICE 'Set club-rental-expired-notify-1min (jobid %) to */5.', v_jobid;
END
$migration$;

-- ---------------------------------------------------------------------------
-- Retire job 51 — club-rental-payment-reminder-1min
-- ---------------------------------------------------------------------------
-- `/api/cron/club-rental-payment-reminder` does not exist. Verified three ways:
--   1. No such route in lengolf-booking-new @ main (64fab50), lengolf-forms @
--      master (ab048b9), or on any local branch of either repo.
--   2. Live probe against the job's ACTUAL target URL (read from cron.job.command,
--      not assumed): POST returned 404.
--   3. Control probe against the sibling club-rental-expired-notify on the same
--      deployment returned 405 — proving the method-probe distinguishes
--      "absent" from "present but GET-only", so the 404 is a real absence.
--
-- The job had been firing every minute at a non-existent route: ~1,440 billed
-- Vercel invocations/day (~43K/month) doing nothing at all.
--
-- Idempotent: only unschedules if present, so re-applying is safe. The
-- asymmetry with block 1's fail-loud check is deliberate: if RLS hid this job
-- from us we couldn't unschedule it anyway, and its live absence was verified
-- 2026-07-26 — "absent" here is success, not a silent failure mode.
DO $migration$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    RAISE NOTICE 'pg_cron not installed — nothing to unschedule.';
    RETURN;
  END IF;

  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'club-rental-payment-reminder-1min') THEN
    PERFORM cron.unschedule('club-rental-payment-reminder-1min');
    RAISE NOTICE 'Unscheduled club-rental-payment-reminder-1min (route returns 404).';
  ELSE
    RAISE NOTICE 'club-rental-payment-reminder-1min already absent — nothing to unschedule.';
  END IF;
END
$migration$;

-- ROLLBACK, if the route is later deployed and the job is wanted back:
--
--   SELECT cron.schedule(
--     'club-rental-payment-reminder-1min',
--     '*/5 * * * *',   -- do NOT restore at 1-minute; see this file's header
--     $cron$
--       SELECT net.http_get(
--         url := 'https://booking.len.golf/api/cron/club-rental-payment-reminder',
--         headers := jsonb_build_object(
--           'Authorization', 'Bearer ' || (
--             SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'cron_api_key' LIMIT 1
--           )
--         ),
--         timeout_milliseconds := 30000
--       ) AS request_id;
--     $cron$
--   );
--
-- `cron_api_key` is the Vault secret the booking.len.golf jobs read (it must
-- match the route's CRON_API_KEY env check); `cron_secret` is the
-- lengolf-forms convention. Don't mix them up — a restored job signed with the
-- wrong secret 401s every tick forever, which is the same
-- billed-invocations-doing-nothing failure this migration exists to remove.
--
-- HARDENING (done): jobs 50/51 were originally created with the CRON_API_KEY
-- bearer token hardcoded in plaintext in cron.job.command, unlike jobs 45/46
-- which read from Vault. Job 50 was migrated to the Vault pattern on
-- 2026-07-25 (`20260725093444 migrate_cron_bearer_tokens_to_vault`, applied
-- directly to prod); its command now carries no token literal. Whether the
-- previously-exposed token VALUE was also rotated is NOT confirmed — verify
-- before considering the exposure closed.
