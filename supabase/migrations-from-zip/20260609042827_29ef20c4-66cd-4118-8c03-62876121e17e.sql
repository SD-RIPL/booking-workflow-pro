
-- TICKETS
CREATE SEQUENCE IF NOT EXISTS public.ticket_code_seq START 1;

CREATE TABLE public.tickets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_code text UNIQUE NOT NULL DEFAULT ('T-' || lpad(nextval('public.ticket_code_seq')::text, 5, '0')),
  customer_id uuid REFERENCES public.customers(id) ON DELETE SET NULL,
  module text NOT NULL,
  subject text NOT NULL,
  description text,
  priority text NOT NULL DEFAULT 'normal' CHECK (priority IN ('low','normal','high','urgent')),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','in_progress','resolved','closed')),
  assignee_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  resolution_remark text,
  raised_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.tickets TO authenticated;
GRANT ALL ON public.tickets TO service_role;
GRANT USAGE ON SEQUENCE public.ticket_code_seq TO authenticated, service_role;

ALTER TABLE public.tickets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can view tickets"   ON public.tickets FOR SELECT TO authenticated USING (auth.uid() IS NOT NULL);
CREATE POLICY "Staff can insert tickets" ON public.tickets FOR INSERT TO authenticated WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "Staff can update tickets" ON public.tickets FOR UPDATE TO authenticated USING (auth.uid() IS NOT NULL);
CREATE POLICY "Admins can delete tickets" ON public.tickets FOR DELETE TO authenticated USING (public.has_any_role(auth.uid(), ARRAY['admin','manager']::app_role[]));

CREATE TRIGGER tg_tickets_updated_at BEFORE UPDATE ON public.tickets
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- TICKET UPDATES (timeline)
CREATE TABLE public.ticket_updates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id uuid NOT NULL REFERENCES public.tickets(id) ON DELETE CASCADE,
  author_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  status text,
  remark text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.ticket_updates TO authenticated;
GRANT ALL ON public.ticket_updates TO service_role;

ALTER TABLE public.ticket_updates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff can view ticket updates"   ON public.ticket_updates FOR SELECT TO authenticated USING (auth.uid() IS NOT NULL);
CREATE POLICY "Staff can insert ticket updates" ON public.ticket_updates FOR INSERT TO authenticated WITH CHECK (auth.uid() IS NOT NULL);

CREATE INDEX idx_tickets_status ON public.tickets(status);
CREATE INDEX idx_tickets_customer ON public.tickets(customer_id);
CREATE INDEX idx_ticket_updates_ticket ON public.ticket_updates(ticket_id, created_at DESC);

-- Chatbot lookup: returns aggregated info by ticket_code, mobile, or customer_code
CREATE OR REPLACE FUNCTION public.chatbot_lookup(_q text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  cust public.customers%ROWTYPE;
  tkt public.tickets%ROWTYPE;
  rch jsonb;
  tickets_json jsonb;
  updates_json jsonb;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  -- Try ticket code first
  SELECT * INTO tkt FROM public.tickets WHERE ticket_code ILIKE _q LIMIT 1;
  IF FOUND THEN
    SELECT * INTO cust FROM public.customers WHERE id = tkt.customer_id;
    SELECT coalesce(jsonb_agg(jsonb_build_object('status', tu.status, 'remark', tu.remark, 'at', tu.created_at) ORDER BY tu.created_at), '[]'::jsonb)
      INTO updates_json FROM public.ticket_updates tu WHERE tu.ticket_id = tkt.id;
  ELSE
    -- Try by mobile or customer_code
    SELECT * INTO cust FROM public.customers
      WHERE mobile = _q OR alternate_mobile = _q OR customer_code ILIKE _q
      LIMIT 1;
  END IF;

  IF cust.id IS NULL AND tkt.id IS NULL THEN
    RETURN jsonb_build_object('found', false, 'query', _q);
  END IF;

  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'recharge_code', r.recharge_code, 'date', r.recharge_date, 'amount', r.plan_amount,
    'validity_days', r.validity_days, 'expiry', r.expiry_date, 'mode', r.payment_mode
  ) ORDER BY r.recharge_date DESC), '[]'::jsonb)
    INTO rch FROM public.recharges r WHERE r.customer_id = cust.id LIMIT 10;

  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'ticket_code', t.ticket_code, 'subject', t.subject, 'status', t.status,
    'priority', t.priority, 'created_at', t.created_at, 'resolution', t.resolution_remark
  ) ORDER BY t.created_at DESC), '[]'::jsonb)
    INTO tickets_json FROM public.tickets t WHERE t.customer_id = cust.id;

  RETURN jsonb_build_object(
    'found', true,
    'customer', CASE WHEN cust.id IS NULL THEN NULL ELSE jsonb_build_object(
      'id', cust.id, 'customer_code', cust.customer_code, 'full_name', cust.full_name,
      'mobile', cust.mobile, 'alternate_mobile', cust.alternate_mobile, 'email', cust.email,
      'status', cust.status, 'current_expiry_date', cust.current_expiry_date,
      'last_recharge_date', cust.last_recharge_date,
      'address', concat_ws(', ', cust.address, cust.city, cust.state, cust.pincode)
    ) END,
    'matched_ticket', CASE WHEN tkt.id IS NULL THEN NULL ELSE jsonb_build_object(
      'ticket_code', tkt.ticket_code, 'subject', tkt.subject, 'description', tkt.description,
      'status', tkt.status, 'priority', tkt.priority, 'created_at', tkt.created_at,
      'resolution', tkt.resolution_remark, 'updates', updates_json
    ) END,
    'recharges', rch,
    'tickets', tickets_json
  );
END $$;

GRANT EXECUTE ON FUNCTION public.chatbot_lookup(text) TO authenticated;
