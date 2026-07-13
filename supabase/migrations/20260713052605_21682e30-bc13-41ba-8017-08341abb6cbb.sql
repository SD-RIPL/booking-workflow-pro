
-- 1) Profiles: allow self-insert + SECURITY DEFINER helper to backfill on sign-in
DROP POLICY IF EXISTS profiles_self_insert ON public.profiles;
CREATE POLICY profiles_self_insert ON public.profiles
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = id);

CREATE OR REPLACE FUNCTION public.ensure_profile(_full_name text DEFAULT NULL)
RETURNS public.profiles
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  uid uuid := auth.uid();
  em  text;
  rec public.profiles;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  SELECT email INTO em FROM auth.users WHERE id = uid;
  INSERT INTO public.profiles(id, email, full_name)
  VALUES (uid, em, NULLIF(_full_name,''))
  ON CONFLICT (id) DO UPDATE
    SET email = COALESCE(public.profiles.email, EXCLUDED.email),
        full_name = COALESCE(public.profiles.full_name, EXCLUDED.full_name)
  RETURNING * INTO rec;
  RETURN rec;
END $$;
GRANT EXECUTE ON FUNCTION public.ensure_profile(text) TO authenticated;

-- Backfill any auth users missing a profile row (safe, idempotent)
INSERT INTO public.profiles (id, email, full_name)
SELECT u.id, u.email, COALESCE(u.raw_user_meta_data->>'full_name', u.email)
FROM auth.users u
LEFT JOIN public.profiles p ON p.id = u.id
WHERE p.id IS NULL;

-- 2) Prevent double-assignment of a SIM / Router to more than one active customer
CREATE UNIQUE INDEX IF NOT EXISTS sims_one_active_customer
  ON public.sims(assigned_customer_id)
  WHERE assigned_customer_id IS NOT NULL AND deleted_at IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS routers_one_active_customer
  ON public.routers(assigned_customer_id)
  WHERE assigned_customer_id IS NOT NULL AND deleted_at IS NULL;

-- 3) Router return flow: router goes back to stock as refurbished, SIM is deactivated (NOT returned)
CREATE OR REPLACE FUNCTION public.return_router_and_deactivate_sim(
  _customer uuid,
  _reason   text DEFAULT NULL,
  _condition text DEFAULT 'refurbished'
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  r_id uuid; s_id uuid;
BEGIN
  IF NOT public.has_any_role(auth.uid(),
       ARRAY['super_admin','admin','manager','operator','support']::app_role[]) THEN
    RAISE EXCEPTION 'Not authorized to process returns';
  END IF;

  -- Router: back to stock, mark refurbished, keep history in notes
  UPDATE public.routers
     SET status = 'in_stock',
         condition = COALESCE(_condition,'refurbished'),
         return_date = CURRENT_DATE,
         assigned_customer_id = NULL,
         installation_date = NULL,
         notes = COALESCE(notes,'') ||
                 E'\n[' || to_char(now(),'YYYY-MM-DD') || '] Returned from customer' ||
                 CASE WHEN _reason IS NOT NULL THEN ' — ' || _reason ELSE '' END
   WHERE assigned_customer_id = _customer
   RETURNING id INTO r_id;

  -- SIM: deactivated (company does not take SIM back)
  UPDATE public.sims
     SET status = 'deactivated',
         assigned_customer_id = NULL,
         notes = COALESCE(notes,'') ||
                 E'\n[' || to_char(now(),'YYYY-MM-DD') || '] Deactivated on router return' ||
                 CASE WHEN _reason IS NOT NULL THEN ' — ' || _reason ELSE '' END
   WHERE assigned_customer_id = _customer
   RETURNING id INTO s_id;

  -- Customer status → returned (skip if already terminal)
  UPDATE public.customers
     SET status = 'returned', manual_suspend = true
   WHERE id = _customer
     AND status NOT IN ('blacklisted','disconnected');

  RETURN jsonb_build_object('router_id', r_id, 'sim_id', s_id);
END $$;
GRANT EXECUTE ON FUNCTION public.return_router_and_deactivate_sim(uuid,text,text) TO authenticated;

-- 4) Assignment helper used from booking Router-Config stage — atomic + guarded
CREATE OR REPLACE FUNCTION public.assign_sim_router_to_booking(
  _booking uuid, _sim uuid, _router uuid
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE cust uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  SELECT customer_id INTO cust FROM public.bookings WHERE id = _booking;

  -- SIM must be free
  UPDATE public.sims
     SET status = 'assigned', assigned_customer_id = cust, activation_date = COALESCE(activation_date, CURRENT_DATE)
   WHERE id = _sim AND assigned_customer_id IS NULL AND status = 'available';
  IF NOT FOUND THEN RAISE EXCEPTION 'Selected SIM is not available'; END IF;

  -- Router must be free
  UPDATE public.routers
     SET status = 'assigned', assigned_customer_id = cust, installation_date = COALESCE(installation_date, CURRENT_DATE)
   WHERE id = _router AND assigned_customer_id IS NULL AND status = 'in_stock';
  IF NOT FOUND THEN
    -- rollback sim if router assignment failed
    UPDATE public.sims SET status='available', assigned_customer_id=NULL WHERE id=_sim;
    RAISE EXCEPTION 'Selected Router is not in stock';
  END IF;

  UPDATE public.bookings SET sim_id = _sim, router_id = _router WHERE id = _booking;
END $$;
GRANT EXECUTE ON FUNCTION public.assign_sim_router_to_booking(uuid,uuid,uuid) TO authenticated;
