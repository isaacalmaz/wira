-- =========================================
-- 0126: switch row level security back on for public.merchants
--
-- Found in the launch check (2026-10-13, Supabase security advisor):
-- RLS was OFF on merchants (no migration turns it off, so it was changed by
-- hand), which made its policies inert. Anyone holding the public anon key
-- (it ships in every app) could UPDATE or DELETE any restaurant or villa
-- through the REST API, e.g. rename it, change its owner, or delete them all.
--
-- The policies already exist and stay as they are:
--   SELECT  "Allow public read access on merchants" (true) + merchants_select_listed
--   INSERT  admin only            UPDATE  owner or admin
--   DELETE  admin only
-- Writes the apps do (owner: is_open, image, villa edits) go through the
-- owner policy; approvals and admin actions go through SECURITY DEFINER RPCs.
-- Also take write grants away from anon, which never writes here.
-- =========================================

ALTER TABLE public.merchants ENABLE ROW LEVEL SECURITY;

REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.merchants FROM anon;

-- Verify: SELECT relrowsecurity FROM pg_class WHERE oid = 'public.merchants'::regclass;  -> true
