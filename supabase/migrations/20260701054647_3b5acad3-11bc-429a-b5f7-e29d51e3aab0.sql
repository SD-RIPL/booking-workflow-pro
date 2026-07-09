
-- ============ ENUMS ============
CREATE TYPE public.app_role AS ENUM (
  'super_admin','admin','finance_manager','ops_manager',
  'support','operator','executive','viewer','auditor'
);

CREATE TYPE public.booking_stage AS ENUM (
  'customer_info','kyc_submitted','kyc_verified','deposit_requested',
  'deposit_verified','approved','router_assigned','sim_assigned',
  'courier_dispatched','courier_in_transit','delivered','installed',
  'activated','go_live','cancelled','rejected'
);

CREATE TYPE public.deposit_status AS ENUM (
  'pending','received','verified','refunded','partially_refunded',
  'forfeited','cancelled','rejected'
);

CREATE TYPE public.customer_status AS ENUM (
  'active','due_soon','expired','suspended','disconnected','blacklisted','returned'
);

CREATE TYPE public.sim_status AS ENUM (
  'available','assigned','active','lost','damaged','blocked','returned','deactivated'
);

CREATE TYPE public.router_status AS ENUM (
  'in_stock','assigned','installed','returned','faulty','lost','damaged','under_repair','scrapped'
);

CREATE TYPE public.telecom_operator AS ENUM ('airtel','vi','jio','bsnl','other');

CREATE TYPE public.payment_mode AS ENUM ('upi','cash','bank_transfer','qr_code','gateway','cheque','other');

-- ============ SEQUENCES for human IDs ============
CREATE SEQUENCE public.seq_customer_id START 1;
CREATE SEQUENCE public.seq_booking_id START 1;
CREATE SEQUENCE public.seq_recharge_id START 1;
CREATE SEQUENCE public.seq_deposit_id START 1;
CREATE SEQUENCE public.seq_payment_id START 1;

-- ============ PROFILES ============
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT UNIQUE NOT NULL,
  full_name TEXT,
  phone TEXT,
  avatar_url TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "profiles_read_all_authed" ON public.profiles FOR SELECT TO authenticated USING (true);
CREATE POLICY "profiles_self_update" ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = id);

-- ============ USER ROLES ============
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  granted_by UUID REFERENCES auth.users(id),
  granted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role public.app_role)
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role);
$$;

CREATE OR REPLACE FUNCTION public.has_any_role(_user_id UUID, _roles public.app_role[])
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = ANY(_roles));
$$;

CREATE POLICY "roles_read_self_or_admin" ON public.user_roles FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_any_role(auth.uid(), ARRAY['super_admin','admin']::public.app_role[]));
CREATE POLICY "roles_super_admin_manage" ON public.user_roles FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'super_admin'))
  WITH CHECK (public.has_role(auth.uid(),'super_admin'));

-- Updated-at helper
CREATE OR REPLACE FUNCTION public.tg_set_updated_at() RETURNS TRIGGER
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

CREATE TRIGGER trg_profiles_updated BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- Auto-create profile + seed super admin
CREATE OR REPLACE FUNCTION public.handle_new_user() RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name)
  VALUES (NEW.id, NEW.email, COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email))
  ON CONFLICT (id) DO NOTHING;

  IF NEW.email_confirmed_at IS NOT NULL
     AND lower(NEW.email) = 'sudarshan.soni@rishishwarindustry.in' THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'super_admin')
    ON CONFLICT (user_id, role) DO NOTHING;
  END IF;

  RETURN NEW;
END; $$;

CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

CREATE OR REPLACE FUNCTION public.handle_user_confirmed() RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.email_confirmed_at IS NOT NULL AND OLD.email_confirmed_at IS NULL
     AND lower(NEW.email) = 'sudarshan.soni@rishishwarindustry.in' THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'super_admin')
    ON CONFLICT (user_id, role) DO NOTHING;
  END IF;
  RETURN NEW;
