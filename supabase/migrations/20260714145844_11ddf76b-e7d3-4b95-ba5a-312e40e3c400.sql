
-- 1. Tighten profiles SELECT — users see own row; admins/super_admins see all
DROP POLICY IF EXISTS "profiles_read_all_authed" ON public.profiles;

CREATE POLICY "profiles_read_own"
  ON public.profiles FOR SELECT
  TO authenticated
  USING (
    auth.uid() = id
    OR public.has_any_role(auth.uid(), ARRAY['super_admin','admin']::app_role[])
  );

-- 2. Explicit DELETE policies — admin-only — for sensitive tables
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'customers','bookings','recharges','payments','security_deposits',
    'tickets','ticket_updates','sims','routers','suspensions',
    'notifications','booking_stage_history','invitations'
  ] LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_delete_admin', t);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR DELETE TO authenticated USING (public.has_any_role(auth.uid(), ARRAY[''super_admin'',''admin'']::app_role[]))',
      t || '_delete_admin', t
    );
  END LOOP;
END $$;
