
ALTER TABLE public.recharges ALTER COLUMN amount DROP NOT NULL;
ALTER TABLE public.recharges ALTER COLUMN plan_name DROP NOT NULL;
ALTER TABLE public.payments  ALTER COLUMN payment_mode DROP NOT NULL;
