-- Retire pg_cron job 36 — process-scheduled-campaigns
--
-- CONTEXT (2026-07-26): job 36 `process-scheduled-campaigns` (schedule
-- */5 * * * *, active) POSTs to
-- https://booking.len.golf/api/line/campaigns/process-scheduled with the Vault
-- `cron_api_key` bearer. No `app/api/line/**` route exists in this repo, so
-- every tick is a billed 404: ~288 Vercel invocations/day (~8.6K/month) doing
-- nothing. Same 404-zombie pattern as job 51 (club-rental-payment-reminder),
-- retired in 20260725120100_slow_expired_notify_cron.sql — this file follows
-- that migration's verification discipline and block structure.
--
-- Verified four ways before retiring:
--   1. Route absent from lengolf-booking-new across ALL git history — no
--      commit has ever touched app/api/line/** (`git log --all -- app/api/line`
--      is empty). The job's host was wrong from day one.
--   2. The processor DID exist — in lengolf-forms, where the campaigns feature
--      lives. Created 2026-02-28 (899ed553, "Enhanced campaign creation with
--      text+image support and scheduling"): a POST handler auth'd with forms'
--      CRON_SECRET that selected line_broadcast_campaigns rows with
--      status='scheduled' AND scheduled_at <= now() and called
--      /api/line/campaigns/{id}/send for each. Deleted 2026-03-04 (e0e8ad73,
--      "Remove 31 remaining unused API routes (Batch 3)") — it genuinely
--      received no traffic, because this job was aimed at booking.len.golf
--      instead of lengolf-forms.vercel.app. The cron job outlived the route it
--      was created for.
--   3. Live probe against the job's ACTUAL target URL (read from
--      cron.job.command, not assumed): POST returned 404. Control probe against
--      the GET-only sibling /api/cron/club-rental-expired-notify on the same
--      deployment returned 405 — the method-probe distinguishes "absent" from
--      "present but wrong method", so the 404 is a real absence.
--   4. Nothing is stranded by retiring: all 56 line_broadcast_campaigns rows
--      ever created are schedule_type='immediate'; zero rows have
--      status='scheduled' (checked 2026-07-26). The admin "Schedule" option has
--      never produced a scheduled campaign in production. job_run_details shows
--      the job "succeeded" every 5 minutes — that only means the SQL fired the
--      HTTP call; the 404 is invisible to pg_cron.
--
-- APPLY NOTE: as of 2026-07-26 the unschedule has NOT been applied to prod.
-- The autonomous session that authored this file was blocked from DB writes
-- (auto-mode classifier — same constraint as the CRON_API_KEY rotation; prod
-- writes need David at the keyboard). Deploy step: run the DO block below in
-- the dashboard SQL editor (Role postgres) against prod. It is idempotent by
-- construction, so repo-apply and prod-apply are safe in either order and
-- re-applying is a no-op. Until it runs, job 36 keeps 404ing every 5 minutes.
-- Verify afterwards with:
--   SELECT count(*) FROM cron.job WHERE jobname = 'process-scheduled-campaigns';  -- expect 0
--
-- Idempotent: only unschedules if present, so re-applying is safe. Fresh/local
-- environments without pg_cron (or without this out-of-band job) skip quietly —
-- "absent" here is success, not a silent failure mode (same reasoning as the
-- job-51 retire block).

DO $migration$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    RAISE NOTICE 'pg_cron not installed — nothing to unschedule.';
    RETURN;
  END IF;

  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'process-scheduled-campaigns') THEN
    PERFORM cron.unschedule('process-scheduled-campaigns');
    RAISE NOTICE 'Unscheduled process-scheduled-campaigns (route returns 404 — never existed on booking.len.golf).';
  ELSE
    RAISE NOTICE 'process-scheduled-campaigns already absent — nothing to unschedule.';
  END IF;
END
$migration$;

-- ROLLBACK — only if the scheduled-campaign feature is rebuilt. Two halves,
-- BOTH required, and the route must deploy BEFORE the job is scheduled:
--
--   1. Restore the processor route in lengolf-forms (it was deleted, not
--      refactored): `git checkout e0e8ad73^ -- app/api/line/campaigns/process-scheduled/route.ts`
--      in that repo, review, ship. The handler expects `Bearer ${CRON_SECRET}`
--      (lengolf-forms' secret).
--
--   2. Schedule against the FORMS host with the FORMS Vault secret:
--
--   SELECT cron.schedule(
--     'process-scheduled-campaigns',
--     '*/5 * * * *',
--     $cron$
--       SELECT net.http_post(
--         url := 'https://lengolf-forms.vercel.app/api/line/campaigns/process-scheduled',
--         headers := jsonb_build_object(
--           'Authorization', 'Bearer ' || (
--             SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'cron_secret' LIMIT 1
--           ),
--           'Content-Type', 'application/json'
--         ),
--         body := '{}'::jsonb,
--         timeout_milliseconds := 30000
--       ) AS request_id;
--     $cron$
--   );
--
-- `cron_secret` (forms) — NOT `cron_api_key` (booking) — because the route
-- lives in lengolf-forms and validates against that app's CRON_SECRET. The
-- retired job had this exactly inverted (booking host + booking secret for a
-- forms feature), which is how it 404'd unnoticed for ~5 months: wrong host →
-- route swept as "unused" → zombie job. A rebuilt job with mixed-up host or
-- secret recreates the same billed-invocations-doing-nothing failure this
-- migration removes.
--
-- NOTE for the rebuild decision: the lengolf-forms admin UI (new-campaign page)
-- still offers "Schedule" with a date/time picker and tells staff the campaign
-- "will be sent automatically at the scheduled time" — with this job retired
-- (and even before: the processor is gone) that promise is false. Either
-- rebuild per the rollback above or remove the Schedule option from the UI.
