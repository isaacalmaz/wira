-- =============================================================================
-- Migration 0004: Clean up stale feature_flags row + enable realtime
-- Source: fix_feature_flags_data.sql (repo root)
-- Original creation date (git history, first commit): 2026-09-07
-- =============================================================================
-- Depends on public.feature_flags from 0003.
-- =============================================================================

DELETE FROM public.feature_flags WHERE region = 'features_config';
ALTER PUBLICATION supabase_realtime ADD TABLE feature_flags;
