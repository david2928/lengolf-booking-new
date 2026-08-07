-- Nightly Meta CAPI upload. 20:00 UTC == 03:00 Asia/Bangkok.
--
-- Nightly (not hourly) is deliberate: Meta's event_time window is 7 days, so a
-- daily cadence leaves six days of slack to notice and recover from an outage,
-- and steady-state events are never more than ~24h old.
--
-- SECURITY: the Vault lookup is a SUBQUERY inside the scheduled command, so the
-- token is resolved at execution time and never stored. Do NOT interpolate the
-- secret into the command string with format() -- that writes it in plaintext
-- into cron.job.command, which is readable by anyone who can query cron.job and
-- is precisely what the July 2026 cron-token-to-Vault migration removed. This
-- mirrors the existing 'club-rental-expired-notify-1min' job exactly.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    RAISE NOTICE 'pg_cron not installed -- enable it and re-run this migration.';
    RETURN;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM vault.decrypted_secrets WHERE name = 'cron_api_key') THEN
    RAISE EXCEPTION 'Vault secret "cron_api_key" not found -- create it before scheduling.';
  END IF;

  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'meta-capi-upload-nightly') THEN
    PERFORM cron.unschedule('meta-capi-upload-nightly');
  END IF;

  PERFORM cron.schedule(
    'meta-capi-upload-nightly',
    '0 20 * * *',
    $cron$
      SELECT net.http_get(
        url := 'https://booking.len.golf/api/cron/meta-capi-upload',
        headers := jsonb_build_object(
          'Authorization',
          'Bearer ' || (
            SELECT decrypted_secret FROM vault.decrypted_secrets
             WHERE name = 'cron_api_key' LIMIT 1
          )
        ),
        timeout_milliseconds := 55000
      ) AS request_id;
    $cron$
  );
END
$$;
