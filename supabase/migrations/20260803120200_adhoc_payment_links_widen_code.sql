-- Widen the ad-hoc link code suffix from 4 to 8 characters.
--
-- GET /api/payments/shopeepay/status?ref=PL-... is unauthenticated (the code IS
-- the capability, same model as rental codes) and returns the staff-typed
-- `description`. With a 4-hex suffix a single day's namespace is only 65,536
-- values, so the whole day's descriptions -- free text that routinely names a
-- customer and an event ("Deposit - Somchai wedding, 40 pax") -- were
-- enumerable. Rental codes share the shape but carry no free text, which is why
-- this only matters here.
--
-- 8 hex chars = 4.3e9 per day, which is not enumerable.
-- Safe to apply in place: zero payment_links rows exist yet.

ALTER TABLE public.payment_links
  DROP CONSTRAINT IF EXISTS payment_links_code_chk;

ALTER TABLE public.payment_links
  ADD CONSTRAINT payment_links_code_chk
  CHECK (link_code ~ '^PL-[0-9]{8}-[A-Z0-9]{8}$');

CREATE OR REPLACE FUNCTION public.generate_payment_link_code()
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
DECLARE
  v_code TEXT;
  v_exists BOOLEAN;
BEGIN
  LOOP
    v_code := 'PL-' || to_char(now(), 'YYYYMMDD') || '-' || upper(substr(md5(random()::text), 1, 8));
    SELECT EXISTS(SELECT 1 FROM public.payment_links WHERE link_code = v_code) INTO v_exists;
    EXIT WHEN NOT v_exists;
  END LOOP;
  RETURN v_code;
END;
$function$;
