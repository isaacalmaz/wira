-- =============================================================================
-- Migration 0017: real pickup_lat/pickup_lng columns on orders
-- Date: 2026-09-15
-- =============================================================================
-- Context: Stage 1 of upgrading driver matching (see chat history). The
-- pickup coordinate was previously only ever written as JSON text inside the
-- `details` column - unusable for SQL/PostGIS filtering, indexing, or
-- joining. This adds real numeric columns and starts populating them from
-- frontend-user/src/pages/RidePage.jsx's ride-booking flow going forward.
-- Existing historical rows are left NULL (no reliable source to backfill
-- from - their coordinates are only recoverable by parsing each row's
-- `details` JSON by hand, out of scope for this migration).
--
-- No RLS policy changes needed - orders_select_own_or_relevant /
-- orders_insert_own / orders_update_mitra_or_admin (SECURITY_FIXES_2026-09-15.sql)
-- already govern the whole row regardless of which columns it has.
-- =============================================================================

ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS pickup_lat DOUBLE PRECISION;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS pickup_lng DOUBLE PRECISION;
