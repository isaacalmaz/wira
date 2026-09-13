-- ============================================================================
-- Wira Super-App: PostGIS Proximity-Based Nearest Driver Matching Migration
-- File: setup_nearest_driver.sql
-- Requirement: R2 (Sistem Pencocokan Driver Terdekat / PostGIS Nearest Neighbor)
-- ============================================================================
-- Petunjuk Eksekusi:
-- 1. Buka Supabase Dashboard -> SQL Editor (https://supabase.com/dashboard)
-- 2. Buat "New query"
-- 3. Salin dan tempel seluruh isi script ini, kemudian klik tombol "Run"
-- ============================================================================

-- 1. Pastikan Ekstensi PostGIS Aktif
CREATE EXTENSION IF NOT EXISTS postgis;

-- 2. Tambahkan Kolom Koordinat & Spasial ke Tabel public.drivers
ALTER TABLE public.drivers ADD COLUMN IF NOT EXISTS lat DOUBLE PRECISION;
ALTER TABLE public.drivers ADD COLUMN IF NOT EXISTS lng DOUBLE PRECISION;
ALTER TABLE public.drivers ADD COLUMN IF NOT EXISTS location GEOGRAPHY(Point, 4326);
ALTER TABLE public.drivers ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- 3. Buat Indeks Spasial GiST untuk Akselerasi Pencarian Nearest-Neighbor (KNN)
CREATE INDEX IF NOT EXISTS idx_drivers_location_gist 
ON public.drivers USING GIST (location);

-- Indeks Tambahan untuk Optimasi Filter Status dan Ketersediaan Driver
CREATE INDEX IF NOT EXISTS idx_drivers_online_status 
ON public.drivers (is_online, status);

-- 4. Fungsi & Trigger Sinkronisasi Koordinat (lat/lng <-> location)
-- PERINGATAN PENTING POSTGIS:
-- ST_MakePoint(X, Y) -> X = Longitude (Bujur), Y = Latitude (Lintang).
-- Urutan ST_MakePoint(lng, lat) harus selalu dipatuhi agar koordinat WGS84 valid.
CREATE OR REPLACE FUNCTION sync_driver_location()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'UPDATE' THEN
        -- Skenario B: Objek geografi location diupdate secara eksplisit sementara lat/lng tidak berubah
        IF NEW.location IS DISTINCT FROM OLD.location 
           AND NEW.lat IS NOT DISTINCT FROM OLD.lat 
           AND NEW.lng IS NOT DISTINCT FROM OLD.lng THEN
            IF NEW.location IS NOT NULL THEN
                NEW.lng := ST_X(NEW.location::geometry);
                NEW.lat := ST_Y(NEW.location::geometry);
            ELSE
                NEW.lat := NULL;
                NEW.lng := NULL;
            END IF;
        -- Skenario A: Koordinat skalar lat atau lng diupdate secara eksplisit
        ELSIF NEW.lat IS DISTINCT FROM OLD.lat OR NEW.lng IS DISTINCT FROM OLD.lng THEN
            IF NEW.lat IS NOT NULL AND NEW.lng IS NOT NULL THEN
                -- Validasi batas koordinat WGS84: lat [-90, 90], lng [-180, 180]
                IF NEW.lat < -90.0 OR NEW.lat > 90.0 OR NEW.lng < -180.0 OR NEW.lng > 180.0 THEN
                    NEW.location := NULL;
                ELSIF NEW.lat >= -90.0 AND NEW.lat <= 90.0 AND NEW.lng >= -180.0 AND NEW.lng <= 180.0 THEN
                    NEW.location := ST_SetSRID(ST_MakePoint(NEW.lng, NEW.lat), 4326)::geography;
                END IF;
            ELSE
                NEW.location := NULL;
            END IF;
        -- Skenario C: Keduanya diubah atau fallback
        ELSIF NEW.lat IS NOT NULL AND NEW.lng IS NOT NULL THEN
            IF NEW.lat < -90.0 OR NEW.lat > 90.0 OR NEW.lng < -180.0 OR NEW.lng > 180.0 THEN
                NEW.location := NULL;
            ELSIF NEW.lat >= -90.0 AND NEW.lat <= 90.0 AND NEW.lng >= -180.0 AND NEW.lng <= 180.0 THEN
                NEW.location := ST_SetSRID(ST_MakePoint(NEW.lng, NEW.lat), 4326)::geography;
            END IF;
        ELSIF NEW.location IS NOT NULL THEN
            NEW.lng := ST_X(NEW.location::geometry);
            NEW.lat := ST_Y(NEW.location::geometry);
        END IF;
    ELSE -- TG_OP = 'INSERT'
        IF NEW.lat IS NOT NULL AND NEW.lng IS NOT NULL THEN
            IF NEW.lat < -90.0 OR NEW.lat > 90.0 OR NEW.lng < -180.0 OR NEW.lng > 180.0 THEN
                NEW.location := NULL;
            ELSIF NEW.lat >= -90.0 AND NEW.lat <= 90.0 AND NEW.lng >= -180.0 AND NEW.lng <= 180.0 THEN
                NEW.location := ST_SetSRID(ST_MakePoint(NEW.lng, NEW.lat), 4326)::geography;
            END IF;
        ELSIF NEW.location IS NOT NULL THEN
            NEW.lng := ST_X(NEW.location::geometry);
            NEW.lat := ST_Y(NEW.location::geometry);
        END IF;
    END IF;

    NEW.updated_at := NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_sync_driver_location ON public.drivers;
CREATE TRIGGER trg_sync_driver_location
BEFORE INSERT OR UPDATE OF lat, lng, location ON public.drivers
FOR EACH ROW
EXECUTE FUNCTION sync_driver_location();

-- 5. Backfill Kolom location untuk Data Driver yang Sudah Memiliki lat/lng
UPDATE public.drivers 
SET location = ST_SetSRID(ST_MakePoint(lng, lat), 4326)::geography 
WHERE location IS NULL AND lat IS NOT NULL AND lng IS NOT NULL;

-- 6. Fungsi RPC Utama: get_nearest_drivers
-- Mencari mitra driver terdekat berdasarkan koordinat pengguna tanpa batasan radius mutlak (unbounded).
-- Menggunakan operator PostGIS KNN (<->) untuk efisiensi indeks GiST dan ST_Distance untuk jarak presisi (meter).
CREATE OR REPLACE FUNCTION get_nearest_drivers(
    user_lat DOUBLE PRECISION,
    user_lng DOUBLE PRECISION,
    target_vehicle_type TEXT DEFAULT NULL,
    only_online BOOLEAN DEFAULT true,
    max_results INT DEFAULT 10
)
RETURNS TABLE (
    id UUID,
    name TEXT,
    phone TEXT,
    avatar_url TEXT,
    vehicle_type TEXT,
    vehicle_plate TEXT,
    rating NUMERIC,
    status TEXT,
    is_online BOOLEAN,
    lat DOUBLE PRECISION,
    lng DOUBLE PRECISION,
    distance_meters DOUBLE PRECISION
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    u_point GEOGRAPHY;
BEGIN
    -- Validasi koordinat input
    IF user_lat IS NULL OR user_lng IS NULL THEN
        RETURN;
    END IF;

    -- Validasi batas geospasial WGS84
    IF user_lat < -90.0 OR user_lat > 90.0 OR user_lng < -180.0 OR user_lng > 180.0 THEN
        RETURN;
    END IF;

    -- Konstruksi titik geografi pengguna (Longitude=X, Latitude=Y)
    u_point := ST_SetSRID(ST_MakePoint(user_lng, user_lat), 4326)::geography;

    RETURN QUERY
    SELECT 
        d.id,
        COALESCE(u.name, 'Mitra Driver')::TEXT AS name,
        COALESCE(u.phone, '-')::TEXT AS phone,
        u.avatar_url::TEXT,
        COALESCE(d.vehicle_type, 'motor')::TEXT AS vehicle_type,
        COALESCE(d.vehicle_plate, '-')::TEXT AS vehicle_plate,
        COALESCE(d.rating, 5.0)::NUMERIC AS rating,
        COALESCE(d.status, 'active')::TEXT AS status,
        d.is_online,
        COALESCE(d.lat, ST_Y(d.location::geometry))::DOUBLE PRECISION AS lat,
        COALESCE(d.lng, ST_X(d.location::geometry))::DOUBLE PRECISION AS lng,
        ROUND(
            ST_Distance(
                d.location,
                u_point
            )::NUMERIC, 
            2
        )::DOUBLE PRECISION AS distance_meters
    FROM public.drivers d
    LEFT JOIN public.users u ON u.id = d.id
    WHERE 
        (NOT only_online OR d.is_online = true)
        AND (d.status = 'active' OR d.status IS NULL)
        AND d.location IS NOT NULL
        AND (target_vehicle_type IS NULL OR target_vehicle_type = '' OR COALESCE(d.vehicle_type, 'motor') = target_vehicle_type)
    ORDER BY 
        d.location <-> u_point ASC
    LIMIT LEAST(GREATEST(COALESCE(max_results, 10), 1), 100); -- LIMIT COALESCE(max_results, 10)
END;
$$;

-- 7. Fungsi Alias Kenyamanan: find_nearest_drivers
-- Mendukung pemanggilan dengan parameter nama pendek ({ lat, lng })
CREATE OR REPLACE FUNCTION find_nearest_drivers(
    lat DOUBLE PRECISION,
    lng DOUBLE PRECISION,
    target_vehicle_type TEXT DEFAULT NULL,
    only_online BOOLEAN DEFAULT true,
    max_results INT DEFAULT 10
)
RETURNS TABLE (
    id UUID,
    name TEXT,
    phone TEXT,
    avatar_url TEXT,
    vehicle_type TEXT,
    vehicle_plate TEXT,
    rating NUMERIC,
    status TEXT,
    is_online BOOLEAN,
    lat DOUBLE PRECISION,
    lng DOUBLE PRECISION,
    distance_meters DOUBLE PRECISION
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
    RETURN QUERY 
    SELECT * FROM get_nearest_drivers(
        user_lat => lat,
        user_lng => lng,
        target_vehicle_type => target_vehicle_type,
        only_online => only_online,
        max_results => max_results
    );
END;
$$;

-- 8. Kebijakan Keamanan Row Level Security (RLS) & Izin Eksekusi
ALTER TABLE public.drivers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public can view online active drivers" ON public.drivers;
CREATE POLICY "Public can view online active drivers" 
ON public.drivers FOR SELECT 
USING (true);

DROP POLICY IF EXISTS "Drivers can update own record" ON public.drivers;
CREATE POLICY "Drivers can update own record" 
ON public.drivers FOR UPDATE 
USING (auth.uid() = id);

DROP POLICY IF EXISTS "Drivers can insert own record" ON public.drivers;
CREATE POLICY "Drivers can insert own record" 
ON public.drivers FOR INSERT 
WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS "Service role has full access to drivers" ON public.drivers;
CREATE POLICY "Service role has full access to drivers" 
ON public.drivers FOR ALL 
USING (true);

GRANT EXECUTE ON FUNCTION get_nearest_drivers(DOUBLE PRECISION, DOUBLE PRECISION, TEXT, BOOLEAN, INT) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION find_nearest_drivers(DOUBLE PRECISION, DOUBLE PRECISION, TEXT, BOOLEAN, INT) TO anon, authenticated, service_role;

-- 9. View Kompatibilitas Mundur: driver_locations
-- Memastikan backward-compatibility bagi komponen atau skrip pengujian yang mereferensikan nama tabel driver_locations
CREATE OR REPLACE VIEW public.driver_locations AS
SELECT 
    d.id,
    d.id AS driver_id,
    COALESCE(u.name, 'Mitra Driver')::TEXT AS name,
    COALESCE(d.vehicle_type, 'motor')::TEXT AS vehicle_type,
    COALESCE(d.vehicle_plate, '-')::TEXT AS vehicle_plate,
    d.lat,
    d.lng,
    d.location,
    d.is_online,
    d.status,
    d.updated_at
FROM public.drivers d
LEFT JOIN public.users u ON u.id = d.id;

GRANT SELECT ON public.driver_locations TO anon, authenticated, service_role;
