-- =============================================================================
-- Migration 0007: Create driver_profiles table + RLS
-- Source: create_driver_profiles.sql (repo root)
-- Original creation date (git history, first commit): 2026-09-08
-- =============================================================================
-- Depends on public.users from 0001.
--
-- NOTE: This table (driver_profiles: vehicle_type, plate_number,
-- vehicle_color, is_verified) is DISTINCT from the separate public.drivers
-- table that migration 0014 (setup_nearest_driver.sql) later ALTERs. See the
-- README and migration 0014's header for the "missing drivers table" gap.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.driver_profiles (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES public.users(id) ON DELETE CASCADE UNIQUE,
  vehicle_type TEXT,
  plate_number TEXT,
  vehicle_color TEXT,
  is_verified BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.driver_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Drivers can view their own profile"
ON public.driver_profiles FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Drivers can update their own profile"
ON public.driver_profiles FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "Drivers can insert their own profile"
ON public.driver_profiles FOR INSERT
WITH CHECK (auth.uid() = user_id);

-- Everyone can read verified drivers (for users to see driver details)
CREATE POLICY "Public can view verified driver profiles"
ON public.driver_profiles FOR SELECT
USING (is_verified = true);
