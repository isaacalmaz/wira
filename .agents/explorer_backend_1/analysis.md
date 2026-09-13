# Detailed Investigation & Analysis Report: Requirement R2 (PostGIS Nearest Neighbor Driver Matching)

**Agent**: `explorer_backend_1` (Backend PostGIS Explorer)  
**Date**: 2026-09-12  
**Target Requirement**: Requirement R2 & R3 (Proximity-based Nearest Driver Matching via Supabase PostGIS RPC)

---

## 1. Executive Summary

Requirement R2 mandates replacing strict geofencing with a **Proximity-Based Matching system** using PostgreSQL PostGIS nearest-neighbor distance operators (`ST_Distance` or `<->`). The query must sort drivers by proximity to the user coordinates **without an arbitrary/absolute radius limit** (e.g. no hard 5 km cutoff).

Through live database inspection (via PostgREST OpenAPI and Supabase Client queries) and comprehensive codebase analysis, this investigation established:
1. **PostGIS is already enabled and operational** in the Supabase instance (`https://yhxhcxgcjadchrjskozt.supabase.co`).
2. The core `public.drivers` table exists in Supabase, but **currently lacks spatial coordinates** (`lat`, `lng`, `location`).
3. Foreign key constraints dictate that any driver record in `public.drivers` **must reference an existing `public.users(id)`**.
4. For accurate, metric distance calculations and index-assisted nearest-neighbor sorting, **`GEOGRAPHY(Point, 4326)`** with a **GiST index** and the **`<->`** operator is the superior architectural choice over raw planar `GEOMETRY(Point, 4326)`.
5. An SQL migration script (e.g., `setup_nearest_driver.sql`) must be created at the project root to alter `public.drivers`, add a bidirectional sync trigger, and define the `get_nearest_drivers` RPC function.
6. A companion verification script (`test_proximity.js`) can use real Lombok landmark coordinates (Mataram Mall, Epicentrum Mall, Universitas Mataram, Senggigi Beach) to mathematically validate distance calculations and ordering.

---

## 2. Examination of Repository Database Schemas

We analyzed all `.sql` files across the repository and correlated them with the live Supabase schema:

| File | Status in Supabase | Key Schema Elements & Notes |
|---|---|---|
| `backend/database/schema.sql` | **Active / Partially Seeded** | Defines `users`, `wallets`, `transactions`, `orders`, `drivers`, `restaurants`, `menu_items`, `feature_flags`. Line 47 defines `drivers (id UUID PRIMARY KEY REFERENCES users(id), vehicle_type VARCHAR(50), vehicle_plate VARCHAR(20), is_online BOOLEAN DEFAULT false, rating DECIMAL(3,2) DEFAULT 5.0, status VARCHAR(50) DEFAULT 'active')`. |
| `master_schema.sql` | **Active / Applied** | Defines `users`, `merchants`, `orders`, `messages`. Contains RLS policies and adds `role`, `status`, `phone`, `mitra_access` to `users`. |
| `setup_geofencing.sql` | **Active / Applied** | Executed `CREATE EXTENSION IF NOT EXISTS postgis;`, created `operational_zones`, and deployed RPC `get_zone_for_location(lat, lng)`. Verified operational via live RPC call. |
| `create_driver_profiles.sql` | **Unapplied / Obsolete** | Defines `driver_profiles (id, user_id, vehicle_type, plate_number, vehicle_color, is_verified)`. Verified **not present** in the Supabase schema cache. Table `drivers` is the authoritative driver table. |
| `setup_wallet.sql` | **Active / Applied** | Created `topup_requests` and RPC `approve_topup_request`. |
| `migrate_mitra_access.sql` | **Active / Applied** | Added `mitra_access JSONB` to `users` (`["driver"]`, `["merchant"]`, etc.). |
| `seed_all_data.sql` | **Active Reference** | Seeds locations (`locations` table with Mataram Mall, Epicentrum, Airport, etc.) and vehicles (`vehicles` table with `motor` and `mobil`). |

