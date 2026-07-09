
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'manager';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'finance';

ALTER TABLE public.tickets
  ADD COLUMN IF NOT EXISTS module TEXT,
  ADD COLUMN IF NOT EXISTS resolved_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS resolution_remark TEXT;

ALTER TABLE public.ticket_updates
  ADD COLUMN IF NOT EXISTS author_id UUID REFERENCES auth.users(id);

NOTIFY pgrst, 'reload schema';