END; $$;

CREATE TRIGGER on_auth_user_confirmed
AFTER UPDATE OF email_confirmed_at ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_user_confirmed();

-- Helper: authenticated staff (any role assigned)
CREATE OR REPLACE FUNCTION public.is_staff(_uid UUID) RETURNS BOOLEAN
LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _uid);
$$;

-- ============ INVENTORY: SIMs ============
CREATE TABLE public.sims (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sim_number TEXT UNIQUE NOT NULL,
  packet_number TEXT,
  telecom public.telecom_operator NOT NULL,
  purchase_date DATE,
  activation_date DATE,
  status public.sim_status NOT NULL DEFAULT 'available',
  assigned_customer_id UUID,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES auth.users(id)
);
GRANT SELECT, INSERT, UPDATE ON public.sims TO authenticated;
GRANT ALL ON public.sims TO service_role;
ALTER TABLE public.sims ENABLE ROW LEVEL SECURITY;
CREATE POLICY "sims_staff_read" ON public.sims FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));
CREATE POLICY "sims_staff_write" ON public.sims FOR INSERT TO authenticated WITH CHECK (public.is_staff(auth.uid()));
CREATE POLICY "sims_staff_update" ON public.sims FOR UPDATE TO authenticated USING (public.is_staff(auth.uid()));
CREATE TRIGGER trg_sims_upd BEFORE UPDATE ON public.sims FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();
CREATE INDEX idx_sims_status ON public.sims(status);

-- ============ INVENTORY: Routers ============
CREATE TABLE public.routers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  serial_number TEXT UNIQUE NOT NULL,
  model TEXT,
  vendor TEXT,
  purchase_date DATE,
  warranty_until DATE,
  status public.router_status NOT NULL DEFAULT 'in_stock',
  condition TEXT,
  assigned_customer_id UUID,
  installation_date DATE,
  return_date DATE,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES auth.users(id)
);
GRANT SELECT, INSERT, UPDATE ON public.routers TO authenticated;
GRANT ALL ON public.routers TO service_role;
ALTER TABLE public.routers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "routers_staff_read" ON public.routers FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));
CREATE POLICY "routers_staff_write" ON public.routers FOR INSERT TO authenticated WITH CHECK (public.is_staff(auth.uid()));
CREATE POLICY "routers_staff_update" ON public.routers FOR UPDATE TO authenticated USING (public.is_staff(auth.uid()));
CREATE TRIGGER trg_routers_upd BEFORE UPDATE ON public.routers FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();
CREATE INDEX idx_routers_status ON public.routers(status);

-- ============ RECHARGE PLANS ============
CREATE TABLE public.recharge_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  amount NUMERIC(10,2) NOT NULL,
  validity_days INTEGER NOT NULL,
  telecom public.telecom_operator,
  data_allowance TEXT,
  description TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.recharge_plans TO authenticated;
GRANT ALL ON public.recharge_plans TO service_role;
ALTER TABLE public.recharge_plans ENABLE ROW LEVEL SECURITY;
CREATE POLICY "plans_staff_read" ON public.recharge_plans FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));
CREATE POLICY "plans_admin_write" ON public.recharge_plans FOR ALL TO authenticated
  USING (public.has_any_role(auth.uid(), ARRAY['super_admin','admin','finance_manager']::public.app_role[]))
  WITH CHECK (public.has_any_role(auth.uid(), ARRAY['super_admin','admin','finance_manager']::public.app_role[]));

