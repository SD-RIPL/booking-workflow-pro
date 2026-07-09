
-- ============================================================
-- 1. Restrict SELECT on sensitive tables to staff roles
-- ============================================================

-- customers
DROP POLICY IF EXISTS "customers_read_all" ON public.customers;
CREATE POLICY "customers_read_staff" ON public.customers
  FOR SELECT TO authenticated
  USING (public.has_any_role(auth.uid(), ARRAY['admin'::app_role, 'manager'::app_role, 'operator'::app_role]));

-- payments
DROP POLICY IF EXISTS "payments_read_all" ON public.payments;
CREATE POLICY "payments_read_staff" ON public.payments
  FOR SELECT TO authenticated
  USING (public.has_any_role(auth.uid(), ARRAY['admin'::app_role, 'manager'::app_role, 'operator'::app_role]));

-- recharges
DROP POLICY IF EXISTS "recharges_read_all" ON public.recharges;
CREATE POLICY "recharges_read_staff" ON public.recharges
  FOR SELECT TO authenticated
  USING (public.has_any_role(auth.uid(), ARRAY['admin'::app_role, 'manager'::app_role, 'operator'::app_role]));

-- sims
DROP POLICY IF EXISTS "sims_read_all" ON public.sims;
CREATE POLICY "sims_read_staff" ON public.sims
  FOR SELECT TO authenticated
  USING (public.has_any_role(auth.uid(), ARRAY['admin'::app_role, 'manager'::app_role, 'operator'::app_role]));

-- routers
DROP POLICY IF EXISTS "routers_read_all" ON public.routers;
CREATE POLICY "routers_read_staff" ON public.routers
  FOR SELECT TO authenticated
  USING (public.has_any_role(auth.uid(), ARRAY['admin'::app_role, 'manager'::app_role, 'operator'::app_role]));

-- suspensions
DROP POLICY IF EXISTS "suspensions_read_all" ON public.suspensions;
CREATE POLICY "suspensions_read_staff" ON public.suspensions
  FOR SELECT TO authenticated
  USING (public.has_any_role(auth.uid(), ARRAY['admin'::app_role, 'manager'::app_role, 'operator'::app_role]));

-- ============================================================
-- 2. Profiles: own profile, admins/managers can read all
-- ============================================================
DROP POLICY IF EXISTS "profiles_read_all_auth" ON public.profiles;
CREATE POLICY "profiles_read_own_or_admin" ON public.profiles
  FOR SELECT TO authenticated
  USING (
    id = auth.uid()
    OR public.has_any_role(auth.uid(), ARRAY['admin'::app_role, 'manager'::app_role])
  );

-- ============================================================
-- 3. Audit logs: prevent arbitrary inserts. Only server-side
--    (service_role) or a SECURITY DEFINER function may write.
-- ============================================================
DROP POLICY IF EXISTS "audit_insert_any_auth" ON public.audit_logs;
-- No INSERT policy for authenticated => clients cannot insert directly.

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
DECLARE
  _id uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF NOT public.has_any_role(auth.uid(), ARRAY['admin'::app_role, 'manager'::app_role, 'operator'::app_role]) THEN
    RAISE EXCEPTION 'Insufficient privileges to write audit log';
  END IF;

  INSERT INTO public.audit_logs (user_id, module, action, entity_id, old_value, new_value)
  VALUES (auth.uid(), _module, _action, _entity_id, _old_value, _new_value)
  RETURNING id INTO _id;

  RETURN _id;
END;
$$;

REVOKE ALL ON FUNCTION public.log_audit_event(text, text, uuid, jsonb, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.log_audit_event(text, text, uuid, jsonb, jsonb) TO authenticated;

-- ============================================================
-- 4. Lock down SECURITY DEFINER helper functions
--    (RLS policies evaluate them regardless of EXECUTE grants)
-- ============================================================
REVOKE ALL ON FUNCTION public.has_role(uuid, app_role) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.has_any_role(uuid, app_role[]) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.refresh_customer_statuses() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.refresh_customer_statuses() TO service_role;
