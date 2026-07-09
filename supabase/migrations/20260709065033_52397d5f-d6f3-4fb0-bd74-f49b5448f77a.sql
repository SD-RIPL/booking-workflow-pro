
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

CREATE SEQUENCE public.seq_customer_id START 1;
CREATE SEQUENCE public.seq_booking_id START 1;
CREATE SEQUENCE public.seq_recharge_id START 1;
CREATE SEQUENCE public.seq_deposit_id START 1;
CREATE SEQUENCE public.seq_payment_id START 1;

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

CREATE OR REPLACE FUNCTION public.tg_set_updated_at() RETURNS TRIGGER
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

CREATE TRIGGER trg_profiles_updated BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

CREATE OR REPLACE FUNCTION public.is_staff(_uid UUID) RETURNS BOOLEAN
LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _uid);
$$;

CREATE TABLE public.sims (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sim_number TEXT UNIQUE NOT NULL,
  packet_number TEXT,
  telecom public.telecom_operator,
  purchase_date DATE,
  activation_date DATE,
  status public.sim_status NOT NULL DEFAULT 'available',
  assigned_customer_id UUID,
  company TEXT,
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

CREATE TYPE public.booking_gateway AS ENUM ('razorpay','zoho_pay','company_account','other');

-- ============ BOOKINGS (with all workflow columns) ============
CREATE TABLE public.bookings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_code TEXT UNIQUE NOT NULL DEFAULT ('BKG' || lpad(nextval('public.seq_booking_id')::text, 7, '0')),
  full_name TEXT NOT NULL,
  father_name TEXT,
  mobile TEXT NOT NULL,
  alternate_mobile TEXT,
  email TEXT,
  address_line TEXT,
  address TEXT,
  city TEXT,
  district TEXT,
  state TEXT,
  pincode TEXT,
  kyc_type TEXT,
  kyc_number TEXT,
  kyc_docs_url TEXT,
  aadhaar_no TEXT,
  source TEXT,
  assigned_executive UUID REFERENCES auth.users(id),
  current_stage public.booking_stage NOT NULL DEFAULT 'customer_info',
  -- Booking stage
  booking_date DATE,
  sales_employee TEXT,
  booking_amount NUMERIC,
  booking_gst NUMERIC,
  booking_txn_id TEXT,
  booking_gateway public.booking_gateway,
  booking_total NUMERIC(10,2) DEFAULT 354,
  company_account TEXT,
  -- KYC stage
  kyc_verification TEXT,
  kyc_mail_status TEXT,
  kyc_sent_date DATE,
  -- Security Deposit stage
  sd_status TEXT DEFAULT 'not_received',
  sd_amount NUMERIC(10,2),
  sd_received_date DATE,
  sd_txn_id TEXT,
  sd_payment_received NUMERIC(10,2),
  sd_received_on public.booking_gateway,
  -- COD
  cod_amount NUMERIC(10,2),
  cod_date DATE,
  cod_txn_id TEXT,
  cod_received_on TEXT,
  cod_delivery_charge NUMERIC(10,2) DEFAULT 0,
  cod_delivery_status TEXT,
  cod_delivery_txn_id TEXT,
  cod_delivery_received_date DATE,
  payment_mode TEXT,
  -- Router Configuration stage
  router_ssid TEXT,
  router_password TEXT,
  router_company TEXT DEFAULT 'Wavelink',
  router_model_no TEXT,
  sim_company TEXT,
  sim_packet_no TEXT,
  router_sim_no TEXT,
  router_sim_card_no TEXT,
  router_imei_mac TEXT,
  router_imei_wavlink TEXT,
  sim_activation_status TEXT,
  configuration_date DATE,
  -- Dispatch stage
  dispatch_status TEXT DEFAULT 'pending',
  dispatch_schedule_date DATE,
  pickup_date DATE,
  delivery_date DATE,
  dispatched_at DATE,
  courier_partner TEXT,
  courier_tracking TEXT,
  -- Activation stage
  activation_date DATE,
  activation_status TEXT,
  activation_notes TEXT,
  -- Housekeeping
  remarks TEXT,
  notes TEXT,
  customer_id UUID,
  router_id UUID REFERENCES public.routers(id),
  sim_id UUID REFERENCES public.sims(id),
  workflow_stage TEXT NOT NULL DEFAULT 'booking', -- booking|kyc|deposit|router_config|dispatch|activation|completed
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
CREATE INDEX idx_bookings_workflow ON public.bookings(workflow_stage);
CREATE INDEX idx_bookings_mobile ON public.bookings(mobile);

CREATE TABLE public.booking_stage_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id UUID NOT NULL REFERENCES public.bookings(id) ON DELETE CASCADE,
  from_stage TEXT,
  to_stage TEXT NOT NULL,
  remarks TEXT,
  performed_by UUID REFERENCES auth.users(id),
  performed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.booking_stage_history TO authenticated;
GRANT ALL ON public.booking_stage_history TO service_role;
ALTER TABLE public.booking_stage_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY "bsh_staff_read" ON public.booking_stage_history FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));
CREATE POLICY "bsh_staff_write" ON public.booking_stage_history FOR INSERT TO authenticated WITH CHECK (public.is_staff(auth.uid()));

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
  address TEXT,
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
  current_expiry_date DATE,
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

