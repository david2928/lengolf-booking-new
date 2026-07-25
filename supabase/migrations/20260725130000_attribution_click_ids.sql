-- Google Ads click-ID capture: gclid / gbraid / wbraid (+ UTM) attribution.
--
-- Why: the offline-conversion uploader in lengolf-ads-etl currently sends only
-- hashed email + phone. Identifier-only uploads attribute nothing unless Google
-- can match them to a stored ad click, so metrics.all_conversions sat at 0 for
-- both "Offline Booking - Enhanced" (7522058856) and "Offline Rental -
-- Enhanced" (7670649287) despite a 100%-success upload history.
--
-- bookings already carries gclid, utm_source/medium/campaign and
-- gclid_conversion_uploaded from an earlier, abandoned effort — all NULL across
-- every row, never written to. Only the two iOS click identifiers are missing.
--
-- club_rental_orders has no attribution columns at all, so it gets the full set.
-- Keeping the two tables symmetric matters: public.google_ads_offline_conversions
-- is a UNION ALL over both, and the uploader reads one shape.
--
-- The three click identifiers are stored in SEPARATE columns rather than one
-- "click_id" + "type" pair because the Google Ads API treats them as mutually
-- exclusive on ClickConversion (exactly one may be set) AND because
-- user_identifiers cannot be combined with gbraid/wbraid. The uploader has to
-- branch on which one is present, so the schema makes that explicit.

alter table public.bookings
  add column if not exists gbraid text,
  add column if not exists wbraid text;

comment on column public.bookings.gclid is
  'Google Ads click ID from the landing URL or the _gcl_aw cookie. Non-iOS clicks. 90-day upload window.';
comment on column public.bookings.gbraid is
  'Google Ads iOS app-originated click ID (?gbraid / _gcl_ag cookie). Cannot be combined with hashed user identifiers on upload.';
comment on column public.bookings.wbraid is
  'Google Ads iOS browser-to-web click ID (?wbraid). URL-only — the Google tag writes no readable cookie for it.';

alter table public.club_rental_orders
  add column if not exists gclid text,
  add column if not exists gbraid text,
  add column if not exists wbraid text,
  add column if not exists utm_source text,
  add column if not exists utm_medium text,
  add column if not exists utm_campaign text,
  add column if not exists gclid_conversion_uploaded boolean default false;

comment on column public.club_rental_orders.gclid is
  'Google Ads click ID from the landing URL or the _gcl_aw cookie. Non-iOS clicks. 90-day upload window.';
comment on column public.club_rental_orders.gbraid is
  'Google Ads iOS app-originated click ID (?gbraid / _gcl_ag cookie). Cannot be combined with hashed user identifiers on upload.';
comment on column public.club_rental_orders.wbraid is
  'Google Ads iOS browser-to-web click ID (?wbraid). URL-only — the Google tag writes no readable cookie for it.';