-- ============ BOOKINGS ============
CREATE TABLE public.bookings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_code TEXT UNIQUE NOT NULL DEFAULT ('BKG' || lpad(nextval('public.seq_booking_id')::text, 7, '0')),
  full_name TEXT NOT NULL,
  father_name TEXT,
  mobile TEXT NOT NULL,
  alternate_mobile TEXT,
  email TEXT,
  address_line TEXT,
  city TEXT,
  district TEXT,
  state TEXT,
  pincode TEXT,
  kyc_type TEXT,
  kyc_number TEXT,
  kyc_docs_url TEXT,
  source TEXT,
  assigned_executive UUID REFERENCES auth.users(id),
  current_stage public.booking_stage NOT NULL DEFAULT 'customer_info',
  courier_partner TEXT,
  courier_tracking TEXT,
  remarks TEXT,
  customer_id UUID,
  router_id UUID REFERENCES public.routers(id),
  sim_id UUID REFERENCES public.sims(id),
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.bookings TO authenticated;
GRANT ALL ON public.bookings TO service_role;
ALTER TABLE public.bookings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "bookings_staff_read" ON public.bookings FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));
CREATE POLICY "bookings_staff_write" ON public.bookings FOR INSERT TO authenticated WITH CHECK (public.is_staff(auth.uid()));
CREATE POLICY "bookings_staff_update" ON public.bookings FOR UPDATE TO authenticated USING (public.is_staff(auth.uid()));
CREATE TRIGGER trg_bookings_upd BEFORE UPDATE ON public.bookings FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();
CREATE INDEX idx_bookings_stage ON public.bookings(current_stage);
CREATE INDEX idx_bookings_mobile ON public.bookings(mobile);

-- ============ BOOKING STAGE HISTORY ============
CREATE TABLE public.booking_stage_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id UUID NOT NULL REFERENCES public.bookings(id) ON DELETE CASCADE,
  from_stage public.booking_stage,
  to_stage public.booking_stage NOT NULL,
  remarks TEXT,
  performed_by UUID REFERENCES auth.users(id),
  performed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.booking_stage_history TO authenticated;
GRANT ALL ON public.booking_stage_history TO service_role;
ALTER TABLE public.booking_stage_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY "bsh_staff_read" ON public.booking_stage_history FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));
CREATE POLICY "bsh_staff_write" ON public.booking_stage_history FOR INSERT TO authenticated WITH CHECK (public.is_staff(auth.uid()));

-- ============ SECURITY DEPOSITS ============
CREATE TABLE public.security_deposits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  deposit_code TEXT UNIQUE NOT NULL DEFAULT ('DEP' || lpad(nextval('public.seq_deposit_id')::text, 7, '0')),
  booking_id UUID REFERENCES public.bookings(id) ON DELETE SET NULL,
  customer_id UUID,
  amount NUMERIC(10,2) NOT NULL,
  deposit_date DATE,
  payment_mode public.payment_mode,
  transaction_ref TEXT,
  status public.deposit_status NOT NULL DEFAULT 'pending',
  verified_by UUID REFERENCES auth.users(id),
  verified_at TIMESTAMPTZ,
  refund_requested_at TIMESTAMPTZ,
  refund_approved_at TIMESTAMPTZ,
  refund_amount NUMERIC(10,2),
  refund_mode public.payment_mode,
  refund_txn_ref TEXT,
  refund_remarks TEXT,
  remarks TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.security_deposits TO authenticated;
GRANT ALL ON public.security_deposits TO service_role;
ALTER TABLE public.security_deposits ENABLE ROW LEVEL SECURITY;
CREATE POLICY "dep_staff_read" ON public.security_deposits FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));
CREATE POLICY "dep_staff_write" ON public.security_deposits FOR INSERT TO authenticated WITH CHECK (public.is_staff(auth.uid()));
CREATE POLICY "dep_finance_update" ON public.security_deposits FOR UPDATE TO authenticated
  USING (public.has_any_role(auth.uid(), ARRAY['super_admin','admin','finance_manager']::public.app_role[]));
