
-- 1. invitations table
CREATE TABLE public.invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
  role app_role NOT NULL DEFAULT 'viewer',
  module_overrides jsonb NOT NULL DEFAULT '[]'::jsonb,
  token text NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(24), 'hex'),
  note text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '14 days'),
  used_at timestamptz,
  used_by uuid,
  revoked_at timestamptz
);

CREATE INDEX invitations_email_idx ON public.invitations (lower(email));
CREATE INDEX invitations_token_idx ON public.invitations (token);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.invitations TO authenticated;
GRANT ALL ON public.invitations TO service_role;

ALTER TABLE public.invitations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "invitations_super_admin_all"
  ON public.invitations FOR ALL
  TO authenticated
  USING (has_role(auth.uid(), 'super_admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'super_admin'::app_role));

CREATE TRIGGER trg_invitations_updated
  BEFORE UPDATE ON public.invitations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2. validate_invite: public lookup by token (used on the auth page before login)
CREATE OR REPLACE FUNCTION public.validate_invite(_token text)
RETURNS TABLE(email text, role app_role, expires_at timestamptz, valid boolean, reason text)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE inv public.invitations%ROWTYPE;
BEGIN
  SELECT * INTO inv FROM public.invitations WHERE token = _token;
  IF NOT FOUND THEN
    RETURN QUERY SELECT NULL::text, NULL::app_role, NULL::timestamptz, false, 'not_found'::text;
    RETURN;
  END IF;
  IF inv.revoked_at IS NOT NULL THEN
    RETURN QUERY SELECT inv.email, inv.role, inv.expires_at, false, 'revoked'::text; RETURN;
  END IF;
  IF inv.used_at IS NOT NULL THEN
    RETURN QUERY SELECT inv.email, inv.role, inv.expires_at, false, 'already_used'::text; RETURN;
  END IF;
  IF inv.expires_at < now() THEN
    RETURN QUERY SELECT inv.email, inv.role, inv.expires_at, false, 'expired'::text; RETURN;
  END IF;
  RETURN QUERY SELECT inv.email, inv.role, inv.expires_at, true, 'ok'::text;
END $$;

GRANT EXECUTE ON FUNCTION public.validate_invite(text) TO anon, authenticated;

-- 3. redeem_invite: called by the newly signed-in user; assigns role + overrides
CREATE OR REPLACE FUNCTION public.redeem_invite(_token text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  inv public.invitations%ROWTYPE;
  user_email text;
  ov jsonb;
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

  -- replace roles with invited role
  DELETE FROM public.user_roles WHERE user_id = auth.uid();
  INSERT INTO public.user_roles (user_id, role) VALUES (auth.uid(), inv.role);

  -- apply module overrides
  DELETE FROM public.user_module_access WHERE user_id = auth.uid();
  IF jsonb_typeof(inv.module_overrides) = 'array' THEN
    FOR ov IN SELECT * FROM jsonb_array_elements(inv.module_overrides) LOOP
      INSERT INTO public.user_module_access (user_id, module, allowed)
      VALUES (auth.uid(), ov->>'module', (ov->>'allowed')::boolean);
    END LOOP;
  END IF;

  UPDATE public.invitations
    SET used_at = now(), used_by = auth.uid()
    WHERE id = inv.id;

  RETURN jsonb_build_object('ok', true, 'role', inv.role);
END $$;

GRANT EXECUTE ON FUNCTION public.redeem_invite(text) TO authenticated;
