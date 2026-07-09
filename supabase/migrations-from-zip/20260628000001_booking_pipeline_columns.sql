-- ─────────────────────────────────────────────────────────────────────────────
-- Migration: add new sequential booking pipeline columns
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. KYC Verification
ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS kyc_verification text
    CHECK (kyc_verification IN ('approved', 'not_approved'));

-- 2. KYC Mail Status
ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS kyc_mail_status text
    CHECK (kyc_mail_status IN ('not_sent', 'sent'));

-- 3. SD Status — extend enum to text to support hold + cancel_booking
ALTER TABLE public.bookings
  ALTER COLUMN sd_status TYPE text;

ALTER TABLE public.bookings
  DROP CONSTRAINT IF EXISTS bookings_sd_status_check;

ALTER TABLE public.bookings
  ADD CONSTRAINT bookings_sd_status_check
    CHECK (sd_status IN ('not_received', 'received', 'hold', 'cancel_booking'));

-- 4. COD delivery status
ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS cod_delivery_status text
    CHECK (cod_delivery_status IN ('not_received', 'received'));

-- 5. COD delivery transaction details
ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS cod_delivery_txn_id text;

ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS cod_delivery_received_date date;

-- 6. Activation fields
ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS activation_date date;

ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS activation_status text
    CHECK (activation_status IN ('pending', 'active', 'failed'));

ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS activation_notes text;

-- ─────────────────────────────────────────────────────────────────────────────
-- 7. Update recompute trigger for new pipeline
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.bookings_recompute()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  -- booking total
  NEW.booking_total := COALESCE(NEW.booking_amount, 0) + COALESCE(NEW.booking_gst, 0);

  -- cod charge auto-fill
  IF NEW.payment_mode = 'cod' THEN
    NEW.cod_delivery_charge := COALESCE(NULLIF(NEW.cod_delivery_charge, 0), 300);
  ELSE
    NEW.cod_delivery_charge := 0;
  END IF;

  -- compute current_stage based on new sequential pipeline
  IF NEW.sd_status = 'cancel_booking' THEN
    NEW.current_stage := 'cancelled';
  ELSIF NEW.activation_status = 'active' THEN
    NEW.current_stage := 'active';
  ELSIF NEW.dispatch_status = 'delivered' THEN
    NEW.current_stage := 'dispatch';
  ELSIF NEW.sd_status = 'received' THEN
    NEW.current_stage := 'security_deposit';
  ELSIF NEW.kyc_mail_status = 'sent' THEN
    NEW.current_stage := 'kyc';
  ELSIF NEW.kyc_verification = 'approved' THEN
    NEW.current_stage := 'kyc';
  ELSE
    NEW.current_stage := 'booking';
  END IF;

  NEW.updated_at := now();
  RETURN NEW;
END $$;
