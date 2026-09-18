-- Add missing columns to promos if they don't exist
ALTER TABLE public.promos ADD COLUMN IF NOT EXISTS type TEXT DEFAULT 'Percentage';
ALTER TABLE public.promos ADD COLUMN IF NOT EXISTS discount NUMERIC DEFAULT 0;
ALTER TABLE public.promos ADD COLUMN IF NOT EXISTS "validUntil" DATE;
ALTER TABLE public.promos ADD COLUMN IF NOT EXISTS usage INTEGER DEFAULT 0;
ALTER TABLE public.promos ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'Active';

-- Update existing dummy promos to have some valid data
UPDATE public.promos SET type = 'Percentage', discount = 50, "validUntil" = '2027-12-31' WHERE code = 'RIDE50';
UPDATE public.promos SET type = 'Fixed', discount = 15000, "validUntil" = '2027-12-31' WHERE code = 'FOODFREE';
UPDATE public.promos SET type = 'Percentage', discount = 20, "validUntil" = '2027-12-31' WHERE code = 'VILLAKUTA';
