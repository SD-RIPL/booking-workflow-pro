
-- 1) Per-user module overrides
CREATE TABLE IF NOT EXISTS public.user_module_access (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  module text NOT NULL,
  allowed boolean NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, module)
);

GRANT SELECT ON public.user_module_access TO authenticated;
GRANT ALL ON public.user_module_access TO service_role;

ALTER TABLE public.user_module_access ENABLE ROW LEVEL SECURITY;

CREATE POLICY "uma_read_own_or_admin" ON public.user_module_access
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "uma_admin_manage" ON public.user_module_access
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER uma_updated_at
  BEFORE UPDATE ON public.user_module_access
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2) Super admin passes every role check
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id
      AND (role = _role OR role = 'super_admin'::app_role)
  )
$$;

CREATE OR REPLACE FUNCTION public.has_any_role(_user_id uuid, _roles app_role[])
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id
      AND (role = ANY(_roles) OR role = 'super_admin'::app_role)
  )
$$;

-- 3) Broaden read access on shared tables for Support & Finance
DROP POLICY IF EXISTS customers_read_staff ON public.customers;
CREATE POLICY customers_read_staff ON public.customers FOR SELECT TO authenticated
  USING (public.has_any_role(auth.uid(),
    ARRAY['admin','manager','operator','support','finance']::app_role[]));

DROP POLICY IF EXISTS payments_read_staff ON public.payments;
CREATE POLICY payments_read_staff ON public.payments FOR SELECT TO authenticated
  USING (public.has_any_role(auth.uid(),
    ARRAY['admin','manager','operator','finance']::app_role[]));

DROP POLICY IF EXISTS payments_insert ON public.payments;
CREATE POLICY payments_insert ON public.payments FOR INSERT TO authenticated
  WITH CHECK (public.has_any_role(auth.uid(),
    ARRAY['admin','manager','operator','finance']::app_role[]));

DROP POLICY IF EXISTS payments_update ON public.payments;
CREATE POLICY payments_update ON public.payments FOR UPDATE TO authenticated
  USING (public.has_any_role(auth.uid(),
    ARRAY['admin','manager','finance']::app_role[]));

DROP POLICY IF EXISTS recharges_read_staff ON public.recharges;
CREATE POLICY recharges_read_staff ON public.recharges FOR SELECT TO authenticated
  USING (public.has_any_role(auth.uid(),
    ARRAY['admin','manager','operator','finance']::app_role[]));

DROP POLICY IF EXISTS recharges_insert ON public.recharges;
CREATE POLICY recharges_insert ON public.recharges FOR INSERT TO authenticated
  WITH CHECK (public.has_any_role(auth.uid(),
    ARRAY['admin','manager','operator','finance']::app_role[]));

DROP POLICY IF EXISTS recharges_update ON public.recharges;
CREATE POLICY recharges_update ON public.recharges FOR UPDATE TO authenticated
  USING (public.has_any_role(auth.uid(),
    ARRAY['admin','manager','finance']::app_role[]));

DROP POLICY IF EXISTS suspensions_read_staff ON public.suspensions;
CREATE POLICY suspensions_read_staff ON public.suspensions FOR SELECT TO authenticated
  USING (public.has_any_role(auth.uid(),
    ARRAY['admin','manager','operator','support']::app_role[]));

DROP POLICY IF EXISTS suspensions_insert ON public.suspensions;
CREATE POLICY suspensions_insert ON public.suspensions FOR INSERT TO authenticated
  WITH CHECK (public.has_any_role(auth.uid(),
    ARRAY['admin','manager','operator','support']::app_role[]));

DROP POLICY IF EXISTS suspensions_update ON public.suspensions;
CREATE POLICY suspensions_update ON public.suspensions FOR UPDATE TO authenticated
  USING (public.has_any_role(auth.uid(),
    ARRAY['admin','manager','operator','support']::app_role[]));

-- 4) Audit log writer — allow Support & Finance too
CREATE OR REPLACE FUNCTION public.log_audit_event(
  _module text, _action text, _entity_id uuid DEFAULT NULL,
  _old_value jsonb DEFAULT NULL, _new_value jsonb DEFAULT NULL
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _id uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF NOT public.has_any_role(auth.uid(),
       ARRAY['admin','manager','operator','support','finance']::app_role[]) THEN
    RAISE EXCEPTION 'Insufficient privileges to write audit log';
  END IF;
  INSERT INTO public.audit_logs (user_id, module, action, entity_id, old_value, new_value)
  VALUES (auth.uid(), _module, _action, _entity_id, _old_value, _new_value)
  RETURNING id INTO _id;
  RETURN _id;
END $$;

-- 5) First signup becomes Super Admin
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE user_count INT;
BEGIN
  INSERT INTO public.profiles (id, full_name, email)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email), NEW.email);

  SELECT COUNT(*) INTO user_count FROM public.user_roles;
  IF user_count = 0 THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'super_admin');
  ELSE
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'viewer');
  END IF;
  RETURN NEW;
END $$;
