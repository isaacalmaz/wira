-- Migration 0140: add phone column to saved_addresses
-- Allows customers to store a contact phone number with their saved address,
-- useful for package delivery recipient/sender contact in WiraSend or courier calls.
--
-- Nullable, no default, no RLS change: the existing 0038 policy ("Users can
-- manage their own saved addresses", FOR ALL on user_id = auth.uid())
-- already covers the new column. Re-runnable.

ALTER TABLE public.saved_addresses
    ADD COLUMN IF NOT EXISTS phone TEXT;

COMMENT ON COLUMN public.saved_addresses.phone IS
    'Optional contact phone number associated with this saved address (e.g. sender or recipient mobile number).';
