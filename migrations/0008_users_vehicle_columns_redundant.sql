-- =============================================================================
-- Migration 0008: Add vehicle_type/plate_number/specialization to users
-- Source: update_users_table.sql (repo root)
-- Original creation date (git history, first commit): 2026-09-08
-- =============================================================================
-- REDUNDANT: these exact three ALTER TABLE ... ADD COLUMN IF NOT EXISTS
-- statements are already present at the end of 0001 (master_schema.sql).
-- Harmless to replay (IF NOT EXISTS makes it a no-op), kept here only for
-- historical fidelity to the original file-by-file execution.
-- =============================================================================

ALTER TABLE public.users ADD COLUMN IF NOT EXISTS vehicle_type TEXT;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS plate_number TEXT;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS specialization TEXT;
