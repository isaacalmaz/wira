-- =============================================================================
-- Migration 0013b: public.drivers table (reconstructed from live schema)
-- Source: NOT a root-level .sql file — no such file exists (see 0014's header
-- and migrations/README.md known issue #1). Reconstructed on 2026-09-15 by
-- reading the live database's actual information_schema.columns and
-- table_constraints for public.drivers, via a human pasting the results of
-- read-only diagnostic queries into chat.
-- =============================================================================
-- This is the table 0014 (setup_nearest_driver.sql) ALTERs and assumes
-- already exists. It was most likely created by hand via the Supabase Table
-- Editor GUI rather than SQL, which is why no .sql file in this repo ever
-- creates it.
--
-- Column shape and types below are exactly what's live today (confirmed via
-- information_schema.columns), MINUS the columns 0014 itself adds
-- (lat, lng, location, updated_at) — those stay in 0014, not duplicated here.
-- Constraints (PRIMARY KEY on id, FOREIGN KEY id -> public.users.id) are
-- confirmed via information_schema.table_constraints / key_column_usage /
-- constraint_column_usage, not guessed. This matches the id-as-FK-to-users
-- pattern already used by driver_profiles (0007) elsewhere in this project.
--
-- Must run after 0001 (public.users) and before 0014 (which ALTERs this
-- table). Run order: 0001 ... 0013, 0013b, 0014 ... 0015.
-- =============================================================================

CREATE TABLE public.drivers (
    id UUID PRIMARY KEY REFERENCES public.users(id),
    vehicle_type VARCHAR,
    vehicle_plate VARCHAR,
    is_online BOOLEAN DEFAULT false,
    rating NUMERIC DEFAULT 5.0,
    status VARCHAR DEFAULT 'active'
);
