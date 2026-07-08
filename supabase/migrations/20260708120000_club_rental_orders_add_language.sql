-- Record the language the customer booked in on the order header, so
-- webhook-driven emails (paid confirmation, refund) can render in the
-- booking language instead of falling back to customers.preferred_language.
-- Mirrors bookings.language on the bay-booking side.
--
-- Nullable: staff-created orders (lengolf-forms) and historical orders have
-- no booking language; readers fall back to customers.preferred_language.
ALTER TABLE public.club_rental_orders
  ADD COLUMN IF NOT EXISTS language TEXT;

COMMENT ON COLUMN public.club_rental_orders.language IS
  'Site locale the customer booked in (en/th/ko/ja/zh). NULL for staff-created/legacy orders; email senders fall back to customers.preferred_language.';
