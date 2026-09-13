# Handoff Report: Requirement R2 (PostGIS Nearest Neighbor Driver Matching)

**Author**: `explorer_backend_1` (Backend PostGIS Explorer)  
**Recipient**: `parent` (Orchestrator) & Implementation Agents  
**Timestamp**: 2026-09-12T13:16:30Z  
**Type**: Hard Handoff (Investigation Complete)

---

## 1. Observation

1. **Database Schema & Driver Profile Table**:
   - In `backend/database/schema.sql` (lines 47–54):
     ```sql
     CREATE TABLE drivers (
       id UUID PRIMARY KEY REFERENCES users(id),
       vehicle_type VARCHAR(50),
       vehicle_plate VARCHAR(20),
       is_online BOOLEAN DEFAULT false,
       rating DECIMAL(3,2) DEFAULT 5.0,
       status VARCHAR(50) DEFAULT 'active'
     );
     ```
   - In `create_driver_profiles.sql` (lines 1–10), an alternate table `driver_profiles` was proposed. However, querying `driver_profiles` via Supabase JS client returned verbatim:
     `Table driver_profiles: ERROR -> Could not find the table 'public.driver_profiles' in the schema cache`.
   - In contrast, querying `public.drivers` succeeded (`Select drivers: [] null`). PostgREST OpenAPI spec confirmed `public.drivers` is the actual table deployed in Supabase.

2. **Foreign Key Constraint on `drivers`**:
   - Testing an insert on `public.drivers` with a non-existent UUID returned verbatim:
     `insert or update on table "drivers" violates foreign key constraint "drivers_id_fkey"`.
   - `public.drivers.id` strictly references `public.users.id`.

3. **Current Driver Coordinates Status**:
   - Inspection of `public.drivers` in the OpenAPI schema confirmed its exact columns:
     `['id', 'vehicle_type', 'vehicle_plate', 'is_online', 'rating', 'status']`.
   - There are currently **no** `lat`, `lng`, or PostGIS geometry/geography columns on `public.drivers` or `public.users`.

4. **PostGIS Extension & Existing RPC**:
   - In `setup_geofencing.sql` (lines 3–4, 41–54):
     `CREATE EXTENSION IF NOT EXISTS postgis;`
     `CREATE OR REPLACE FUNCTION get_zone_for_location(lat double precision, lng double precision) ... ST_Contains(...)`
   - Testing `supabase.rpc('get_zone_for_location', { lat: -8.5833, lng: 116.1167 })` executed with code 0 and returned `[] null`. This verifies PostGIS is installed and active in Supabase.

5. **RPC Invocation Convention in Frontend**:
   - In `frontend-user/src/pages/HomePage.jsx` (line 69):
     `const { data: zones, error: rpcError } = await supabase.rpc('get_zone_for_location', { lat: latitude, lng: longitude });`
   - In `frontend-admin/src/pages/FinancePage.jsx` (line 40):
     `const { data, error } = await supabase.rpc('approve_topup_request', { request_id: id });`
   - Arguments in the JavaScript object map directly to parameter names of the SQL function.

6. **Migration Execution Convention**:
   - `docs/CARA-KONEKSI-SUPABASE.md` instructs running migrations via Supabase SQL Editor (`backend/database/schema.sql`, `setup_geofencing.sql`, `setup_wallet.sql`).
   - `backend/.env` contains valid credentials:
     `SUPABASE_URL=https://yhxhcxgcjadchrjskozt.supabase.co`
     `SUPABASE_SERVICE_KEY=eyJhbGci...`

---

## 2. Logic Chain

1. **Target Table Selection**:
   - From Observation 1, `public.drivers` exists and is recognized by the schema cache, whereas `driver_profiles` does not exist. Therefore, `public.drivers` is the canonical table that must be extended for driver location tracking.

2. **Foreign Key Requirement**:
   - From Observation 2, `public.drivers` enforces `drivers_id_fkey` pointing to `public.users.id`. Therefore, any mock data inserted by test scripts (`test_proximity.js`) must first insert parent rows into `public.users`, or reference existing user rows. Teardown must delete from `public.drivers` before deleting from `public.users`.

