-- Reduce Vercel function-invocation cost: club-rental-expired-notify 1min -> */5.
--
-- CONTEXT (2026-07-25): the Vercel Pro plan exhausted its $20 monthly credit on
-- ~Jul 24 with 10 days left in the cycle (+67% vs the same point last cycle).
-- Four pg_cron jobs on the LENGOLF project (bisimqmtxjsptehhqpeg) were issuing
-- an HTTP call to a Vercel route EVERY MINUTE — 5,760 calls/day, ~145K per
-- billing cycle against a total of 658K invocations (~22%), plus the
-- proportional Function Duration and Observability Events.
--
-- This migration covers the one job targeting booking.len.golf:
--
--   job 50  club-rental-expired-notify-1min   1min -> */5     (this file)
--
-- The two lengolf-forms.vercel.app jobs (45 lalamove-escalate, 46
-- club-rental-dispatch-reminder) are handled by the companion migration in the
-- lengolf-forms repo. Job 51 (club-rental-payment-reminder-1min) has NO matching
-- route in EITHER repo at HEAD and is left untouched pending a status-code
-- check — if it is 404ing, the fix is to unschedule it, not to slow it.
--
-- NOTE: this does NOT touch `shopeepay-expire-unpaid-rentals`, the minute job
-- that actually cancels the unpaid orders. That one is pure SQL
-- (shopeepay_expire_unpaid_rentals()) with no HTTP call, so it costs nothing on
-- Vercel and keeps its 1-minute cancel precision. Only the notify half slows.
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
-- Idempotent: only unschedules if present, so re-applying is safe.
DO $migration$
BEGIN
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
--             SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'cron_secret' LIMIT 1
--           )
--         ),
--         timeout_milliseconds := 30000
--       ) AS request_id;
--     $cron$
--   );
--
-- ⚠️ NOTE THE DIFFERENCE FROM THE ORIGINAL. Jobs 50 and 51 were created with the
-- CRON_API_KEY bearer token HARDCODED IN PLAINTEXT in cron.job.command, unlike
-- jobs 45/46 which read it from Vault. That token is readable by anyone with DB
-- access. It is deliberately NOT reproduced here — the rollback above reads from
-- Vault instead, which is the pattern the lengolf-forms jobs already use.
-- The hardcoded token should be rotated and job 50 migrated to the Vault pattern
-- as a follow-up; that is out of scope for this cadence change.
