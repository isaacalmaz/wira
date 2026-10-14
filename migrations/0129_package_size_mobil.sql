-- =========================================
-- Migration 0129: allow package_size 'mobil' (big items, 0128)
-- =========================================
-- 0128 stores a WiraSend "Barang besar (mobil)" order with package_size
-- 'mobil' so only car drivers see it, but orders_package_size_check still
-- only allowed dokumen/kecil/sedang/besar, so every big-item booking failed
-- (found in the live check right after 0128). Same list plus 'mobil'.
-- Apply BEFORE merging the 0128 frontend.
-- =========================================
ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS orders_package_size_check;
ALTER TABLE public.orders ADD CONSTRAINT orders_package_size_check
    CHECK (package_size IS NULL OR package_size = ANY (ARRAY['dokumen', 'kecil', 'sedang', 'besar', 'mobil']));

-- Verify after applying:
--   SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conname = 'orders_package_size_check';  -> includes 'mobil'