3. **Spatial Data Type & Operator Choice**:
   - From Observation 3, coordinates do not yet exist on `drivers`.
   - PostGIS supports `geometry` and `geography`. Because user and driver coordinates are in WGS 84 GPS format (EPSG:4326), `GEOGRAPHY(Point, 4326)` computes great-circle distances along the Earth's spheroid directly in **meters**.
   - The `<->` operator on `geography` leverages a GiST spatial index (`USING GIST (location)`) to perform high-performance K-Nearest Neighbor (KNN) sorting.
   - Adding both scalar columns (`lat`, `lng DOUBLE PRECISION`) and a spatial column (`location GEOGRAPHY(Point, 4326)`), synchronized by a `BEFORE INSERT OR UPDATE` trigger, allows both simple JSON updates and PostGIS spatial indexing to work seamlessly.

4. **Coordinate Ordering Safety**:
   - PostGIS `ST_Point` / `ST_MakePoint` takes arguments in `(X, Y)` order, corresponding to `(longitude, latitude)`.
   - In Lombok, latitude is negative (around $-8.58$) and longitude is positive (around $+116.11$). Passing `ST_MakePoint(lat, lng)` will invert coordinates, causing longitude $116^\circ$ to be treated as latitude, resulting in an out-of-range error ($>90^\circ$). The SQL must strictly use `ST_SetSRID(ST_MakePoint(lng, lat), 4326)`.

5. **"No Absolute Radius Limit" Implementation**:
   - Requirement R2 specifies searching without an absolute radius cutoff.
   - Therefore, the SQL function must omit `ST_DWithin(...)` from the `WHERE` clause. It orders candidate drivers by `<->` (nearest first) and uses `LIMIT max_results`.

6. **RPC Signature & Ergonomics**:
   - From Observation 5, Supabase RPC binds parameter names directly.
   - Defining `get_nearest_drivers(user_lat, user_lng, target_vehicle_type, only_online, max_results)` and providing an alias `find_nearest_drivers(lat, lng, ...)` guarantees maximum compatibility with frontend callers and test scripts.

---

## 3. Caveats

1. **Direct DDL via REST**: Supabase Cloud restricts DDL execution (`CREATE TABLE`, `CREATE FUNCTION`) over PostgREST REST API. The migration script `setup_nearest_driver.sql` must be applied via the Supabase Dashboard SQL Editor or via direct PostgreSQL connection.
2. **Realtime Driver Location Updates**: Requirement R2 specifies the nearest neighbor matching function; broadcasting continuous driver GPS movements via Supabase Realtime Channels or WebSockets is a separate, downstream layer.
3. **Empty Driver Table in Seed**: `public.drivers` currently contains 0 records in Supabase. Test simulations must seed mock driver and user records to execute test assertions.

---

## 4. Conclusion

1. **Schema Modifications**: Apply SQL migration `setup_nearest_driver.sql` to add `lat`, `lng`, `location GEOGRAPHY(Point, 4326)`, and `updated_at` to `public.drivers`, accompanied by a GiST index and a bidirectional coordinate synchronization trigger.
2. **RPC Function**: Create `get_nearest_drivers(user_lat DOUBLE PRECISION, user_lng DOUBLE PRECISION, target_vehicle_type TEXT DEFAULT NULL, only_online BOOLEAN DEFAULT true, max_results INT DEFAULT 10)` in Supabase that calculates `distance_meters` using `ST_Distance` and orders results via PostGIS KNN `<->` without any hard radius filtering.
3. **Automated Verification**: Implement `test_proximity.js` at the repository root to insert 3 mock drivers at known Lombok landmarks (Epicentrum Mall ~860m, Unram ~2.18km, Senggigi ~12.75km), assert mathematically correct distance calculations and ascending order, and clean up test data.

---

## 5. Verification Method

To independently verify the investigation findings:

1. **Verify PostGIS & Tables in Supabase**:
   ```bash
   cd /Users/ishakalmaazi/.gemini/antigravity/scratch/wira/backend
   node -e "
   require('dotenv').config();
   const { createClient } = require('@supabase/supabase-js');
   const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
   async function run() {
     const { data: d } = await sb.from('drivers').select('*');
     const { data: z, error: ze } = await sb.rpc('get_zone_for_location', { lat: -8.58, lng: 116.11 });
     console.log('drivers table accessible:', Array.isArray(d));
     console.log('get_zone_for_location RPC working:', !ze);
   }
   run();
   "
   ```
2. **Verify Mathematical Distances**:
   Run the Haversine reference calculation from Mataram Mall (`-8.5866, 116.1158`):
   - Epicentrum Mall: ~860.59 m
   - Universitas Mataram: ~2,179.02 m
   - Senggigi Beach: ~12,746.98 m
3. **Invalidation Conditions**:
   - If `public.drivers` is dropped or renamed.
   - If PostGIS extension is removed from the database.
   - If latitude and longitude order is inverted in `ST_MakePoint`.
