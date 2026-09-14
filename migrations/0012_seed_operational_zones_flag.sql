-- =============================================================================
-- Migration 0012: Seed operational_zones data into feature_flags + RLS update policy
-- Source: seed_operational_zones.sql (repo root)
-- Original creation date (git history, first commit): 2026-09-12
--   (file mtime 2026-09-11 13:18, ahead of setup_geofencing.sql's 13:59 the
--   same day — this file's data is consumed/migrated out by 0013.)
-- =============================================================================
-- Depends on public.feature_flags from 0003.
--
-- WARNING — LIKELY BROKEN AS WRITTEN: this INSERT references a column
-- `is_active` on feature_flags, but the feature_flags table as actually
-- created (migration 0003 / fix_feature_flags_rls.sql) only has columns
-- (region, features, updated_at) — there is no is_active column anywhere
-- in this repo's schema-altering SQL. Running this verbatim against the
-- table from 0003 will error with "column is_active does not exist". It is
-- preserved verbatim per the task's instructions; a human should verify
-- against the live DB whether feature_flags actually has an is_active
-- column (added out-of-band, e.g. via the Supabase Table Editor GUI) before
-- replaying this on a fresh database.
-- =============================================================================

-- 1. Insert seed data for operational_zones
INSERT INTO feature_flags (region, is_active, features)
VALUES (
    'operational_zones',
    true,
    '[
        {
            "id": "mataram",
            "name": "Kota Mataram & Ampenan",
            "status_text": "Zona Inti",
            "services": { "ride": true, "food": true, "send": true, "villa": false, "service": true }
        },
        {
            "id": "senggigi",
            "name": "Senggigi",
            "status_text": "Zona Wisata",
            "services": { "ride": true, "food": true, "send": true, "villa": true, "service": true }
        },
        {
            "id": "kuta",
            "name": "Kuta Mandalika",
            "status_text": "Zona Wisata",
            "services": { "ride": true, "food": true, "send": true, "villa": true, "service": true }
        },
        {
            "id": "gili",
            "name": "Gili Trawangan, Meno, Air",
            "status_text": "Zona Bebas Kendaraan",
            "services": { "ride": false, "food": true, "send": true, "villa": true, "service": false }
        },
        {
            "id": "rinjani",
            "name": "Sembalun & Senaru (Rinjani)",
            "status_text": "Zona Pegunungan",
            "services": { "ride": false, "food": true, "send": false, "villa": true, "service": false }
        }
    ]'::jsonb
)
ON CONFLICT (region)
DO UPDATE SET
    is_active = EXCLUDED.is_active,
    features = EXCLUDED.features;


-- 2. Ensure RLS is enabled
ALTER TABLE feature_flags ENABLE ROW LEVEL SECURITY;

-- 3. Create RLS Policy to allow UPDATE operations for Admins
-- Note: Assuming the dashboard uses the 'authenticated' role. You may want to restrict this further
-- using a custom function like `is_admin(auth.uid())` depending on your specific auth setup.
DROP POLICY IF EXISTS "Allow updates on feature_flags" ON feature_flags;

CREATE POLICY "Allow updates on feature_flags"
ON feature_flags
FOR UPDATE
TO authenticated
USING (true)
WITH CHECK (true);
