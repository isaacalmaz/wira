-- =============================================================================
-- Migration 0002: Widen merchants RLS to full public access
-- Source: fix_merchants_rls.sql (repo root)
-- Original creation date (git history, first commit): 2026-09-07
-- =============================================================================
-- Replaces the SELECT-only policy created in 0001 with an ALL (read+write)
-- public policy. Depends on public.merchants from 0001.
-- =============================================================================

DROP POLICY IF EXISTS "Allow public full access on merchants" ON public.merchants;
CREATE POLICY "Allow public full access on merchants" ON public.merchants FOR ALL USING (true) WITH CHECK (true);
