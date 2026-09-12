-- Eksekusi file ini di SQL Editor Supabase Anda

-- 1. Aktifkan Ekstensi PostGIS (Sistem Tata Ruang / Spatial)
CREATE EXTENSION IF NOT EXISTS postgis;

-- 2. Buat tabel khusus untuk Wilayah Operasional yang mendukung Geofencing
CREATE TABLE IF NOT EXISTS public.operational_zones (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    status_text TEXT,
    services JSONB DEFAULT '{}'::jsonb,
    geojson JSONB, -- Menyimpan koordinat Polygon dari Peta Admin
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Atur Keamanan RLS
ALTER TABLE public.operational_zones ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public can read operational_zones" ON public.operational_zones;
CREATE POLICY "Public can read operational_zones" ON public.operational_zones FOR SELECT USING (true);

DROP POLICY IF EXISTS "Admin can manage operational_zones" ON public.operational_zones;
CREATE POLICY "Admin can manage operational_zones" ON public.operational_zones FOR ALL USING (true);

-- 4. Pindahkan data dari feature_flags ke operational_zones (Migrasi)
INSERT INTO public.operational_zones (id, name, status_text, services)
SELECT 
    el->>'id',
    el->>'name',
    el->>'status_text',
    (el->>'services')::jsonb
FROM 
    public.feature_flags,
    jsonb_array_elements(features) AS el
WHERE 
    region = 'operational_zones'
ON CONFLICT (id) DO NOTHING;

-- 5. Buat Fungsi (RPC) untuk mengecek lokasi pengguna secara Real-Time
CREATE OR REPLACE FUNCTION get_zone_for_location(lat double precision, lng double precision)
RETURNS SETOF public.operational_zones AS $$
BEGIN
    RETURN QUERY
    SELECT *
    FROM public.operational_zones oz
    WHERE oz.is_active = true 
    AND oz.geojson IS NOT NULL
    AND ST_Contains(
        ST_SetSRID(ST_GeomFromGeoJSON(oz.geojson::text), 4326),
        ST_SetSRID(ST_Point(lng, lat), 4326)
    );
END;
$$ LANGUAGE plpgsql;
