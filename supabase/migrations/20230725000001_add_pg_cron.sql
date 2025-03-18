-- Enable the pg_cron extension
create extension if not exists pg_cron;

-- Grant usage on cron schema to postgres
grant usage on schema cron to postgres;

-- Create a secure API key setting
-- Note: In production, you should set this manually with the actual API key
-- alter database postgres set app.cron_api_key = 'your-secure-api-key';

-- Create the scheduled job to check for pending review requests every 5 minutes
select cron.schedule(
  'check-review-requests',
  '*/5 * * * *',
  $$
  select
    net.http_post(
      url := current_setting('app.review_request_webhook_url'),
      headers := '{"Content-Type": "application/json", "Authorization": "Bearer ' || current_setting('app.cron_api_key') || '"}',
      body := '{}'
    ) as request_sent
  $$
);

-- Add comment to explain this job
comment on cron.job check_review_requests is 'Sends scheduled review requests to customers 30 minutes after their session ends';

-- This job can be disabled with: select cron.unschedule('check-review-requests');
-- And enabled again with: select cron.schedule('check-review-requests', '*/5 * * * *', $$ ... $$); 