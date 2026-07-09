
-- ===== ENUMS =====
CREATE TYPE public.app_role AS ENUM ('admin', 'manager', 'operator', 'viewer');
CREATE TYPE public.customer_status AS ENUM ('active','due_soon','expired','suspended','disconnected','blacklisted');
CREATE TYPE public.sim_company AS ENUM ('airtel','vi');
CREATE TYPE public.sim_status AS ENUM ('available','assigned','active','blocked','lost','damaged');
CREATE TYPE public.router_status AS ENUM ('in_stock','assigned','installed','returned','faulty','lost');
CREATE TYPE public.payment_mode AS ENUM ('upi','cash','bank_transfer','qr','gateway');
CREATE TYPE public.kyc_type AS ENUM ('aadhaar','pan','voter_id','driving_license','passport');

-- ===== UPDATED_AT TRIGGER =====
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$ BEGIN NEW.updated_at = now(); RETURN NEW; END; $$
LANGUAGE plpgsql SET search_path = public;

-- ===== PROFILES =====
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users ON DELETE CASCADE,
  full_name TEXT,
  email TEXT,
  phone TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "profiles_read_all_auth" ON public.profiles FOR SELECT TO authenticated USING (true);
CREATE POLICY "profiles_update_own" ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = id);
CREATE POLICY "profiles_insert_own" ON public.profiles FOR INSERT TO authenticated WITH CHECK (auth.uid() = id);
CREATE TRIGGER trg_profiles_updated BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ===== USER ROLES =====
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "user_roles_read_own" ON public.user_roles FOR SELECT TO authenticated USING (user_id = auth.uid());

CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role public.app_role)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;

CREATE OR REPLACE FUNCTION public.has_any_role(_user_id UUID, _roles public.app_role[])
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = ANY(_roles))
$$;

-- Admin can read everyone's roles
CREATE POLICY "user_roles_admin_read_all" ON public.user_roles FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));
CREATE POLICY "user_roles_admin_manage" ON public.user_roles FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

-- ===== AUTO-CREATE PROFILE + FIRST ADMIN =====
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE user_count INT;
BEGIN
  INSERT INTO public.profiles (id, full_name, email)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email), NEW.email);

  SELECT COUNT(*) INTO user_count FROM public.user_roles;
  IF user_count = 0 THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'admin');
  ELSE
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'viewer');
  END IF;
  RETURN NEW;
END; $$;

CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ===== SEQUENCES FOR CUSTOMER & RECHARGE IDS =====
CREATE SEQUENCE public.customer_code_seq START 1;
CREATE SEQUENCE public.recharge_code_seq START 1;
CREATE SEQUENCE public.payment_code_seq START 1;

-- ===== CUSTOMERS =====
CREATE TABLE public.customers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_code TEXT NOT NULL UNIQUE DEFAULT ('CUS' || lpad(nextval('public.customer_code_seq')::text, 7, '0')),
  full_name TEXT NOT NULL,
  father_name TEXT,
  mobile TEXT NOT NULL,
  alternate_mobile TEXT,
  email TEXT,
  address TEXT,
  city TEXT,
  district TEXT,
  state TEXT,
  pincode TEXT,
  kyc_type public.kyc_type,
  kyc_number TEXT,
  activation_date DATE,
  installation_date DATE,
  source TEXT,
  assigned_executive TEXT,
  router_id UUID,
  sim_id UUID,
  notes TEXT,
  status public.customer_status NOT NULL DEFAULT 'active',
  current_expiry_date DATE,
  last_recharge_date DATE,
  created_by UUID REFERENCES auth.users,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_customers_mobile ON public.customers(mobile);
