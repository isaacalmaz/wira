-- =============================================================================
-- Migration 0006: Disable RLS on users (MVP admin-portal workaround)
-- Source: fix_users_rls.sql (repo root)
-- Original creation date (git history, first commit): 2026-09-07
-- =============================================================================
-- Depends on public.users from 0001. Note this undoes/bypasses the RLS
-- policies set up in 0001 for the users table — intentional per the source
-- file's own comment ("MVP to allow Admin Portal to update it").
-- =============================================================================

-- Disable RLS on users table for MVP to allow Admin Portal to update it
ALTER TABLE public.users DISABLE ROW LEVEL SECURITY;