CREATE TRIGGER trg_dep_upd BEFORE UPDATE ON public.security_deposits FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- ============ CUSTOMERS ============
CREATE TABLE public.customers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_code TEXT UNIQUE NOT NULL DEFAULT ('CUS' || lpad(nextval('public.seq_customer_id')::text, 7, '0')),
  booking_id UUID REFERENCES public.bookings(id),
  full_name TEXT NOT NULL,
  father_name TEXT,
  mobile TEXT NOT NULL UNIQUE,
  alternate_mobile TEXT,
  email TEXT,
  address_line TEXT,
  city TEXT,
  district TEXT,
  state TEXT,
  pincode TEXT,
  kyc_type TEXT,
  kyc_number TEXT,
  activation_date DATE,
  installation_date DATE,
  source TEXT,
  assigned_executive UUID REFERENCES auth.users(id),
  router_id UUID REFERENCES public.routers(id),
  sim_id UUID REFERENCES public.sims(id),
  current_plan_id UUID REFERENCES public.recharge_plans(id),
  last_recharge_date DATE,
  expiry_date DATE,
  remaining_days INTEGER,
  status public.customer_status NOT NULL DEFAULT 'active',
  manual_suspend BOOLEAN NOT NULL DEFAULT false,
  notes TEXT,
  internal_remarks TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.customers TO authenticated;
GRANT ALL ON public.customers TO service_role;
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "cust_staff_read" ON public.customers FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));
CREATE POLICY "cust_staff_write" ON public.customers FOR INSERT TO authenticated WITH CHECK (public.is_staff(auth.uid()));
CREATE POLICY "cust_staff_update" ON public.customers FOR UPDATE TO authenticated USING (public.is_staff(auth.uid()));
CREATE TRIGGER trg_cust_upd BEFORE UPDATE ON public.customers FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();
CREATE INDEX idx_cust_status ON public.customers(status);
CREATE INDEX idx_cust_expiry ON public.customers(expiry_date);

-- ============ RECHARGES (immutable history) ============
CREATE TABLE public.recharges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recharge_code TEXT UNIQUE NOT NULL DEFAULT ('RCH' || lpad(nextval('public.seq_recharge_id')::text, 7, '0')),
  customer_id UUID NOT NULL REFERENCES public.customers(id),
  plan_id UUID REFERENCES public.recharge_plans(id),
  plan_name TEXT NOT NULL,
  amount NUMERIC(10,2) NOT NULL,
  gst_amount NUMERIC(10,2) DEFAULT 0,
  discount NUMERIC(10,2) DEFAULT 0,
  validity_days INTEGER NOT NULL,
  recharge_date DATE NOT NULL DEFAULT CURRENT_DATE,
  expiry_date DATE NOT NULL,
  payment_mode public.payment_mode,
  transaction_ref TEXT,
  collected_by UUID REFERENCES auth.users(id),
  collection_source TEXT,
  remarks TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.recharges TO authenticated;
GRANT ALL ON public.recharges TO service_role;
ALTER TABLE public.recharges ENABLE ROW LEVEL SECURITY;
CREATE POLICY "rch_staff_read" ON public.recharges FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));
CREATE POLICY "rch_staff_write" ON public.recharges FOR INSERT TO authenticated WITH CHECK (public.is_staff(auth.uid()));
CREATE INDEX idx_rch_customer ON public.recharges(customer_id);
CREATE INDEX idx_rch_date ON public.recharges(recharge_date);

-- ============ PAYMENTS ============
CREATE TABLE public.payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_code TEXT UNIQUE NOT NULL DEFAULT ('PAY' || lpad(nextval('public.seq_payment_id')::text, 7, '0')),
  customer_id UUID REFERENCES public.customers(id),
  recharge_id UUID REFERENCES public.recharges(id),
  deposit_id UUID REFERENCES public.security_deposits(id),
  amount NUMERIC(10,2) NOT NULL,
  gst NUMERIC(10,2) DEFAULT 0,
  net_amount NUMERIC(10,2),
  payment_mode public.payment_mode NOT NULL,
  reference_number TEXT,
  collection_date DATE NOT NULL DEFAULT CURRENT_DATE,
  collected_by UUID REFERENCES auth.users(id),
  approval_status TEXT NOT NULL DEFAULT 'approved',
  remarks TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.payments TO authenticated;
