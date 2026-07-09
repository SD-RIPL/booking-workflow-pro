
ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS aadhaar_no text,
  ADD COLUMN IF NOT EXISTS address text,
  ADD COLUMN IF NOT EXISTS booking_amount numeric,
  ADD COLUMN IF NOT EXISTS booking_gst numeric,
  ADD COLUMN IF NOT EXISTS booking_txn_id text,
  ADD COLUMN IF NOT EXISTS booking_date date,
  ADD COLUMN IF NOT EXISTS sales_employee text,
  ADD COLUMN IF NOT EXISTS company_account text,
  ADD COLUMN IF NOT EXISTS notes text;