CREATE OR REPLACE FUNCTION public.tg_sync_current_expiry()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.current_expiry_date := NEW.expiry_date; RETURN NEW; END; $$;
CREATE TRIGGER trg_sync_current_expiry BEFORE INSERT OR UPDATE OF expiry_date ON public.customers
FOR EACH ROW EXECUTE FUNCTION public.tg_sync_current_expiry();

CREATE TABLE public.recharges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recharge_code TEXT UNIQUE NOT NULL DEFAULT ('RCH' || lpad(nextval('public.seq_recharge_id')::text, 7, '0')),
  customer_id UUID NOT NULL REFERENCES public.customers(id),
  plan_id UUID REFERENCES public.recharge_plans(id),
  plan_name TEXT,
  amount NUMERIC(10,2),
  plan_amount NUMERIC,
  gst_amount NUMERIC(10,2) DEFAULT 0,
  discount NUMERIC(10,2) DEFAULT 0,
  validity_days INTEGER NOT NULL,
  recharge_date DATE NOT NULL DEFAULT CURRENT_DATE,
  expiry_date DATE NOT NULL,
  payment_mode public.payment_mode,
  transaction_ref TEXT,
  transaction_id TEXT,
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

CREATE TABLE public.payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_code TEXT UNIQUE NOT NULL DEFAULT ('PAY' || lpad(nextval('public.seq_payment_id')::text, 7, '0')),
  customer_id UUID REFERENCES public.customers(id),
  recharge_id UUID REFERENCES public.recharges(id),
  deposit_id UUID REFERENCES public.security_deposits(id),
  amount NUMERIC(10,2) NOT NULL,
  gst NUMERIC(10,2) DEFAULT 0,
  net_amount NUMERIC(10,2),
  total_amount NUMERIC,
  payment_mode public.payment_mode,
  mode TEXT,
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

CREATE TABLE public.suspensions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  suspended_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  suspended_by UUID REFERENCES auth.users(id),
  reason TEXT,
  resumed_at TIMESTAMPTZ,
  resumed_by UUID REFERENCES auth.users(id),
  resume_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.suspensions TO authenticated;
GRANT ALL ON public.suspensions TO service_role;
ALTER TABLE public.suspensions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "sus_staff_read" ON public.suspensions FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));
CREATE POLICY "sus_staff_write" ON public.suspensions FOR ALL TO authenticated
  USING (public.has_any_role(auth.uid(), ARRAY['super_admin','admin','ops_manager','operator']::public.app_role[]))
  WITH CHECK (public.has_any_role(auth.uid(), ARRAY['super_admin','admin','ops_manager','operator']::public.app_role[]));

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

CREATE TABLE public.audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id),
  action TEXT NOT NULL,
  module TEXT NOT NULL,
  entity_id UUID,
  old_value JSONB,
  new_value JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.audit_logs TO authenticated;
GRANT ALL ON public.audit_logs TO service_role;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auditlogs_admin_read" ON public.audit_logs FOR SELECT TO authenticated
  USING (public.has_any_role(auth.uid(), ARRAY['super_admin','admin','auditor']::public.app_role[]));

CREATE TABLE public.user_module_access (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  module TEXT NOT NULL,
  allowed BOOLEAN NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, module)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_module_access TO authenticated;
GRANT ALL ON public.user_module_access TO service_role;
ALTER TABLE public.user_module_access ENABLE ROW LEVEL SECURITY;
CREATE POLICY "uma_read_self_or_admin" ON public.user_module_access FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(),'super_admin'));
CREATE POLICY "uma_write_admin" ON public.user_module_access FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'super_admin'))
  WITH CHECK (public.has_role(auth.uid(),'super_admin'));

