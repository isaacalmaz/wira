-- =============================================================================
-- Migration 0016: vehicles pricing + admin write access
-- Date: 2026-09-15
-- =============================================================================
-- Context: public.vehicles already exists (0011) and already drives base
-- price/capacity/duration for frontend-user's RidePage.jsx, but:
--   1. It has no per_km_rate column — that rate is still a hardcoded literal
--      in RidePage.jsx (motor=3000, mobil=5000).
--   2. It only has a public SELECT policy (0011) — no admin INSERT/UPDATE/
--      DELETE policy exists at all, so there was never any way to manage
--      pricing without a direct DB edit.
-- This migration adds the missing column (backfilled to match today's
-- hardcoded rates, so live behavior doesn't change until an admin edits it)
-- and admin-scoped write policies, matching the pattern already used for
-- orders/merchants/topup_requests in SECURITY_FIXES_2026-09-15.sql.
-- =============================================================================

ALTER TABLE public.vehicles ADD COLUMN IF NOT EXISTS per_km_rate NUMERIC DEFAULT 0;

UPDATE public.vehicles SET per_km_rate = 3000 WHERE type = 'motor' AND (per_km_rate IS NULL OR per_km_rate = 0);
UPDATE public.vehicles SET per_km_rate = 5000 WHERE type = 'mobil' AND (per_km_rate IS NULL OR per_km_rate = 0);

DROP POLICY IF EXISTS "vehicles_insert_admin" ON public.vehicles;
CREATE POLICY "vehicles_insert_admin" ON public.vehicles
FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role IN ('admin', 'Superadmin', 'superadmin', 'Admin Ops'))
);

DROP POLICY IF EXISTS "vehicles_update_admin" ON public.vehicles;
CREATE POLICY "vehicles_update_admin" ON public.vehicles
FOR UPDATE USING (
    EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role IN ('admin', 'Superadmin', 'superadmin', 'Admin Ops'))
);

DROP POLICY IF EXISTS "vehicles_delete_admin" ON public.vehicles;
CREATE POLICY "vehicles_delete_admin" ON public.vehicles
FOR DELETE USING (
    EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role IN ('admin', 'Superadmin', 'superadmin', 'Admin Ops'))
);

-- Verification query:
-- SELECT type, price, per_km_rate, capacity, duration, is_active FROM public.vehicles;
