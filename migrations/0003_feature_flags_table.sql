-- =============================================================================
-- Migration 0003: Create feature_flags table + RLS
-- Source: fix_feature_flags_rls.sql (repo root)
-- Original creation date (git history, first commit): 2026-09-07
-- =============================================================================
-- Despite the "fix_" name, this file is the actual origin of the
-- public.feature_flags table on the live database (region TEXT primary key).
-- This does NOT match the feature_flags table shape in backend/database/schema.sql
-- (which uses a UUID id primary key + separate region column) — that file is
-- stale/fictional per the project's own background notes and was not used here.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.feature_flags (
  region TEXT PRIMARY KEY,
  features JSONB NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.feature_flags ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow public full access on feature_flags" ON public.feature_flags;
CREATE POLICY "Allow public full access on feature_flags" ON public.feature_flags FOR ALL USING (true) WITH CHECK (true);
