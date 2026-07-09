DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'public'
      AND t.typname = 'booking_gateway'
  ) THEN
    CREATE TYPE public.booking_gateway AS ENUM ('razorpay', 'zoho_pay', 'company_account', 'other');
  END IF;
END $$;

ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS booking_gateway public.booking_gateway,
  ADD COLUMN IF NOT EXISTS booking_total numeric(10,2) DEFAULT 354;

UPDATE public.bookings
SET booking_total = COALESCE(booking_amount, 0) + COALESCE(booking_gst, 0)
WHERE booking_total IS NULL
   OR booking_total IS DISTINCT FROM COALESCE(booking_amount, 0) + COALESCE(booking_gst, 0);

CREATE OR REPLACE FUNCTION public.bookings_set_booking_total()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.booking_total := COALESCE(NEW.booking_amount, 0) + COALESCE(NEW.booking_gst, 0);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_bookings_set_booking_total ON public.bookings;
CREATE TRIGGER trg_bookings_set_booking_total
BEFORE INSERT OR UPDATE OF booking_amount, booking_gst ON public.bookings
FOR EACH ROW
EXECUTE FUNCTION public.bookings_set_booking_total();

NOTIFY pgrst, 'reload schema';