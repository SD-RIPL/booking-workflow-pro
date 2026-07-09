
UPDATE auth.users 
SET encrypted_password = crypt('123321@2003', gen_salt('bf')),
    email_confirmed_at = COALESCE(email_confirmed_at, now()),
    updated_at = now()
WHERE email = 'sudarshan.soni.9140@gmail.com';

DELETE FROM public.user_roles WHERE user_id = '0dbc8890-0390-40bc-8c57-b025b9661cbd';
INSERT INTO public.user_roles (user_id, role) VALUES ('0dbc8890-0390-40bc-8c57-b025b9661cbd', 'super_admin');
DELETE FROM public.user_module_access WHERE user_id = '0dbc8890-0390-40bc-8c57-b025b9661cbd';
