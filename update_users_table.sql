ALTER TABLE public.users ADD COLUMN IF NOT EXISTS vehicle_type TEXT;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS plate_number TEXT;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS specialization TEXT;
