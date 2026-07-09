
-- ============================================================
-- Phase 2: Workflow engine + audit + cron
-- ============================================================

-- ---------- Stage advancement (no skipping) -----------------
CREATE OR REPLACE FUNCTION public.advance_booking_stage(
  p_booking_id uuid,
  p_target_stage public.booking_stage,
  p_remarks text DEFAULT NULL
) RETURNS public.bookings
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  b public.bookings;
  cur_order int;
  tgt_order int;
BEGIN
  IF NOT public.is_staff(auth.uid()) THEN
    RAISE EXCEPTION 'Not authorised';
  END IF;

  SELECT * INTO b FROM public.bookings WHERE id = p_booking_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Booking not found'; END IF;

  SELECT enumsortorder INTO cur_order FROM pg_enum
    WHERE enumtypid = 'public.booking_stage'::regtype AND enumlabel = b.current_stage::text;
  SELECT enumsortorder INTO tgt_order FROM pg_enum
    WHERE enumtypid = 'public.booking_stage'::regtype AND enumlabel = p_target_stage::text;

  -- allow terminal transitions to cancelled/rejected from anywhere
  IF p_target_stage IN ('cancelled','rejected') THEN
    NULL; -- ok
  ELSIF tgt_order <> cur_order + 1 THEN
    RAISE EXCEPTION 'Cannot skip stages: current=% target=%', b.current_stage, p_target_stage;
  END IF;

  UPDATE public.bookings
     SET current_stage = p_target_stage, updated_at = now()
   WHERE id = p_booking_id
   RETURNING * INTO b;

  INSERT INTO public.booking_stage_history(booking_id, from_stage, to_stage, remarks, performed_by)
  VALUES (p_booking_id, b.current_stage, p_target_stage, p_remarks, auth.uid());

  RETURN b;
END; $$;

REVOKE ALL ON FUNCTION public.advance_booking_stage(uuid, public.booking_stage, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.advance_booking_stage(uuid, public.booking_stage, text) TO authenticated;

-- ---------- Verify deposit + promote to customer -----------
CREATE OR REPLACE FUNCTION public.verify_deposit_and_promote(
  p_deposit_id uuid,
  p_remarks text DEFAULT NULL
) RETURNS public.customers
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  d public.security_deposits;
  b public.bookings;
  c public.customers;
BEGIN
  IF NOT public.has_any_role(auth.uid(), ARRAY['super_admin','admin','finance_manager']::public.app_role[]) THEN
    RAISE EXCEPTION 'Only Finance can verify deposits';
  END IF;

  SELECT * INTO d FROM public.security_deposits WHERE id = p_deposit_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Deposit not found'; END IF;
  IF d.status = 'verified' THEN RAISE EXCEPTION 'Already verified'; END IF;
  IF d.booking_id IS NULL THEN RAISE EXCEPTION 'Deposit has no booking linked'; END IF;

  SELECT * INTO b FROM public.bookings WHERE id = d.booking_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Booking not found for deposit'; END IF;

  -- create customer from booking if not already present
  IF b.customer_id IS NULL THEN
    INSERT INTO public.customers (
      booking_id, full_name, father_name, mobile, alternate_mobile, email,
      address_line, city, district, state, pincode, kyc_type, kyc_number,
      source, assigned_executive
    ) VALUES (
      b.id, b.full_name, b.father_name, b.mobile, b.alternate_mobile, b.email,
      b.address_line, b.city, b.district, b.state, b.pincode, b.kyc_type, b.kyc_number,
      b.source, b.assigned_executive
    ) RETURNING * INTO c;

    UPDATE public.bookings SET customer_id = c.id, updated_at = now() WHERE id = b.id;
  ELSE
    SELECT * INTO c FROM public.customers WHERE id = b.customer_id;
  END IF;

  UPDATE public.security_deposits
     SET status = 'verified', verified_by = auth.uid(), verified_at = now(),
         customer_id = c.id, remarks = COALESCE(p_remarks, remarks), updated_at = now()
   WHERE id = d.id;

  -- advance booking stage if currently at deposit_requested
  IF b.current_stage = 'deposit_requested' THEN
    UPDATE public.bookings SET current_stage = 'deposit_verified', updated_at = now() WHERE id = b.id;
    INSERT INTO public.booking_stage_history(booking_id, from_stage, to_stage, remarks, performed_by)
    VALUES (b.id, 'deposit_requested', 'deposit_verified', 'Auto: deposit verified', auth.uid());
  END IF;

  RETURN c;
END; $$;

REVOKE ALL ON FUNCTION public.verify_deposit_and_promote(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.verify_deposit_and_promote(uuid, text) TO authenticated;

-- ---------- Role management -----------
CREATE OR REPLACE FUNCTION public.grant_role_by_email(
  p_email text,
  p_role public.app_role
) RETURNS public.user_roles
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  target_id uuid;
  rec public.user_roles;
BEGIN
  IF NOT public.has_role(auth.uid(), 'super_admin') THEN
    RAISE EXCEPTION 'Only Super Admin may grant roles';
  END IF;

  SELECT id INTO target_id FROM public.profiles WHERE lower(email) = lower(p_email);
  IF target_id IS NULL THEN RAISE EXCEPTION 'No user with email %', p_email; END IF;

  INSERT INTO public.user_roles(user_id, role, granted_by)
  VALUES (target_id, p_role, auth.uid())
  ON CONFLICT (user_id, role) DO UPDATE SET granted_by = EXCLUDED.granted_by, granted_at = now()
  RETURNING * INTO rec;

  RETURN rec;
END; $$;

REVOKE ALL ON FUNCTION public.grant_role_by_email(text, public.app_role) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.grant_role_by_email(text, public.app_role) TO authenticated;

CREATE OR REPLACE FUNCTION public.revoke_role(p_user_id uuid, p_role public.app_role)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'super_admin') THEN
    RAISE EXCEPTION 'Only Super Admin may revoke roles';
  END IF;
  IF p_user_id = auth.uid() AND p_role = 'super_admin' THEN
    RAISE EXCEPTION 'Refusing to revoke your own super_admin role';
  END IF;
  DELETE FROM public.user_roles WHERE user_id = p_user_id AND role = p_role;
  RETURN FOUND;
END; $$;

REVOKE ALL ON FUNCTION public.revoke_role(uuid, public.app_role) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.revoke_role(uuid, public.app_role) TO authenticated;

-- ---------- Generic audit trigger -----------
CREATE OR REPLACE FUNCTION public.tg_write_audit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  eid text;
  aemail text;
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

-- Attach to core tables
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['bookings','security_deposits','customers','recharges','payments','sims','routers','recharge_plans','user_roles'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_audit_%1$s ON public.%1$s;', t);
    EXECUTE format('CREATE TRIGGER trg_audit_%1$s AFTER INSERT OR UPDATE OR DELETE ON public.%1$s FOR EACH ROW EXECUTE FUNCTION public.tg_write_audit();', t);
  END LOOP;
END; $$;

-- ---------- Add security_deposits.customer_id if missing (safety) ----------
-- (already exists per schema, but ensure)
-- ---------- Daily cron: refresh status ----------
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- unschedule if exists (ignore errors)
DO $$
BEGIN
  PERFORM cron.unschedule('rishishwar-refresh-customer-status');
EXCEPTION WHEN OTHERS THEN NULL;
END; $$;

SELECT cron.schedule(
  'rishishwar-refresh-customer-status',
  '0 1 * * *',
  $$SELECT public.refresh_customer_status();$$
);
