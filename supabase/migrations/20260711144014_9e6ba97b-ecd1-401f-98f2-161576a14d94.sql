
ALTER TABLE public.customers 
  ADD COLUMN IF NOT EXISTS ready_for_suspension BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS due_soon_flag BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS days_since_last_recharge INTEGER;

CREATE OR REPLACE FUNCTION public.refresh_customer_status()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE affected INTEGER;
BEGIN
  UPDATE public.customers
     SET remaining_days = COALESCE(expiry_date - CURRENT_DATE, 0),
         days_since_last_recharge = CASE WHEN last_recharge_date IS NOT NULL
             THEN (CURRENT_DATE - last_recharge_date) ELSE NULL END,
         due_soon_flag = CASE WHEN last_recharge_date IS NOT NULL
             AND (CURRENT_DATE - last_recharge_date) >= 25
             AND (CURRENT_DATE - last_recharge_date) < 30 THEN true ELSE false END,
         ready_for_suspension = CASE WHEN last_recharge_date IS NOT NULL
             AND (CURRENT_DATE - last_recharge_date) >= 30
             AND status NOT IN ('suspended','disconnected','blacklisted','returned') THEN true ELSE false END,
         status = CASE
           WHEN manual_suspend THEN status
           WHEN expiry_date IS NULL THEN status
           WHEN (expiry_date - CURRENT_DATE) <= 0 THEN 'expired'::public.customer_status
           WHEN (expiry_date - CURRENT_DATE) <= 5 THEN 'due_soon'::public.customer_status
           ELSE 'active'::public.customer_status
         END
   WHERE status NOT IN ('disconnected','blacklisted','returned');
  GET DIAGNOSTICS affected = ROW_COUNT;
  RETURN affected;
END; $function$;
