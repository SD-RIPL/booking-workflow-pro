
-- ============ Missing columns ============
ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS current_expiry_date date,
  ADD COLUMN IF NOT EXISTS address text;

ALTER TABLE public.recharges
  ADD COLUMN IF NOT EXISTS plan_amount numeric;

ALTER TABLE public.payments
  ADD COLUMN IF NOT EXISTS total_amount numeric;

ALTER TABLE public.sims
  ADD COLUMN IF NOT EXISTS company text;

-- ============ suspensions ============
CREATE TABLE IF NOT EXISTS public.suspensions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  suspended_at timestamptz NOT NULL DEFAULT now(),
  suspended_by uuid REFERENCES auth.users(id),
  reason text,
  resumed_at timestamptz,
  resumed_by uuid REFERENCES auth.users(id),
  resume_notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.suspensions TO authenticated;
GRANT ALL ON public.suspensions TO service_role;
ALTER TABLE public.suspensions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "suspensions_read_staff" ON public.suspensions FOR SELECT TO authenticated
  USING (public.is_staff(auth.uid()));
CREATE POLICY "suspensions_write_staff" ON public.suspensions FOR ALL TO authenticated
  USING (public.has_any_role(auth.uid(), ARRAY['super_admin','admin','ops_manager','operator']::public.app_role[]))
  WITH CHECK (public.has_any_role(auth.uid(), ARRAY['super_admin','admin','ops_manager','operator']::public.app_role[]));

-- ============ audit_logs ============
CREATE TABLE IF NOT EXISTS public.audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id),
  action text NOT NULL,
  module text NOT NULL,
  entity_id uuid,
  old_value jsonb,
  new_value jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.audit_logs TO authenticated;
GRANT ALL ON public.audit_logs TO service_role;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "audit_logs_read_admin" ON public.audit_logs FOR SELECT TO authenticated
  USING (public.has_any_role(auth.uid(), ARRAY['super_admin','admin','auditor']::public.app_role[]));

-- ============ user_module_access ============
CREATE TABLE IF NOT EXISTS public.user_module_access (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  module text NOT NULL,
  allowed boolean NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, module)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_module_access TO authenticated;
GRANT ALL ON public.user_module_access TO service_role;
ALTER TABLE public.user_module_access ENABLE ROW LEVEL SECURITY;
CREATE POLICY "uma_read_self_or_admin" ON public.user_module_access FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'super_admin'));
CREATE POLICY "uma_write_admin" ON public.user_module_access FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'));

-- ============ tickets ============
CREATE SEQUENCE IF NOT EXISTS public.ticket_code_seq;

CREATE TABLE IF NOT EXISTS public.tickets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_code text UNIQUE NOT NULL DEFAULT ('T-' || lpad(nextval('public.ticket_code_seq')::text, 5, '0')),
  customer_id uuid REFERENCES public.customers(id) ON DELETE SET NULL,
  module text NOT NULL,
  subject text NOT NULL,
  description text,
  priority text NOT NULL DEFAULT 'normal' CHECK (priority IN ('low','normal','high','urgent')),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','in_progress','resolved','closed')),
  assignee_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  resolution_remark text,
  raised_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tickets TO authenticated;
GRANT ALL ON public.tickets TO service_role;
ALTER TABLE public.tickets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tickets_read_staff" ON public.tickets FOR SELECT TO authenticated
  USING (public.is_staff(auth.uid()));
CREATE POLICY "tickets_write_staff" ON public.tickets FOR ALL TO authenticated
  USING (public.is_staff(auth.uid()))
  WITH CHECK (public.is_staff(auth.uid()));

CREATE TABLE IF NOT EXISTS public.ticket_updates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id uuid NOT NULL REFERENCES public.tickets(id) ON DELETE CASCADE,
  author_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  status text,
  remark text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ticket_updates TO authenticated;
GRANT ALL ON public.ticket_updates TO service_role;
ALTER TABLE public.ticket_updates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ticket_updates_read_staff" ON public.ticket_updates FOR SELECT TO authenticated
  USING (public.is_staff(auth.uid()));
CREATE POLICY "ticket_updates_write_staff" ON public.ticket_updates FOR ALL TO authenticated
  USING (public.is_staff(auth.uid()))
  WITH CHECK (public.is_staff(auth.uid()));

-- ============ Helper RPCs ============
CREATE OR REPLACE FUNCTION public.refresh_customer_statuses()
RETURNS integer
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.refresh_customer_status();
$$;

CREATE OR REPLACE FUNCTION public.log_audit_event(
  _module text,
  _action text,
  _entity_id uuid DEFAULT NULL,
  _old_value jsonb DEFAULT NULL,
  _new_value jsonb DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE _id uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  INSERT INTO public.audit_logs(user_id, module, action, entity_id, old_value, new_value)
  VALUES (auth.uid(), _module, _action, _entity_id, _old_value, _new_value)
  RETURNING id INTO _id;
  RETURN _id;
END; $$;

GRANT EXECUTE ON FUNCTION public.refresh_customer_statuses() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.log_audit_event(text, text, uuid, jsonb, jsonb) TO authenticated, service_role;

-- keep current_expiry_date in sync with expiry_date
CREATE OR REPLACE FUNCTION public.tg_sync_current_expiry()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.current_expiry_date := NEW.expiry_date; RETURN NEW; END; $$;
DROP TRIGGER IF EXISTS trg_sync_current_expiry ON public.customers;
CREATE TRIGGER trg_sync_current_expiry BEFORE INSERT OR UPDATE OF expiry_date ON public.customers
FOR EACH ROW EXECUTE FUNCTION public.tg_sync_current_expiry();

UPDATE public.customers SET current_expiry_date = expiry_date WHERE current_expiry_date IS NULL AND expiry_date IS NOT NULL;
