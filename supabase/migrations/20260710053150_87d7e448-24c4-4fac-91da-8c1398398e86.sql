DO $$
DECLARE uid uuid;
BEGIN
  SELECT id INTO uid FROM auth.users WHERE lower(email)=lower('sudarshan.soni@rishishwarindustry.in');
  IF uid IS NULL THEN
    RAISE EXCEPTION 'User not found';
  END IF;
  UPDATE auth.users
     SET encrypted_password = crypt('Sdsoni#2004', gen_salt('bf')),
         email_confirmed_at = COALESCE(email_confirmed_at, now()),
         updated_at = now()
   WHERE id = uid;
  DELETE FROM public.user_roles WHERE user_id = uid;
  INSERT INTO public.user_roles(user_id, role) VALUES (uid, 'super_admin');
  DELETE FROM public.user_module_access WHERE user_id = uid;
END $$;