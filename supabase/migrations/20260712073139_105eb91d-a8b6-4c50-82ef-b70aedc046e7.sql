
-- Soft-delete columns on major tables
DO $$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY['customers','bookings','recharges','payments','tickets','sims','routers','suspensions'] LOOP
    EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS deleted_at timestamptz', t);
    EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS deleted_by uuid REFERENCES auth.users(id)', t);
    EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%I_deleted_at ON public.%I(deleted_at)', t, t);
  END LOOP;
END $$;

-- Notifications outbox
CREATE TABLE IF NOT EXISTS public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid REFERENCES public.customers(id) ON DELETE SET NULL,
  channel text NOT NULL CHECK (channel IN ('sms','whatsapp')),
  template text NOT NULL,
  phone text NOT NULL,
  message text NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','sent','failed')),
  provider_sid text,
  error text,
  sent_at timestamptz,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.notifications TO authenticated;
GRANT ALL ON public.notifications TO service_role;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "notif_staff_read" ON public.notifications;
CREATE POLICY "notif_staff_read" ON public.notifications FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));
DROP POLICY IF EXISTS "notif_staff_write" ON public.notifications;
CREATE POLICY "notif_staff_write" ON public.notifications FOR ALL TO authenticated
  USING (public.has_any_role(auth.uid(), ARRAY['super_admin','admin','ops_manager','operator']::app_role[]))
  WITH CHECK (public.has_any_role(auth.uid(), ARRAY['super_admin','admin','ops_manager','operator']::app_role[]));

CREATE INDEX IF NOT EXISTS idx_notif_status ON public.notifications(status);
CREATE INDEX IF NOT EXISTS idx_notif_customer ON public.notifications(customer_id);

-- Trigger: auto-insert open suspension when ready_for_suspension flips true
CREATE OR REPLACE FUNCTION public.tg_auto_suspension()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF NEW.ready_for_suspension = true
     AND (OLD.ready_for_suspension IS DISTINCT FROM true)
     AND NOT EXISTS (
       SELECT 1 FROM public.suspensions
       WHERE customer_id = NEW.id AND resumed_at IS NULL AND deleted_at IS NULL
     )
  THEN
    INSERT INTO public.suspensions(customer_id, reason)
    VALUES (NEW.id, 'Auto: 30+ days since last recharge');
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_auto_suspension ON public.customers;
CREATE TRIGGER trg_auto_suspension AFTER UPDATE OF ready_for_suspension ON public.customers
  FOR EACH ROW EXECUTE FUNCTION public.tg_auto_suspension();

-- Soft delete / restore / purge helpers (admin only)
CREATE OR REPLACE FUNCTION public.soft_delete_row(_table text, _id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF NOT public.has_any_role(auth.uid(), ARRAY['super_admin','admin']::app_role[]) THEN
    RAISE EXCEPTION 'Only Admin may delete';
  END IF;
  IF _table NOT IN ('customers','bookings','recharges','payments','tickets','sims','routers','suspensions') THEN
    RAISE EXCEPTION 'Invalid table %', _table;
  END IF;
  EXECUTE format('UPDATE public.%I SET deleted_at = now(), deleted_by = auth.uid() WHERE id = $1 AND deleted_at IS NULL', _table) USING _id;
  RETURN FOUND;
END; $$;

CREATE OR REPLACE FUNCTION public.restore_row(_table text, _id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF NOT public.has_any_role(auth.uid(), ARRAY['super_admin','admin']::app_role[]) THEN
    RAISE EXCEPTION 'Only Admin may restore';
  END IF;
  IF _table NOT IN ('customers','bookings','recharges','payments','tickets','sims','routers','suspensions') THEN
    RAISE EXCEPTION 'Invalid table %', _table;
  END IF;
  EXECUTE format('UPDATE public.%I SET deleted_at = NULL, deleted_by = NULL WHERE id = $1', _table) USING _id;
  RETURN FOUND;
END; $$;

CREATE OR REPLACE FUNCTION public.purge_row(_table text, _id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF NOT public.has_role(auth.uid(),'super_admin') THEN
    RAISE EXCEPTION 'Only Super Admin may permanently delete';
  END IF;
  IF _table NOT IN ('customers','bookings','recharges','payments','tickets','sims','routers','suspensions') THEN
    RAISE EXCEPTION 'Invalid table %', _table;
  END IF;
  EXECUTE format('DELETE FROM public.%I WHERE id = $1', _table) USING _id;
  RETURN FOUND;
END; $$;

GRANT EXECUTE ON FUNCTION public.soft_delete_row(text,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.restore_row(text,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.purge_row(text,uuid) TO authenticated;

-- Ensure cron job for daily status refresh (2 AM)
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname='pg_cron') THEN
    PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname='daily_customer_status_refresh';
    PERFORM cron.schedule('daily_customer_status_refresh','0 2 * * *',
      $c$SELECT public.refresh_customer_status();$c$);
  END IF;
END $$;