---

## 3. Analysis of Existing Driver & Mitra Data Structures

### 3.1 Live Database State (Verified via REST & RPC)
- **`public.users`**: Contains 3 accounts. Has `id`, `name`, `phone`, `email`, `role`, `status`, `mitra_access` (JSONB, e.g. `["driver"]`).
- **`public.drivers`**: 
  - Exists in the schema with columns:
    - `id` (UUID, Primary Key, Foreign Key -> `public.users.id`)
    - `vehicle_type` (`character varying(50)`)
    - `vehicle_plate` (`character varying(20)`)
    - `is_online` (`boolean`, default `false`)
    - `rating` (`numeric(3,2)`, default `5.00`)
    - `status` (`character varying(50)`, default `'active'`)
  - Current row count: **0 rows**.
  - Missing columns: **No latitude, longitude, or geometry/geography column**.
- **`drivers_id_fkey` Constraint**:
  - Live test confirmed: attempting to insert a driver with an arbitrary UUID fails with `insert or update on table "drivers" violates foreign key constraint "drivers_id_fkey"`.
  - **Critical Rule for Testing/Seeding**: Any driver insertion must ensure a corresponding record in `public.users` exists first.

### 3.2 Required Schema Enhancements for `public.drivers`
To enable PostGIS proximity matching, `public.drivers` must be augmented with:
1. `lat DOUBLE PRECISION`: Driver current latitude (e.g. `-8.5833`).
2. `lng DOUBLE PRECISION`: Driver current longitude (e.g. `116.1167`).
3. `location GEOGRAPHY(Point, 4326)`: PostGIS spatial point for index acceleration.
4. `updated_at TIMESTAMPTZ DEFAULT NOW()`: To record the last coordinate ping.

---

## 4. PostGIS Mechanics, SRID, Indexing, and Distance Operators

### 4.1 Coordinate Order (Axis Order Trap)
PostGIS strictly adheres to the standard `(X, Y)` Cartesian ordering:
- $X = \text{Longitude}$ (E/W: $-180^\circ$ to $+180^\circ$)
- $Y = \text{Latitude}$ (N/S: $-90^\circ$ to $+90^\circ$)

In Lombok, latitude is approximately $-8.58^\circ$ and longitude is approximately $+116.11^\circ$.
- **Correct syntax**: `ST_SetSRID(ST_MakePoint(lng, lat), 4326)`
- **Incorrect syntax**: `ST_SetSRID(ST_MakePoint(lat, lng), 4326)`  
  *(Passing latitude as X and longitude as Y causes a fatal PostGIS error: `latitude out of range [-90, 90]` because longitude $116^\circ > 90^\circ$)*.

### 4.2 `GEOGRAPHY` vs `GEOMETRY`
- Using `GEOMETRY(Point, 4326)` performs angular Euclidean distance calculations in degrees ($^\circ$). At $-8^\circ$ latitude, $1^\circ$ longitude is not equal to $1^\circ$ latitude, and converting degrees to meters requires manual spherical trigonometry.
- Using `GEOGRAPHY(Point, 4326)` represents points natively on the WGS 84 ellipsoidal spheroid.
  - `ST_Distance(geog1, geog2)` returns distance directly in **meters** along the curve of the Earth.
  - The KNN operator `<->` computes spheroidal distance in meters and seamlessly leverages GiST indexes for instant sorting.

### 4.3 Spatial Indexing
```sql
CREATE INDEX IF NOT EXISTS idx_drivers_location_gist 
ON public.drivers USING GIST (location);
```
With a GiST index on `location`, PostgreSQL can perform a K-Nearest Neighbor (KNN) index scan using `ORDER BY location <-> ST_SetSRID(ST_MakePoint(user_lng, user_lat), 4326)::geography`. This avoids a full table scan and scales efficiently as the driver fleet grows.