-- Tickets (minimal — matching RaiseTicketDialog expectations)
CREATE TABLE public.tickets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_code TEXT UNIQUE NOT NULL DEFAULT ('TKT' || lpad(floor(random()*10000000)::int::text, 7, '0')),
  customer_id UUID REFERENCES public.customers(id) ON DELETE SET NULL,
  subject TEXT NOT NULL,
  description TEXT,
  category TEXT,
  priority TEXT DEFAULT 'normal',
  status TEXT NOT NULL DEFAULT 'open',
  assigned_to UUID REFERENCES auth.users(id),
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.tickets TO authenticated;
GRANT ALL ON public.tickets TO service_role;
ALTER TABLE public.tickets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tkt_staff_read" ON public.tickets FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));
CREATE POLICY "tkt_staff_write" ON public.tickets FOR INSERT TO authenticated WITH CHECK (public.is_staff(auth.uid()));
CREATE POLICY "tkt_staff_update" ON public.tickets FOR UPDATE TO authenticated USING (public.is_staff(auth.uid()));
CREATE TRIGGER trg_tkt_upd BEFORE UPDATE ON public.tickets FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

CREATE TABLE public.ticket_updates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id UUID NOT NULL REFERENCES public.tickets(id) ON DELETE CASCADE,
  message TEXT NOT NULL,
  updated_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.ticket_updates TO authenticated;
GRANT ALL ON public.ticket_updates TO service_role;
ALTER TABLE public.ticket_updates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tu_staff_read" ON public.ticket_updates FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));
CREATE POLICY "tu_staff_write" ON public.ticket_updates FOR INSERT TO authenticated WITH CHECK (public.is_staff(auth.uid()));

-- ============ Helper RPCs ============
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

CREATE OR REPLACE FUNCTION public.refresh_customer_statuses() RETURNS INTEGER
LANGUAGE SQL SECURITY DEFINER SET search_path = public AS $$
  SELECT public.refresh_customer_status();
