-- Add optional lat/lng columns to store Google Places-pinned coordinates
-- for delivery addresses. Nullable because pickup orders never set them,
-- and delivery orders placed before this migration don't have them.
alter table public.club_rentals
  add column if not exists delivery_lat  double precision,
  add column if not exists delivery_lng  double precision;