### 4.4 Automated Coordinate Synchronization Trigger
To ensure developer convenience and prevent data drift between simple JSON updates (`{ lat, lng }`) and PostGIS queries:
```sql
CREATE OR REPLACE FUNCTION sync_driver_location()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.lat IS NOT NULL AND NEW.lng IS NOT NULL THEN
        NEW.location := ST_SetSRID(ST_MakePoint(NEW.lng, NEW.lat), 4326)::geography;
    ELSIF NEW.location IS NOT NULL THEN
        NEW.lng := ST_X(NEW.location::geometry);
        NEW.lat := ST_Y(NEW.location::geometry);
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
```

### 4.5 Addressing "No Absolute Radius Limit"
Requirement R2 states: *"Sistem ini harus mencari tanpa batasan radius mutlak (terus diurutkan dari yang paling dekat)."*
- **Design Decision**: The RPC function must **not** include a `WHERE ST_DWithin(...)` clause.
- Instead, it selects all active/online drivers with valid coordinates, orders them ascending by distance (`ORDER BY ... <-> ... ASC` or `ORDER BY distance_meters ASC`), and applies a configurable `LIMIT max_results` (e.g. default 10, up to 50). This guarantees that even if the closest driver is 25 km away in a rural area, the system will still match and return that driver.

---

## 5. Supabase RPC Conventions & Function Signature Design

### 5.1 Supabase RPC Call Patterns in Wira Codebase
In `frontend-user/src/pages/HomePage.jsx`:
```javascript
const { data: zones, error: rpcError } = await supabase.rpc('get_zone_for_location', { 
  lat: latitude, 
  lng: longitude 
});
```
In `frontend-admin/src/pages/FinancePage.jsx`:
```javascript
const { data, error } = await supabase.rpc('approve_topup_request', { 
  request_id: id 
});
```

### 5.2 Proposed Primary RPC: `get_nearest_drivers`

```sql
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
    is_online BOOLEAN,
    status TEXT,
    lat DOUBLE PRECISION,
    lng DOUBLE PRECISION,
    distance_meters DOUBLE PRECISION
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        d.id,
        COALESCE(u.name, 'Mitra Driver')::TEXT AS name,
        COALESCE(u.phone, '-')::TEXT AS phone,
        u.avatar_url,
        d.vehicle_type::TEXT,
        d.vehicle_plate::TEXT,
        d.rating::NUMERIC,
        d.is_online,
        d.status::TEXT,
        d.lat,
        d.lng,
        ROUND(
            ST_Distance(
                COALESCE(d.location, ST_SetSRID(ST_MakePoint(d.lng, d.lat), 4326)::geography),
                ST_SetSRID(ST_MakePoint(user_lng, user_lat), 4326)::geography
            )::NUMERIC, 
            2
        )::DOUBLE PRECISION AS distance_meters
    FROM public.drivers d
    LEFT JOIN public.users u ON u.id = d.id
    WHERE 
        (NOT only_online OR d.is_online = true)
        AND d.status = 'active'
        AND (d.location IS NOT NULL OR (d.lat IS NOT NULL AND d.lng IS NOT NULL))
        AND (target_vehicle_type IS NULL OR target_vehicle_type = '' OR d.vehicle_type = target_vehicle_type)
    ORDER BY 
        COALESCE(d.location, ST_SetSRID(ST_MakePoint(d.lng, d.lat), 4326)::geography) 
        <-> ST_SetSRID(ST_MakePoint(user_lng, user_lat), 4326)::geography ASC
    LIMIT max_results;
END;
$$;
```

### 5.3 Proposed Convenience Alias: `find_nearest_drivers`
To support callers passing `{ lat, lng }` instead of `{ user_lat, user_lng }`:
```sql
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
    is_online BOOLEAN,
    status TEXT,
    lat DOUBLE PRECISION,
    lng DOUBLE PRECISION,
    distance_meters DOUBLE PRECISION
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    RETURN QUERY SELECT * FROM get_nearest_drivers(lat, lng, target_vehicle_type, only_online, max_results);
END;
$$;
```

---

