
-- KYC
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS kyc_verification text;
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS kyc_mail_status text;
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS kyc_sent_date date;

-- Security Deposit
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS sd_amount numeric(10,2);
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS sd_status text DEFAULT 'not_received';
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS sd_received_date date;
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS sd_txn_id text;
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS sd_payment_received numeric(10,2);
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS sd_received_on public.booking_gateway;

-- Payment / COD
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS payment_mode text;
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS cod_delivery_charge numeric(10,2) DEFAULT 0;
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS cod_delivery_status text;
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS cod_delivery_txn_id text;
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS cod_delivery_received_date date;

-- Dispatch
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS dispatch_status text DEFAULT 'pending';
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS dispatched_at date;
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS router_company text;
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS router_model_no text;
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS sim_company text;
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS router_sim_no text;
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS router_sim_card_no text;
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS router_imei_mac text;
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS router_imei_wavlink text;
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS sim_activation_status text;

-- Activation
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS activation_date date;
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS activation_status text;
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS activation_notes text;

-- Refresh PostgREST schema cache
NOTIFY pgrst, 'reload schema';