CREATE INDEX idx_customers_status ON public.customers(status);
CREATE INDEX idx_customers_expiry ON public.customers(current_expiry_date);
CREATE INDEX idx_customers_state ON public.customers(state);
CREATE INDEX idx_customers_city ON public.customers(city);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.customers TO authenticated;
GRANT ALL ON public.customers TO service_role;
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "customers_read_all" ON public.customers FOR SELECT TO authenticated USING (true);
CREATE POLICY "customers_insert" ON public.customers FOR INSERT TO authenticated WITH CHECK (public.has_any_role(auth.uid(), ARRAY['admin','manager','operator']::public.app_role[]));
CREATE POLICY "customers_update" ON public.customers FOR UPDATE TO authenticated USING (public.has_any_role(auth.uid(), ARRAY['admin','manager','operator']::public.app_role[]));
CREATE POLICY "customers_delete" ON public.customers FOR DELETE TO authenticated USING (public.has_role(auth.uid(),'admin'));
CREATE TRIGGER trg_customers_updated BEFORE UPDATE ON public.customers FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ===== SIMS =====
CREATE TABLE public.sims (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sim_number TEXT NOT NULL UNIQUE,
  packet_number TEXT,
  company public.sim_company NOT NULL,
  purchase_date DATE,
  assigned_customer_id UUID REFERENCES public.customers(id) ON DELETE SET NULL,
  assigned_date DATE,
  activation_date DATE,
  status public.sim_status NOT NULL DEFAULT 'available',
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_sims_status ON public.sims(status);
CREATE INDEX idx_sims_company ON public.sims(company);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sims TO authenticated;
GRANT ALL ON public.sims TO service_role;
ALTER TABLE public.sims ENABLE ROW LEVEL SECURITY;
CREATE POLICY "sims_read_all" ON public.sims FOR SELECT TO authenticated USING (true);
CREATE POLICY "sims_insert" ON public.sims FOR INSERT TO authenticated WITH CHECK (public.has_any_role(auth.uid(), ARRAY['admin','manager','operator']::public.app_role[]));
CREATE POLICY "sims_update" ON public.sims FOR UPDATE TO authenticated USING (public.has_any_role(auth.uid(), ARRAY['admin','manager','operator']::public.app_role[]));
CREATE POLICY "sims_delete" ON public.sims FOR DELETE TO authenticated USING (public.has_role(auth.uid(),'admin'));
CREATE TRIGGER trg_sims_updated BEFORE UPDATE ON public.sims FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ===== ROUTERS =====
CREATE TABLE public.routers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  serial_number TEXT NOT NULL UNIQUE,
  model TEXT,
  purchase_date DATE,
  assigned_customer_id UUID REFERENCES public.customers(id) ON DELETE SET NULL,
  assigned_date DATE,
  installation_date DATE,
  status public.router_status NOT NULL DEFAULT 'in_stock',
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_routers_status ON public.routers(status);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.routers TO authenticated;
GRANT ALL ON public.routers TO service_role;
ALTER TABLE public.routers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "routers_read_all" ON public.routers FOR SELECT TO authenticated USING (true);
CREATE POLICY "routers_insert" ON public.routers FOR INSERT TO authenticated WITH CHECK (public.has_any_role(auth.uid(), ARRAY['admin','manager','operator']::public.app_role[]));
CREATE POLICY "routers_update" ON public.routers FOR UPDATE TO authenticated USING (public.has_any_role(auth.uid(), ARRAY['admin','manager','operator']::public.app_role[]));
CREATE POLICY "routers_delete" ON public.routers FOR DELETE TO authenticated USING (public.has_role(auth.uid(),'admin'));
CREATE TRIGGER trg_routers_updated BEFORE UPDATE ON public.routers FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- FK references on customers
ALTER TABLE public.customers ADD CONSTRAINT customers_router_fk FOREIGN KEY (router_id) REFERENCES public.routers(id) ON DELETE SET NULL;
ALTER TABLE public.customers ADD CONSTRAINT customers_sim_fk FOREIGN KEY (sim_id) REFERENCES public.sims(id) ON DELETE SET NULL;

-- ===== RECHARGES =====
CREATE TABLE public.recharges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recharge_code TEXT NOT NULL UNIQUE DEFAULT ('RCH' || lpad(nextval('public.recharge_code_seq')::text, 7, '0')),
  customer_id UUID NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  recharge_date DATE NOT NULL DEFAULT CURRENT_DATE,
  plan_amount NUMERIC(10,2) NOT NULL,
  validity_days INT NOT NULL DEFAULT 25,
  expiry_date DATE NOT NULL,
  payment_mode public.payment_mode NOT NULL DEFAULT 'upi',
  transaction_id TEXT,
  collected_by UUID REFERENCES auth.users,
  collection_source TEXT,
  remarks TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_recharges_customer ON public.recharges(customer_id);
CREATE INDEX idx_recharges_date ON public.recharges(recharge_date);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.recharges TO authenticated;
GRANT ALL ON public.recharges TO service_role;
ALTER TABLE public.recharges ENABLE ROW LEVEL SECURITY;
CREATE POLICY "recharges_read_all" ON public.recharges FOR SELECT TO authenticated USING (true);
CREATE POLICY "recharges_insert" ON public.recharges FOR INSERT TO authenticated WITH CHECK (public.has_any_role(auth.uid(), ARRAY['admin','manager','operator']::public.app_role[]));
CREATE POLICY "recharges_update" ON public.recharges FOR UPDATE TO authenticated USING (public.has_any_role(auth.uid(), ARRAY['admin','manager']::public.app_role[]));
CREATE POLICY "recharges_delete" ON public.recharges FOR DELETE TO authenticated USING (public.has_role(auth.uid(),'admin'));

-- Trigger: when recharge inserted, update customer expiry + status
CREATE OR REPLACE FUNCTION public.after_recharge_insert()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.customers
  SET current_expiry_date = NEW.expiry_date,
      last_recharge_date = NEW.recharge_date,
      status = CASE
        WHEN NEW.expiry_date - CURRENT_DATE > 5 THEN 'active'::public.customer_status
        WHEN NEW.expiry_date - CURRENT_DATE >= 1 THEN 'due_soon'::public.customer_status
        ELSE 'expired'::public.customer_status
      END,
      updated_at = now()
  WHERE id = NEW.customer_id;
  RETURN NEW;
END; $$;
CREATE TRIGGER trg_after_recharge_insert AFTER INSERT ON public.recharges
FOR EACH ROW EXECUTE FUNCTION public.after_recharge_insert();

-- ===== PAYMENTS =====
CREATE TABLE public.payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_code TEXT NOT NULL UNIQUE DEFAULT ('PAY' || lpad(nextval('public.payment_code_seq')::text, 7, '0')),
  customer_id UUID NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  recharge_id UUID REFERENCES public.recharges(id) ON DELETE SET NULL,
  amount NUMERIC(10,2) NOT NULL,
  gst NUMERIC(10,2) NOT NULL DEFAULT 0,
  total_amount NUMERIC(10,2) NOT NULL,
  mode public.payment_mode NOT NULL DEFAULT 'upi',
  reference_number TEXT,
  collected_by UUID REFERENCES auth.users,
  collection_date DATE NOT NULL DEFAULT CURRENT_DATE,
  remarks TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_payments_customer ON public.payments(customer_id);
CREATE INDEX idx_payments_date ON public.payments(collection_date);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.payments TO authenticated;
GRANT ALL ON public.payments TO service_role;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "payments_read_all" ON public.payments FOR SELECT TO authenticated USING (true);
CREATE POLICY "payments_insert" ON public.payments FOR INSERT TO authenticated WITH CHECK (public.has_any_role(auth.uid(), ARRAY['admin','manager','operator']::public.app_role[]));
CREATE POLICY "payments_update" ON public.payments FOR UPDATE TO authenticated USING (public.has_any_role(auth.uid(), ARRAY['admin','manager']::public.app_role[]));
CREATE POLICY "payments_delete" ON public.payments FOR DELETE TO authenticated USING (public.has_role(auth.uid(),'admin'));

-- ===== SUSPENSIONS =====
CREATE TABLE public.suspensions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  suspended_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  suspended_by UUID REFERENCES auth.users,
  reason TEXT,
  resumed_at TIMESTAMPTZ,
  resumed_by UUID REFERENCES auth.users,
  resume_notes TEXT
);
CREATE INDEX idx_suspensions_customer ON public.suspensions(customer_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.suspensions TO authenticated;
GRANT ALL ON public.suspensions TO service_role;
ALTER TABLE public.suspensions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "suspensions_read_all" ON public.suspensions FOR SELECT TO authenticated USING (true);
CREATE POLICY "suspensions_insert" ON public.suspensions FOR INSERT TO authenticated WITH CHECK (public.has_any_role(auth.uid(), ARRAY['admin','manager','operator']::public.app_role[]));
CREATE POLICY "suspensions_update" ON public.suspensions FOR UPDATE TO authenticated USING (public.has_any_role(auth.uid(), ARRAY['admin','manager','operator']::public.app_role[]));
CREATE POLICY "suspensions_delete" ON public.suspensions FOR DELETE TO authenticated USING (public.has_role(auth.uid(),'admin'));

-- ===== AUDIT LOG =====
CREATE TABLE public.audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users,
  action TEXT NOT NULL,
  module TEXT NOT NULL,
  entity_id UUID,
  old_value JSONB,
  new_value JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_audit_module ON public.audit_logs(module);
CREATE INDEX idx_audit_created ON public.audit_logs(created_at DESC);
GRANT SELECT, INSERT ON public.audit_logs TO authenticated;
GRANT ALL ON public.audit_logs TO service_role;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "audit_read_admin_manager" ON public.audit_logs FOR SELECT TO authenticated USING (public.has_any_role(auth.uid(), ARRAY['admin','manager']::public.app_role[]));
CREATE POLICY "audit_insert_any_auth" ON public.audit_logs FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id OR user_id IS NULL);

-- ===== STATUS REFRESH FUNCTION (callable from app) =====
CREATE OR REPLACE FUNCTION public.refresh_customer_statuses()
RETURNS INT LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE updated_count INT;
BEGIN
  WITH upd AS (
    UPDATE public.customers
    SET status = CASE
      WHEN status IN ('suspended','disconnected','blacklisted') THEN status
      WHEN current_expiry_date IS NULL THEN 'expired'::public.customer_status
      WHEN current_expiry_date - CURRENT_DATE > 5 THEN 'active'::public.customer_status
      WHEN current_expiry_date - CURRENT_DATE >= 1 THEN 'due_soon'::public.customer_status
      ELSE 'expired'::public.customer_status
    END,
    updated_at = now()
    WHERE status NOT IN ('suspended','disconnected','blacklisted')
    RETURNING 1
  )
  SELECT COUNT(*) INTO updated_count FROM upd;
  RETURN updated_count;
END; $$;
GRANT EXECUTE ON FUNCTION public.refresh_customer_statuses() TO authenticated;
