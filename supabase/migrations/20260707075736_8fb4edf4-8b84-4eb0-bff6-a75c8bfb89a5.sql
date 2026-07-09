
CREATE OR REPLACE FUNCTION public.bookings_enforce_sequential_workflow()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE
  kyc_ok        boolean;
  kyc_mail_ok   boolean;
  sd_ok         boolean;
  payment_ok    boolean;
  dispatch_ok   boolean;
  activation_ok boolean;
BEGIN
  -- Compute prerequisite completion from NEW row (final state after update)
  kyc_ok        := NEW.kyc_verification = 'approved';
  kyc_mail_ok   := kyc_ok AND NEW.kyc_mail_status = 'sent';
  sd_ok         := kyc_mail_ok AND NEW.sd_status = 'received';
  payment_ok    := sd_ok AND (
                    NEW.payment_mode = 'prepaid'
                    OR (NEW.payment_mode = 'cod' AND NEW.cod_delivery_status = 'received')
                  );
  dispatch_ok   := payment_ok AND NEW.dispatch_status = 'delivered';
  activation_ok := dispatch_ok AND NEW.activation_status = 'active';

  -- Once cancelled, block all further edits (except un-cancel by super_admin via service role)
  IF TG_OP = 'UPDATE' AND OLD.current_stage = 'cancelled' AND NEW.current_stage = 'cancelled' THEN
    -- allow no-op / metadata identical update? Simpler: block any change.
    IF row(NEW.*) IS DISTINCT FROM row(OLD.*) THEN
      RAISE EXCEPTION 'Booking is cancelled and cannot be modified.'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  -- Stage 2: KYC mail requires KYC approved
  IF NEW.kyc_mail_status = 'sent' AND NOT kyc_ok THEN
    RAISE EXCEPTION 'Cannot mark KYC mail as sent before KYC Verification is approved.'
      USING ERRCODE = 'check_violation';
  END IF;

  -- Stage 3: Security Deposit received requires KYC mail sent
  IF NEW.sd_status IN ('received') AND NOT kyc_mail_ok THEN
    RAISE EXCEPTION 'Cannot receive Security Deposit before KYC mail is sent.'
      USING ERRCODE = 'check_violation';
  END IF;

  -- Stage 4: Payment mode requires SD received
  IF NEW.payment_mode IS NOT NULL AND NOT sd_ok THEN
    RAISE EXCEPTION 'Cannot set Payment Mode before Security Deposit is received.'
      USING ERRCODE = 'check_violation';
  END IF;

  -- COD delivery received requires SD received AND payment_mode = cod
  IF NEW.cod_delivery_status = 'received' AND (NOT sd_ok OR NEW.payment_mode <> 'cod') THEN
    RAISE EXCEPTION 'Cannot mark COD delivery received without SD received and COD payment mode.'
      USING ERRCODE = 'check_violation';
  END IF;

  -- Stage 5: Dispatch requires payment stage complete
  IF NEW.dispatch_status IN ('dispatched','delivered') AND NOT payment_ok THEN
    RAISE EXCEPTION 'Cannot dispatch before Payment stage is complete.'
      USING ERRCODE = 'check_violation';
  END IF;

  -- Router/SIM details only after payment ok
  IF (NEW.router_company IS DISTINCT FROM COALESCE(OLD.router_company, NULL)
      OR NEW.router_model_no IS DISTINCT FROM COALESCE(OLD.router_model_no, NULL)
      OR NEW.router_sim_no IS DISTINCT FROM COALESCE(OLD.router_sim_no, NULL))
     AND NEW.router_company IS NOT NULL AND NOT payment_ok THEN
    RAISE EXCEPTION 'Cannot assign router/SIM before Payment stage is complete.'
      USING ERRCODE = 'check_violation';
  END IF;

  -- Stage 6: Activation requires dispatch delivered
  IF NEW.activation_status = 'active' AND NOT dispatch_ok THEN
    RAISE EXCEPTION 'Cannot activate before Dispatch is delivered.'
      USING ERRCODE = 'check_violation';
  END IF;

  -- Stage 7: Customer link requires activation
  IF NEW.customer_id IS NOT NULL
     AND (OLD IS NULL OR OLD.customer_id IS DISTINCT FROM NEW.customer_id)
     AND NOT activation_ok THEN
    RAISE EXCEPTION 'Cannot link Customer before Activation is complete.'
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS bookings_enforce_sequential_workflow_trg ON public.bookings;
CREATE TRIGGER bookings_enforce_sequential_workflow_trg
BEFORE INSERT OR UPDATE ON public.bookings
FOR EACH ROW EXECUTE FUNCTION public.bookings_enforce_sequential_workflow();
