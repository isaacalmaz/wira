-- =============================================================================
-- Migration 0044: Add public.drivers to the supabase_realtime publication
-- Original creation date: 2026-09-18
-- =============================================================================
-- frontend-user/src/pages/RidePage.jsx's live driver-tracking map subscribes
-- to postgres_changes on public.drivers to animate a driver's position in
-- real time. Every OTHER realtime-dependent table in this schema (orders -
-- 0001, messages - 0009/test_realtime.sql, feature_flags - 0004) has an
-- explicit ALTER PUBLICATION supabase_realtime ADD TABLE migration; grep
-- confirms no migration ever did this for drivers, so the map may be
-- receiving zero live events depending on whether someone added it by hand
-- via the Supabase dashboard (which wouldn't show up in migrations/ at all).
--
-- Could not be verified directly against the live DB before writing this:
-- confirming membership requires `SELECT tablename FROM
-- pg_publication_tables WHERE pubname = 'supabase_realtime'`, a system
-- catalog query that needs either a direct Postgres connection string (not
-- present anywhere in this repo's .env files) or a pre-existing
-- exec-arbitrary-SQL RPC (none exists in this schema - confirmed empirically:
-- calling rpc('exec_sql', ...) 404s, and migrations/README.md itself already
-- documents apply_sql.js, the one prior attempt at this, as an inert stub
-- that never executes DDL). The Supabase JS client (even with the
-- service-role key) only reaches tables/RPCs exposed via PostgREST, not
-- pg_catalog.
--
-- Written defensively so it's a no-op either way: ADD TABLE on a table
-- already in the publication raises `duplicate_object` (SQLSTATE 42710),
-- which this catches and ignores instead of failing the whole migration.
-- A human with Supabase SQL Editor access should run the SELECT above once
-- to confirm the end state either way (see migrations/README.md).
-- =============================================================================

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.drivers;
EXCEPTION WHEN duplicate_object THEN
  RAISE NOTICE 'public.drivers is already a member of supabase_realtime - skipping';
END $$;
