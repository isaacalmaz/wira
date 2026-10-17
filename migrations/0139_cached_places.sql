-- 0139_cached_places.sql
-- Hybrid Google Places cache for Lombok address search.
-- Stores resolved Google Places coordinates (place_id -> name, address, lat, lng)
-- so once any customer looks up a warung, gang, kos, or shop via Google Places,
-- subsequent searches by any user find it directly in Supabase at Rp 0 cost.
--
-- Read is open to anon/authenticated (used by LocationAutocomplete Layer 1).
-- Writes are restricted to service_role only (populated by backend /api/places/resolve).

CREATE TABLE IF NOT EXISTS public.cached_places (
  place_id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  address TEXT NOT NULL DEFAULT '',
  type_label TEXT,
  lat DOUBLE PRECISION NOT NULL,
  lng DOUBLE PRECISION NOT NULL,
  hit_count INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cached_places_name_trgm
  ON public.cached_places (lower(name));

CREATE INDEX IF NOT EXISTS idx_cached_places_hit_count
  ON public.cached_places (hit_count DESC);

ALTER TABLE public.cached_places ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "cached_places_select_all" ON public.cached_places;
CREATE POLICY "cached_places_select_all"
  ON public.cached_places
  FOR SELECT
  TO anon, authenticated
  USING (true);

REVOKE ALL ON public.cached_places FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.cached_places TO anon, authenticated;
GRANT ALL ON public.cached_places TO service_role;
