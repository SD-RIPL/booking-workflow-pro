GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_any_role(uuid, public.app_role[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.validate_invite(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.redeem_invite(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.log_audit_event(text, text, uuid, jsonb, jsonb) TO authenticated;