## 6. Migration Script Application & Deployment Mechanics

### 6.1 Current Repository Pattern
- In this repository, database changes are maintained as discrete `.sql` scripts in the root directory:
  - `setup_geofencing.sql` (configured operational zones & PostGIS)
  - `setup_wallet.sql` (configured wallet balances, topup requests & RPC)
  - `master_schema.sql` (configured users, orders, RLS)
- The documented application workflow (`docs/CARA-KONEKSI-SUPABASE.md`) is executing the SQL in the **Supabase Dashboard SQL Editor**.
- The service role key is present in `backend/.env`:
  `SUPABASE_URL=https://yhxhcxgcjadchrjskozt.supabase.co`
  `SUPABASE_SERVICE_KEY=eyJhbGci...`
- Because PostgREST does not expose arbitrary DDL query execution via REST (standard security model for Supabase Cloud), migration scripts must either be executed via the Supabase SQL Editor or through a dedicated direct connection.
- Therefore, creating `setup_nearest_driver.sql` in the repository root directly follows the project's established conventions.

---

## 7. Test Simulation Design (Requirement R3 / `test_proximity.js`)

To satisfy Requirement R3 ("Tim agen harus menyertakan skrip simulasi (misal: test_proximity.js) di root folder..."), the test runner should:

### 7.1 Coordinate Fixtures (Real Lombok Landmarks)
- **User Reference Point**: Mataram Mall (`-8.5866, 116.1158`)
- **Driver 1 (Closest)**: Epicentrum Mall (`-8.5939, 116.1132`) $\rightarrow \approx \mathbf{860.59\text{ m}}$
- **Driver 2 (Medium)**: Universitas Mataram (`-8.5901, 116.0963`) $\rightarrow \approx \mathbf{2,179.02\text{ m}}$
- **Driver 3 (Furthest)**: Senggigi Beach (`-8.4950, 116.0461`) $\rightarrow \approx \mathbf{12,746.98\text{ m}}$

### 7.2 Simulation Steps
1. **Setup**:
   - Connect to Supabase using `SUPABASE_SERVICE_KEY` from `backend/.env`.
   - Insert 3 mock users into `public.users` with unique test UUIDs (e.g. `11111111-1111-1111-1111-000000000001`, `...0002`, `...0003`).
   - Insert 3 corresponding mock drivers into `public.drivers` with the landmark coordinates, `is_online: true`, `status: 'active'`, and `vehicle_type: 'motor'`.
2. **Execute RPC**:
   - Call `supabase.rpc('get_nearest_drivers', { user_lat: -8.5866, user_lng: 116.1158, max_results: 10 })`.
3. **Assert**:
   - Assert `data.length >= 3`.
   - Assert `data[0].name === 'Driver Epicentrum'` and `Math.abs(data[0].distance_meters - 860) < 50`.
   - Assert `data[1].name === 'Driver Unram'` and `Math.abs(data[1].distance_meters - 2179) < 50`.
   - Assert `data[2].name === 'Driver Senggigi'` and `Math.abs(data[2].distance_meters - 12747) < 100`.
   - Assert monotonic ordering: `data[0].distance_meters < data[1].distance_meters < data[2].distance_meters`.
4. **Teardown**:
   - Clean up mock drivers and mock users in reverse dependency order (`drivers` first, then `users`).
   - Log verification success.

---

## 8. Summary of Action Items for Implementation Phase

1. **Create `setup_nearest_driver.sql`** in root containing:
   - `postgis` extension validation.
   - Column additions to `public.drivers` (`lat`, `lng`, `location`, `updated_at`).
   - GiST index on `location`.
   - Synchronization trigger (`sync_driver_location`).
   - RLS policy adjustments for `drivers`.
   - `get_nearest_drivers` and `find_nearest_drivers` RPC definitions.
2. **Create `test_proximity.js`** in root to automate insertion, verification, and teardown.
3. **Execute migration in Supabase** and run `node test_proximity.js` to confirm green verification.