$$;
GRANT EXECUTE ON FUNCTION public.refresh_customer_status() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.refresh_customer_statuses() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.log_audit_event(
  _module text, _action text, _entity_id uuid DEFAULT NULL,
  _old_value jsonb DEFAULT NULL, _new_value jsonb DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _id uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  INSERT INTO public.audit_logs(user_id, module, action, entity_id, old_value, new_value)
  VALUES (auth.uid(), _module, _action, _entity_id, _old_value, _new_value)
  RETURNING id INTO _id;
  RETURN _id;
END; $$;
GRANT EXECUTE ON FUNCTION public.log_audit_event(text,text,uuid,jsonb,jsonb) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.grant_role_by_email(p_email text, p_role public.app_role)
RETURNS public.user_roles LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE target_id uuid; rec public.user_roles;
BEGIN
  IF NOT public.has_role(auth.uid(),'super_admin') THEN RAISE EXCEPTION 'Only Super Admin may grant roles'; END IF;
  SELECT id INTO target_id FROM public.profiles WHERE lower(email) = lower(p_email);
  IF target_id IS NULL THEN RAISE EXCEPTION 'No user with email %', p_email; END IF;
  INSERT INTO public.user_roles(user_id, role, granted_by) VALUES (target_id, p_role, auth.uid())
  ON CONFLICT (user_id, role) DO UPDATE SET granted_by = EXCLUDED.granted_by, granted_at = now()
  RETURNING * INTO rec;
  RETURN rec;
END; $$;
GRANT EXECUTE ON FUNCTION public.grant_role_by_email(text, public.app_role) TO authenticated;

CREATE OR REPLACE FUNCTION public.revoke_role(p_user_id uuid, p_role public.app_role)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.has_role(auth.uid(),'super_admin') THEN RAISE EXCEPTION 'Only Super Admin may revoke roles'; END IF;
  IF p_user_id = auth.uid() AND p_role = 'super_admin' THEN RAISE EXCEPTION 'Refusing to revoke own super_admin'; END IF;
  DELETE FROM public.user_roles WHERE user_id = p_user_id AND role = p_role;
  RETURN FOUND;
END; $$;
GRANT EXECUTE ON FUNCTION public.revoke_role(uuid, public.app_role) TO authenticated;

-- ============ Sequential Booking Workflow trigger ============
-- Strict lock: each save must fill the required fields for the current stage
-- before workflow_stage can advance.
CREATE OR REPLACE FUNCTION public.bookings_enforce_workflow()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE
  stages TEXT[] := ARRAY['booking','kyc','deposit','router_config','dispatch','activation','completed'];
  old_idx int;
  new_idx int;
BEGIN
  IF TG_OP = 'INSERT' THEN
    -- On insert, only 'booking' fields required
    IF NEW.workflow_stage IS NULL OR NEW.workflow_stage = '' THEN NEW.workflow_stage := 'booking'; END IF;
    IF NEW.workflow_stage <> 'booking' THEN
      RAISE EXCEPTION 'New bookings must start at stage=booking'
        USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
  END IF;

  old_idx := array_position(stages, OLD.workflow_stage);
  new_idx := array_position(stages, NEW.workflow_stage);
  IF new_idx IS NULL THEN
    RAISE EXCEPTION 'Invalid workflow_stage: %', NEW.workflow_stage USING ERRCODE = 'check_violation';
  END IF;
  IF new_idx < old_idx THEN
    RAISE EXCEPTION 'Workflow cannot move backwards (from % to %)', OLD.workflow_stage, NEW.workflow_stage
      USING ERRCODE = 'check_violation';
  END IF;
  IF new_idx > old_idx + 1 THEN
    RAISE EXCEPTION 'Workflow cannot skip stages (from % to %)', OLD.workflow_stage, NEW.workflow_stage
      USING ERRCODE = 'check_violation';
  END IF;

  -- Stage gate: when advancing to next stage, prior stage's required fields must be present in NEW
  IF new_idx > old_idx THEN
    -- Booking -> KYC: require booking fields
    IF OLD.workflow_stage = 'booking' THEN
      IF NEW.booking_date IS NULL OR COALESCE(NEW.sales_employee,'')='' OR COALESCE(NEW.mobile,'')=''
         OR COALESCE(NEW.email,'')='' OR COALESCE(NEW.address,'')='' THEN
        RAISE EXCEPTION 'Cannot advance: booking date, sales employee, mobile, email and address are required'
          USING ERRCODE = 'check_violation';
      END IF;
    END IF;
    -- KYC -> Deposit: require kyc_verification=approved AND aadhaar_no
    IF OLD.workflow_stage = 'kyc' THEN
      IF NEW.kyc_verification IS DISTINCT FROM 'approved' THEN
        RAISE EXCEPTION 'Cannot advance: KYC must be Approved' USING ERRCODE = 'check_violation';
      END IF;
      IF COALESCE(NEW.aadhaar_no,'') = '' THEN
        RAISE EXCEPTION 'Cannot advance: Aadhaar Number is required when KYC is Approved'
          USING ERRCODE = 'check_violation';
      END IF;
    END IF;
    -- Deposit -> Router Config: require sd_status set appropriately with required fields
    IF OLD.workflow_stage = 'deposit' THEN
      IF NEW.sd_status = 'received' THEN
        IF NEW.sd_amount IS NULL OR COALESCE(NEW.sd_txn_id,'')='' OR NEW.sd_received_on IS NULL THEN
          RAISE EXCEPTION 'Cannot advance: Deposit amount, transaction ID and received-on are required'
            USING ERRCODE = 'check_violation';
        END IF;
      ELSIF NEW.sd_status = 'cod' THEN
        IF NEW.cod_amount IS NULL OR NEW.cod_date IS NULL OR COALESCE(NEW.cod_txn_id,'')='' OR COALESCE(NEW.cod_received_on,'')='' THEN
          RAISE EXCEPTION 'Cannot advance: COD amount, date, transaction ID and received-on are required'
            USING ERRCODE = 'check_violation';
        END IF;
      ELSE
        RAISE EXCEPTION 'Cannot advance: Security Deposit status must be Received or COD'
          USING ERRCODE = 'check_violation';
      END IF;
    END IF;
    -- Router Config -> Dispatch: all router fields
    IF OLD.workflow_stage = 'router_config' THEN
      IF COALESCE(NEW.router_ssid,'')='' OR COALESCE(NEW.router_password,'')='' OR COALESCE(NEW.router_company,'')=''
         OR COALESCE(NEW.router_model_no,'')='' OR COALESCE(NEW.sim_company,'')=''
         OR COALESCE(NEW.sim_packet_no,'')='' OR COALESCE(NEW.router_sim_no,'')=''
         OR COALESCE(NEW.router_imei_mac,'')='' THEN
        RAISE EXCEPTION 'Cannot advance: all Router Configuration fields are required'
          USING ERRCODE = 'check_violation';
      END IF;
    END IF;
    -- Dispatch -> Activation: dispatch_status=delivered AND delivery_date
    IF OLD.workflow_stage = 'dispatch' THEN
      IF NEW.dispatch_status IS DISTINCT FROM 'delivered' OR NEW.delivery_date IS NULL THEN
        RAISE EXCEPTION 'Cannot advance: Dispatch must be Delivered with a Delivery Date'
          USING ERRCODE = 'check_violation';
      END IF;
    END IF;
    -- Activation -> Completed: activation fields
    IF OLD.workflow_stage = 'activation' THEN
      IF NEW.activation_date IS NULL OR COALESCE(NEW.activation_status,'')='' OR COALESCE(NEW.activation_notes,'')='' THEN
        RAISE EXCEPTION 'Cannot advance: Activation date, status and notes are required'
          USING ERRCODE = 'check_violation';
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS bookings_enforce_workflow_trg ON public.bookings;
CREATE TRIGGER bookings_enforce_workflow_trg
BEFORE INSERT OR UPDATE ON public.bookings
FOR EACH ROW EXECUTE FUNCTION public.bookings_enforce_workflow();

-- Auto-create Customer when advancing from deposit -> router_config
CREATE OR REPLACE FUNCTION public.bookings_auto_create_customer()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE c public.customers;
BEGIN
  IF OLD.workflow_stage = 'deposit' AND NEW.workflow_stage = 'router_config' AND NEW.customer_id IS NULL THEN
    INSERT INTO public.customers (
      booking_id, full_name, mobile, email, address, address_line, source,
      assigned_executive, activation_date
    ) VALUES (
      NEW.id, NEW.full_name, NEW.mobile, NEW.email,
      COALESCE(NEW.address, NEW.address_line),
      COALESCE(NEW.address, NEW.address_line),
      NEW.source, NEW.assigned_executive, NEW.activation_date
    )
    ON CONFLICT (mobile) DO UPDATE SET booking_id = EXCLUDED.booking_id
    RETURNING * INTO c;
    NEW.customer_id := c.id;
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS bookings_auto_create_customer_trg ON public.bookings;
CREATE TRIGGER bookings_auto_create_customer_trg
BEFORE UPDATE OF workflow_stage ON public.bookings
FOR EACH ROW EXECUTE FUNCTION public.bookings_auto_create_customer();

-- Generic audit trigger
CREATE OR REPLACE FUNCTION public.tg_write_audit()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE eid text; aemail text;
BEGIN
  SELECT email INTO aemail FROM public.profiles WHERE id = auth.uid();
  IF TG_OP = 'DELETE' THEN
    eid := COALESCE((OLD.id)::text, NULL);
    INSERT INTO public.audit_log(actor_id, actor_email, module, action, entity_type, entity_id, previous_value)
    VALUES (auth.uid(), aemail, TG_TABLE_NAME, 'delete', TG_TABLE_NAME, eid, to_jsonb(OLD));
    RETURN OLD;
  ELSIF TG_OP = 'UPDATE' THEN
    eid := COALESCE((NEW.id)::text, NULL);
    INSERT INTO public.audit_log(actor_id, actor_email, module, action, entity_type, entity_id, previous_value, new_value)
    VALUES (auth.uid(), aemail, TG_TABLE_NAME, 'update', TG_TABLE_NAME, eid, to_jsonb(OLD), to_jsonb(NEW));
    RETURN NEW;
  ELSE
    eid := COALESCE((NEW.id)::text, NULL);
    INSERT INTO public.audit_log(actor_id, actor_email, module, action, entity_type, entity_id, new_value)
    VALUES (auth.uid(), aemail, TG_TABLE_NAME, 'insert', TG_TABLE_NAME, eid, to_jsonb(NEW));
    RETURN NEW;
  END IF;
END; $$;

DO $$ DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['bookings','security_deposits','customers','recharges','payments','sims','routers','recharge_plans','user_roles','tickets'] LOOP
    EXECUTE format('CREATE TRIGGER trg_audit_%1$s AFTER INSERT OR UPDATE OR DELETE ON public.%1$s FOR EACH ROW EXECUTE FUNCTION public.tg_write_audit();', t);
  END LOOP;
END; $$;

-- Daily cron
CREATE EXTENSION IF NOT EXISTS pg_cron;
DO $$ BEGIN
  PERFORM cron.unschedule('rishishwar-refresh-customer-status');
EXCEPTION WHEN OTHERS THEN NULL; END; $$;
SELECT cron.schedule('rishishwar-refresh-customer-status','0 1 * * *',$$SELECT public.refresh_customer_status();$$);

NOTIFY pgrst, 'reload schema';