GRANT ALL ON public.payments TO service_role;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "pay_staff_read" ON public.payments FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));
CREATE POLICY "pay_staff_write" ON public.payments FOR INSERT TO authenticated WITH CHECK (public.is_staff(auth.uid()));
CREATE POLICY "pay_finance_update" ON public.payments FOR UPDATE TO authenticated
  USING (public.has_any_role(auth.uid(), ARRAY['super_admin','admin','finance_manager']::public.app_role[]));

-- ============ AUDIT LOG (append-only) ============
CREATE TABLE public.audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id UUID REFERENCES auth.users(id),
  actor_email TEXT,
  module TEXT NOT NULL,
  action TEXT NOT NULL,
  entity_type TEXT,
  entity_id TEXT,
  previous_value JSONB,
  new_value JSONB,
  ip_address TEXT,
  remarks TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.audit_log TO authenticated;
GRANT ALL ON public.audit_log TO service_role;
ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "audit_admin_read" ON public.audit_log FOR SELECT TO authenticated
  USING (public.has_any_role(auth.uid(), ARRAY['super_admin','admin','auditor']::public.app_role[]));
CREATE POLICY "audit_staff_write" ON public.audit_log FOR INSERT TO authenticated WITH CHECK (public.is_staff(auth.uid()));

-- ============ Recharge post-insert: update customer aggregates ============
CREATE OR REPLACE FUNCTION public.tg_after_recharge_insert() RETURNS TRIGGER
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.expiry_date := NEW.recharge_date + NEW.validity_days;
  RETURN NEW;
END; $$;
CREATE TRIGGER trg_rch_calc BEFORE INSERT ON public.recharges
FOR EACH ROW EXECUTE FUNCTION public.tg_after_recharge_insert();

CREATE OR REPLACE FUNCTION public.tg_recharge_sync_customer() RETURNS TRIGGER
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  UPDATE public.customers
     SET last_recharge_date = NEW.recharge_date,
         expiry_date = NEW.expiry_date,
         current_plan_id = COALESCE(NEW.plan_id, current_plan_id),
         remaining_days = (NEW.expiry_date - CURRENT_DATE),
         status = CASE
           WHEN manual_suspend THEN status
           WHEN (NEW.expiry_date - CURRENT_DATE) <= 0 THEN 'expired'::public.customer_status
           WHEN (NEW.expiry_date - CURRENT_DATE) <= 5 THEN 'due_soon'::public.customer_status
           ELSE 'active'::public.customer_status
         END
   WHERE id = NEW.customer_id;
  RETURN NEW;
END; $$;
CREATE TRIGGER trg_rch_sync AFTER INSERT ON public.recharges
FOR EACH ROW EXECUTE FUNCTION public.tg_recharge_sync_customer();

-- ============ Daily customer status refresh ============
CREATE OR REPLACE FUNCTION public.refresh_customer_status() RETURNS INTEGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE affected INTEGER;
BEGIN
  UPDATE public.customers
     SET remaining_days = COALESCE(expiry_date - CURRENT_DATE, 0),
         status = CASE
           WHEN manual_suspend THEN status
           WHEN expiry_date IS NULL THEN status
           WHEN (expiry_date - CURRENT_DATE) <= 0 THEN 'expired'::public.customer_status
           WHEN (expiry_date - CURRENT_DATE) <= 5 THEN 'due_soon'::public.customer_status
           ELSE 'active'::public.customer_status
         END
   WHERE status NOT IN ('disconnected','blacklisted','returned');
  GET DIAGNOSTICS affected = ROW_COUNT;
  RETURN affected;
END; $$;
