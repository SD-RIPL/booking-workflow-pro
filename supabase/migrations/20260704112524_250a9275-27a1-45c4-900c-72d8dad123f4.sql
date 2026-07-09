
ALTER TABLE public.recharges ADD COLUMN IF NOT EXISTS transaction_id text;
ALTER TABLE public.payments  ADD COLUMN IF NOT EXISTS mode text;
ALTER TABLE public.sims      ALTER COLUMN telecom DROP NOT NULL;

ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'manager';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'finance';
