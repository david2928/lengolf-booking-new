-- Nightly Meta Conversions API upload: tracking table + candidate view.
--
-- Meta sees ~14% of bookings today. LIFF loads no GTM (it lives outside
-- app/[locale]/), and staff-created bookings never touch a browser we own.
-- This is the Meta analogue of marketing.google_ads_conversion_uploads.
--
-- Destination dataset is LENGOLF v2 (1326508338698235) -- Lengolf-owned and
-- attached to act_725466328005161. The pixel firing on the site
-- (480537434714703) is owned by someone outside our Business Manager and
-- cannot be written to; see the design spec.

CREATE TABLE IF NOT EXISTS marketing.meta_capi_uploads (
  booking_id      TEXT PRIMARY KEY REFERENCES public.bookings(id) ON DELETE CASCADE,
  event_id        TEXT NOT NULL,
  event_name      TEXT NOT NULL DEFAULT 'Purchase',
  event_time      TIMESTAMPTZ NOT NULL,
  value           NUMERIC NOT NULL,
  currency        TEXT NOT NULL DEFAULT 'THB',
  action_source   TEXT NOT NULL,
  -- Identifier KINDS only ('em','ph','fn','ln','country'). Never values: this
  -- table must stay free of PII, hashed or otherwise.
  match_keys      TEXT[],
  status          TEXT NOT NULL CHECK (status IN ('pending','uploaded','failed','skipped')),
  events_received INTEGER,
  fbtrace_id      TEXT,
  error_message   TEXT,
  retry_count     INTEGER NOT NULL DEFAULT 0,
  uploaded_at     TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_meta_capi_uploads_status_created
  ON marketing.meta_capi_uploads (status, created_at);

COMMENT ON TABLE marketing.meta_capi_uploads IS
  'Idempotency + diagnostics for the nightly Meta CAPI upload. match_keys records '
  'WHICH identifier kinds were sent, never their values.';

-- Candidate view. Every exclusion rule lives here so the route cannot drift.
--
-- The 7-day floor is not a nicety: Meta rejects the ENTIRE request if any
-- event_time is older than 7 days, so a single stale row would poison the whole
-- batch.
--
-- "staff-created" == no 'Booking creation' row in booking_process_logs. Web and
-- LIFF both write one and are indistinguishable in `bookings`; they share
-- action_source 'website', which is correct for both since LIFF is a webview.
--
-- booking_email and customer_email are returned SEPARATELY rather than
-- COALESCEd. The @len.golf placeholder must be filtered per-field in the app:
-- coalescing here would let a placeholder customer record swallow a real
-- booking address and lose the identifier entirely.
CREATE OR REPLACE VIEW public.meta_capi_pending AS
SELECT
  b.id                                        AS booking_id,
  b.created_at                                AS event_time,
  b.name                                      AS customer_name,
  NULLIF(BTRIM(b.email), '')                  AS booking_email,
  NULLIF(BTRIM(c.email), '')                  AS customer_email,
  COALESCE(
    NULLIF(BTRIM(b.phone_number), ''),
    NULLIF(BTRIM(c.contact_number), '')
  )                                           AS phone,
  CASE WHEN EXISTS (
    SELECT 1 FROM public.booking_process_logs l
     WHERE l.booking_id = b.id
       AND l.step = 'Booking creation'
  ) THEN 'website' ELSE 'physical_store' END  AS action_source
FROM public.bookings b
LEFT JOIN public.customers c ON c.id = b.customer_id
WHERE b.status <> 'cancelled'
  AND COALESCE(b.customer_notes, '') NOT ILIKE '%TEST BOOKING%'
  AND b.created_at >= NOW() - INTERVAL '7 days'
  AND NOT EXISTS (
    SELECT 1 FROM marketing.meta_capi_uploads u
     WHERE u.booking_id = b.id
       -- 'pending' is deliberately NOT terminal: it means a previous run staged
       -- the row and then died before recording an outcome. Those must retry,
       -- and the stable event_id makes the retry safe against double-counting.
       AND (u.status IN ('uploaded','skipped')
            OR (u.status = 'failed' AND u.retry_count >= 3))
  );

COMMENT ON VIEW public.meta_capi_pending IS
  'Bookings eligible for Meta CAPI upload: non-cancelled, non-test, within Meta''s '
  '7-day event_time window, not already uploaded/skipped/exhausted.';

-- Server-side only. The route uses createServerClient() (service_role), and per
-- the Supabase hardening rules nothing in public may be readable by anon.
REVOKE ALL ON public.meta_capi_pending FROM anon, authenticated;
REVOKE ALL ON marketing.meta_capi_uploads FROM anon, authenticated;
