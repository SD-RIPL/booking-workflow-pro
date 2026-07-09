
-- enums
CREATE TYPE public.booking_kyc_status AS ENUM ('not_sent','sent','hold','cancelled');
CREATE TYPE public.booking_post_kyc_action AS ENUM ('next','hold','cancel');
CREATE TYPE public.booking_sd_status AS ENUM ('not_received','received');
CREATE TYPE public.booking_payment_mode AS ENUM ('prepaid','cod');
CREATE TYPE public.booking_dispatch_status AS ENUM ('pending','dispatched','delivered');
CREATE TYPE public.booking_stage AS ENUM ('booking','kyc','security_deposit','dispatch','active','cancelled');
CREATE TYPE public.booking_gateway AS ENUM ('razorpay','zoho_pay','company_account','other');

-- sequence for code
CREATE SEQUENCE IF NOT EXISTS public.bookings_code_seq START 1;

CREATE TABLE public.bookings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_code text UNIQUE NOT NULL DEFAULT ('B-' || lpad(nextval('public.bookings_code_seq')::text, 5, '0')),

  -- stage 1 booking
  booking_date date NOT NULL DEFAULT CURRENT_DATE,
  full_name text NOT NULL,
  mobile text NOT NULL,
  email text,
  address text,
  aadhaar_no text,
  sales_employee text,
  booking_txn_id text,
  booking_gateway public.booking_gateway,
  booking_amount numeric(10,2) NOT NULL DEFAULT 300,
  booking_gst numeric(10,2) NOT NULL DEFAULT 54,
  booking_total numeric(10,2) NOT NULL DEFAULT 354,

  -- stage 2 kyc
  kyc_status public.booking_kyc_status NOT NULL DEFAULT 'not_sent',
  kyc_sent_date date,

  -- post-kyc decision
  post_kyc_action public.booking_post_kyc_action,

  -- stage 3 security deposit
  sd_amount numeric(10,2),
  sd_status public.booking_sd_status NOT NULL DEFAULT 'not_received',
  sd_received_date date,
  sd_txn_id text,
  sd_payment_received numeric(10,2),
  sd_received_on public.booking_gateway,

  -- stage 4 dispatch + router
  payment_mode public.booking_payment_mode,
  cod_delivery_charge numeric(10,2) DEFAULT 0,
  dispatch_status public.booking_dispatch_status NOT NULL DEFAULT 'pending',
  dispatched_at date,

  router_company text,
  router_model_no text,
  sim_company text,
  router_sim_no text,
  router_sim_card_no text,
  router_imei_mac text,
  router_imei_wavlink text,
  sim_activation_status text,

  -- computed/linkage
  current_stage public.booking_stage NOT NULL DEFAULT 'booking',
  customer_id uuid REFERENCES public.customers(id) ON DELETE SET NULL,
  notes text,

  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX bookings_stage_idx ON public.bookings(current_stage);
CREATE INDEX bookings_kyc_idx ON public.bookings(kyc_status);
CREATE INDEX bookings_sd_idx ON public.bookings(sd_status);
CREATE INDEX bookings_dispatch_idx ON public.bookings(dispatch_status);
CREATE INDEX bookings_mobile_idx ON public.bookings(mobile);
CREATE INDEX bookings_date_idx ON public.bookings(booking_date);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.bookings TO authenticated;
GRANT ALL ON public.bookings TO service_role;

ALTER TABLE public.bookings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can view bookings" ON public.bookings
  FOR SELECT TO authenticated
  USING (public.has_any_role(auth.uid(), ARRAY['admin','manager','operator','support','finance']::app_role[]));

CREATE POLICY "Staff can create bookings" ON public.bookings
  FOR INSERT TO authenticated
  WITH CHECK (public.has_any_role(auth.uid(), ARRAY['admin','manager','operator','support']::app_role[]));

CREATE POLICY "Staff can update bookings" ON public.bookings
  FOR UPDATE TO authenticated
  USING (public.has_any_role(auth.uid(), ARRAY['admin','manager','operator','support']::app_role[]))
  WITH CHECK (public.has_any_role(auth.uid(), ARRAY['admin','manager','operator','support']::app_role[]));

CREATE POLICY "Super admin can delete bookings" ON public.bookings
  FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'::app_role));

-- auto-recompute current_stage + cod charge + booking_total + updated_at
CREATE OR REPLACE FUNCTION public.bookings_recompute()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  -- booking total
  NEW.booking_total := COALESCE(NEW.booking_amount,0) + COALESCE(NEW.booking_gst,0);

  -- cod charge auto
  IF NEW.payment_mode = 'cod' THEN
    NEW.cod_delivery_charge := COALESCE(NULLIF(NEW.cod_delivery_charge,0), 300);
  ELSE
    NEW.cod_delivery_charge := 0;
  END IF;

  -- auto kyc_sent_date when status flips to sent
  IF NEW.kyc_status = 'sent' AND NEW.kyc_sent_date IS NULL THEN
    NEW.kyc_sent_date := CURRENT_DATE;
  END IF;

  -- compute current stage
  IF NEW.kyc_status = 'cancelled' OR NEW.post_kyc_action = 'cancel' THEN
    NEW.current_stage := 'cancelled';
  ELSIF NEW.sim_activation_status IS NOT NULL AND lower(NEW.sim_activation_status) IN ('active','activated','live') THEN
    NEW.current_stage := 'active';
  ELSIF NEW.sd_status = 'received' THEN
    NEW.current_stage := 'dispatch';
  ELSIF NEW.kyc_status = 'sent' THEN
    NEW.current_stage := 'security_deposit';
  ELSIF NEW.kyc_status IN ('not_sent','hold') THEN
    NEW.current_stage := 'kyc';
  ELSE
    NEW.current_stage := 'booking';
  END IF;

  NEW.updated_at := now();
  RETURN NEW;
END $$;

CREATE TRIGGER bookings_recompute_trg
BEFORE INSERT OR UPDATE ON public.bookings
FOR EACH ROW EXECUTE FUNCTION public.bookings_recompute();
