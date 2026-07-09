-- Fix advance_booking_stage: from_stage was being recorded as the new value
-- because UPDATE...RETURNING overwrites the record before the history INSERT.
CREATE OR REPLACE FUNCTION public.advance_booking_stage(p_booking_id uuid, p_target_stage booking_stage, p_remarks text DEFAULT NULL::text)
 RETURNS bookings
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  b public.bookings;
  prev_stage public.booking_stage;
  cur_order int;
  tgt_order int;
BEGIN
  IF NOT public.is_staff(auth.uid()) THEN
    RAISE EXCEPTION 'Not authorised';
  END IF;

  SELECT * INTO b FROM public.bookings WHERE id = p_booking_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Booking not found'; END IF;

  prev_stage := b.current_stage;

  SELECT enumsortorder INTO cur_order FROM pg_enum
    WHERE enumtypid = 'public.booking_stage'::regtype AND enumlabel = prev_stage::text;
  SELECT enumsortorder INTO tgt_order FROM pg_enum
    WHERE enumtypid = 'public.booking_stage'::regtype AND enumlabel = p_target_stage::text;

  IF p_target_stage IN ('cancelled','rejected') THEN
    NULL;
  ELSIF tgt_order <> cur_order + 1 THEN
    RAISE EXCEPTION 'Cannot skip stages: current=% target=%', prev_stage, p_target_stage;
  END IF;

  UPDATE public.bookings
     SET current_stage = p_target_stage, updated_at = now()
   WHERE id = p_booking_id
   RETURNING * INTO b;

  INSERT INTO public.booking_stage_history(booking_id, from_stage, to_stage, remarks, performed_by)
  VALUES (p_booking_id, prev_stage, p_target_stage, p_remarks, auth.uid());

  RETURN b;
END; $function$;