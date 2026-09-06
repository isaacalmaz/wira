-- 1. Tambahkan kolom mitra_access
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS mitra_access JSONB DEFAULT '[]'::jsonb;

-- 2. Migrasi data lama ke kolom baru
UPDATE public.users SET mitra_access = '["driver"]'::jsonb WHERE role = 'driver';
UPDATE public.users SET mitra_access = '["merchant"]'::jsonb WHERE role = 'merchant';
UPDATE public.users SET mitra_access = '["technician"]'::jsonb WHERE role = 'technician';

-- 3. (Opsional) Jika owner_id di tabel merchants ditemukan, pastikan mereka punya akses merchant
UPDATE public.users 
SET mitra_access = mitra_access || '["merchant"]'::jsonb
WHERE id IN (SELECT owner_id FROM public.merchants WHERE owner_id IS NOT NULL)
AND NOT mitra_access ? 'merchant';

