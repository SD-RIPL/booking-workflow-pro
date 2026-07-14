
-- 1. Create invitations table (was missing → InviteUserDialog throws "public.invitations not in schema cache")
CREATE TABLE IF NOT EXISTS public.invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
  role app_role NOT NULL DEFAULT 'support',
  module_overrides jsonb NOT NULL DEFAULT '[]'::jsonb,
  token text NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(24), 'hex'),
  note text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '14 days'),
  used_at timestamptz,
  used_by uuid,
  revoked_at timestamptz
);

CREATE INDEX IF NOT EXISTS invitations_email_idx ON public.invitations (lower(email));
CREATE INDEX IF NOT EXISTS invitations_token_idx ON public.invitations (token);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.invitations TO authenticated;
GRANT ALL ON public.invitations TO service_role;

ALTER TABLE public.invitations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "invitations_super_admin_all" ON public.invitations;
CREATE POLICY "invitations_super_admin_all"
  ON public.invitations FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'::app_role));

DROP TRIGGER IF EXISTS trg_invitations_updated ON public.invitations;
CREATE TRIGGER trg_invitations_updated
  BEFORE UPDATE ON public.invitations
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- 2. validate_invite (public lookup by token, used pre-login)
CREATE OR REPLACE FUNCTION public.validate_invite(_token text)
RETURNS TABLE(email text, role app_role, expires_at timestamptz, valid boolean, reason text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE inv public.invitations%ROWTYPE;
BEGIN
  SELECT * INTO inv FROM public.invitations WHERE token = _token;
  IF NOT FOUND THEN RETURN QUERY SELECT NULL::text, NULL::app_role, NULL::timestamptz, false, 'not_found'::text; RETURN; END IF;
  IF inv.revoked_at IS NOT NULL THEN RETURN QUERY SELECT inv.email, inv.role, inv.expires_at, false, 'revoked'::text; RETURN; END IF;
  IF inv.used_at IS NOT NULL THEN RETURN QUERY SELECT inv.email, inv.role, inv.expires_at, false, 'already_used'::text; RETURN; END IF;
  IF inv.expires_at < now() THEN RETURN QUERY SELECT inv.email, inv.role, inv.expires_at, false, 'expired'::text; RETURN; END IF;
  RETURN QUERY SELECT inv.email, inv.role, inv.expires_at, true, 'ok'::text;
END $$;

GRANT EXECUTE ON FUNCTION public.validate_invite(text) TO anon, authenticated;

-- 3. redeem_invite (called by newly signed-in user)
CREATE OR REPLACE FUNCTION public.redeem_invite(_token text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE inv public.invitations%ROWTYPE; user_email text; ov jsonb;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  SELECT * INTO inv FROM public.invitations WHERE token = _token FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Invite not found'; END IF;
  IF inv.revoked_at IS NOT NULL THEN RAISE EXCEPTION 'Invite revoked'; END IF;
  IF inv.used_at IS NOT NULL THEN RAISE EXCEPTION 'Invite already used'; END IF;
  IF inv.expires_at < now() THEN RAISE EXCEPTION 'Invite expired'; END IF;

  SELECT email INTO user_email FROM auth.users WHERE id = auth.uid();
  IF lower(user_email) <> lower(inv.email) THEN
    RAISE EXCEPTION 'Invite email does not match signed-in account';
  END IF;

  DELETE FROM public.user_roles WHERE user_id = auth.uid();
  INSERT INTO public.user_roles (user_id, role) VALUES (auth.uid(), inv.role);

  DELETE FROM public.user_module_access WHERE user_id = auth.uid();
  IF jsonb_typeof(inv.module_overrides) = 'array' THEN
    FOR ov IN SELECT * FROM jsonb_array_elements(inv.module_overrides) LOOP
      INSERT INTO public.user_module_access (user_id, module, allowed)
      VALUES (auth.uid(), ov->>'module', (ov->>'allowed')::boolean);
    END LOOP;
  END IF;

  UPDATE public.invitations SET used_at = now(), used_by = auth.uid() WHERE id = inv.id;
  RETURN jsonb_build_object('ok', true, 'role', inv.role);
END $$;

GRANT EXECUTE ON FUNCTION public.redeem_invite(text) TO authenticated;

-- 4. Bulk booking import RPC (admin-only) — takes array of row jsonb, inserts safely
CREATE OR REPLACE FUNCTION public.bulk_import_bookings(_rows jsonb)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  r jsonb; inserted int := 0; skipped int := 0; errors jsonb := '[]'::jsonb; idx int := 0;
BEGIN
  IF NOT public.has_any_role(auth.uid(), ARRAY['super_admin','admin','manager']::app_role[]) THEN
    RAISE EXCEPTION 'Only Admin/Manager may bulk import';
  END IF;
  IF jsonb_typeof(_rows) <> 'array' THEN RAISE EXCEPTION 'Expected an array of rows'; END IF;

  FOR r IN SELECT * FROM jsonb_array_elements(_rows) LOOP
    idx := idx + 1;
    BEGIN
      IF COALESCE(r->>'full_name','') = '' OR COALESCE(r->>'mobile','') = '' THEN
        skipped := skipped + 1;
        errors := errors || jsonb_build_array(jsonb_build_object('row', idx, 'error', 'full_name & mobile required'));
        CONTINUE;
      END IF;
      INSERT INTO public.bookings (
        full_name, father_name, mobile, alternate_mobile, email,
        address_line, address, city, district, state, pincode,
        source, sales_employee, booking_date, remarks, notes, created_by
      ) VALUES (
        r->>'full_name', r->>'father_name', r->>'mobile', r->>'alternate_mobile', r->>'email',
        r->>'address_line', COALESCE(r->>'address', r->>'address_line'), r->>'city', r->>'district', r->>'state', r->>'pincode',
        r->>'source', r->>'sales_employee',
        NULLIF(r->>'booking_date','')::date,
        r->>'remarks', r->>'notes', auth.uid()
      );
      inserted := inserted + 1;
    EXCEPTION WHEN OTHERS THEN
      skipped := skipped + 1;
      errors := errors || jsonb_build_array(jsonb_build_object('row', idx, 'error', SQLERRM));
    END;
  END LOOP;

  RETURN jsonb_build_object('inserted', inserted, 'skipped', skipped, 'errors', errors);
END $$;

GRANT EXECUTE ON FUNCTION public.bulk_import_bookings(jsonb) TO authenticated;
