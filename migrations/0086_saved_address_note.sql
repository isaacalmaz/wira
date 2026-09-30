-- Migration 0086: a free-text note on saved addresses ("pagar hijau, depan
-- masjid") so a customer can store the landmark that helps a driver or
-- courier find them. Requested in the owner's issue list (2026-09-30).
--
-- Nullable, no default, no RLS change: the existing 0038 policy ("Users can
-- manage their own saved addresses", FOR ALL on user_id = auth.uid())
-- already covers the new column. Re-runnable.

ALTER TABLE public.saved_addresses
    ADD COLUMN IF NOT EXISTS note TEXT;

COMMENT ON COLUMN public.saved_addresses.note IS
    'Optional landmark/description shown with the address (e.g. "pagar hijau, depan masjid").';
