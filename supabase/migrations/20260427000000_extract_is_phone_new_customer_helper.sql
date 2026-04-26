-- Extract the canonical "is this customer new?" predicate from the
-- check_new_customer() trigger into a reusable function.
-- This becomes the single source of truth used by:
--   * the BEFORE INSERT/UPDATE trigger on public.bookings (refactored below)
--   * /api/user/has-bookings (booking-app eligibility preview)
--   * any future caller that needs the same answer
--
-- Logic mirrors the prior trigger exactly: a phone is "new" iff
--   1. no prior CONFIRMED booking with same normalize_phone_number(phone)
--   2. no pos.lengolf_sales row with same normalize_phone_number(customer_phone_number)
--   3. no prior CONFIRMED booking with same customer_id (when customer_id provided)

CREATE OR REPLACE FUNCTION public.is_phone_new_customer(
  p_phone text,
  p_customer_id uuid DEFAULT NULL,
  p_exclude_booking_id text DEFAULT NULL
) RETURNS boolean
LANGUAGE plpgsql
STABLE
SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $$
DECLARE
  v_normalized_phone text;
BEGIN
  -- Validate phone the same way the original trigger did
  IF p_phone IS NULL
     OR LENGTH(TRIM(p_phone)) < 8
     OR p_phone !~ '^[0-9+\-\s\(\)]+$'
     OR p_phone = '-'
     OR p_phone LIKE '0000%' THEN
    -- Phone unusable: fall back to customer_id-only check if available
    IF p_customer_id IS NOT NULL THEN
      RETURN NOT EXISTS (
        SELECT 1 FROM public.bookings
        WHERE customer_id = p_customer_id
          AND (p_exclude_booking_id IS NULL OR id != p_exclude_booking_id)
          AND status = 'confirmed'
      );
    END IF;
    -- No usable signal at all: matches the original trigger's fallthrough
    -- (which left is_new_customer untouched for the row). For preview callers
    -- the safest answer is "we don't know, treat as new" — but we return NULL
    -- here and let callers decide. Trigger wrapper handles its own default.
    RETURN NULL;
  END IF;

  v_normalized_phone := normalize_phone_number(p_phone);
  IF v_normalized_phone IS NULL OR LENGTH(v_normalized_phone) < 8 THEN
    RETURN NULL;
  END IF;

  RETURN NOT EXISTS (
      -- (1) Prior confirmed booking with same normalized phone
      SELECT 1 FROM public.bookings
      WHERE normalize_phone_number(phone_number) = v_normalized_phone
        AND (p_exclude_booking_id IS NULL OR id != p_exclude_booking_id)
        AND status = 'confirmed'
        AND phone_number IS NOT NULL
        AND LENGTH(TRIM(phone_number)) >= 8
        AND phone_number != '-'
        AND phone_number NOT LIKE '0000%'
    ) AND NOT EXISTS (
      -- (2) POS sales history with same normalized phone
      SELECT 1 FROM pos.lengolf_sales
      WHERE normalize_phone_number(customer_phone_number) = v_normalized_phone
        AND customer_phone_number IS NOT NULL
        AND LENGTH(TRIM(customer_phone_number)) >= 8
        AND customer_phone_number != '-'
        AND customer_phone_number NOT LIKE '0000%'
    ) AND NOT EXISTS (
      -- (3) Prior confirmed booking under same customer_id
      SELECT 1 FROM public.bookings
      WHERE customer_id = p_customer_id
        AND p_customer_id IS NOT NULL
        AND (p_exclude_booking_id IS NULL OR id != p_exclude_booking_id)
        AND status = 'confirmed'
    );
END;
$$;

COMMENT ON FUNCTION public.is_phone_new_customer(text, uuid, text) IS
  'Canonical predicate for whether a phone (and optional customer_id) belongs to a new customer. Used by the check_new_customer trigger and by booking-app eligibility-preview endpoints. Returns NULL when phone is unusable AND customer_id is NULL — caller decides default.';

-- Allow the booking-app server (service_role) and any authenticated server
-- contexts to call this. Anon stays blocked.
GRANT EXECUTE ON FUNCTION public.is_phone_new_customer(text, uuid, text) TO service_role, authenticated;

-- Refactor the trigger to be a thin wrapper around the new helper.
-- Behavior is preserved: when the helper returns NULL (no usable signal),
-- we leave NEW.is_new_customer untouched, matching the prior trigger.
CREATE OR REPLACE FUNCTION public.check_new_customer()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $$
DECLARE
  v_is_new boolean;
BEGIN
  v_is_new := public.is_phone_new_customer(
    NEW.phone_number,
    NEW.customer_id,
    NEW.id
  );
  IF v_is_new IS NOT NULL THEN
    NEW.is_new_customer := v_is_new;
  END IF;
  RETURN NEW;
END;
$$;
