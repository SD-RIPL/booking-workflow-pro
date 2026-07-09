
ALTER TABLE public.tickets
  ADD COLUMN IF NOT EXISTS raised_by UUID REFERENCES auth.users(id);
ALTER TABLE public.tickets ALTER COLUMN subject SET NOT NULL;
ALTER TABLE public.tickets ALTER COLUMN module DROP NOT NULL;
ALTER TABLE public.tickets ALTER COLUMN priority DROP NOT NULL;

ALTER TABLE public.ticket_updates
  ADD COLUMN IF NOT EXISTS status TEXT,
  ADD COLUMN IF NOT EXISTS remark TEXT;
ALTER TABLE public.ticket_updates ALTER COLUMN message DROP NOT NULL;

NOTIFY pgrst, 'reload schema';
