# Project: Wira Proximity-Based Matching

## Architecture
Transition Wira application from strict geofencing (blocking users outside operational polygons) to PostGIS proximity-based nearest-neighbor matching across frontend, database, and automated test verification.

- **Frontend (`frontend-user`)**:
  - `HomePage.jsx` displays all available services without requesting GPS permissions on initial load and without disabling services or displaying "Lokasi Terbatas" banners.
  - GPS is requested lazily only when a user navigates to a specific order page (e.g., `RidePage.jsx`).
  - Global feature toggles from Supabase `feature_flags` are preserved.
- **Backend & Database (PostGIS & Supabase)**:
  - `public.drivers` is enhanced with `lat`, `lng`, and `location GEOGRAPHY(Point, 4326)` columns.
  - Spatial GiST index `idx_drivers_location` enables high-performance KNN queries.
  - Bidirectional trigger `sync_driver_location` keeps `lat`/`lng` and `location` synchronized.
  - RPC function `get_nearest_drivers(user_lat, user_lng, target_vehicle_type, only_online, max_results)` (and alias `find_nearest_drivers`) calculates distances using PostGIS `ST_Distance` on WGS84 geography and orders drivers by proximity using the PostGIS KNN `<->` operator without hard radius limits.
  - SQL migration script `setup_nearest_driver.sql` contains the complete DDL/DML.
- **Verification & Testing (`test_proximity.js`)**:
  - Standalone script `test_proximity.js` at project root using Node 24 native features and `@supabase/supabase-js` with `SUPABASE_SERVICE_KEY`.
  - Injects graduated mock drivers across Lombok (from ~300m up to ~50km) to test without radius caps.
  - Compares PostGIS calculated distances against mathematical Haversine calculations in JavaScript.
  - Validates ordering, precision, and clean teardown.

## Feature Inventory
| # | Feature | Description | Milestone | Source | Status |
|---|---------|-------------|-----------|--------|--------|
| 1 | R1.1: Remove GPS Request on Init | Remove `fetchLocationAndZones` invocation on `HomePage.jsx` startup | M1 | ORIGINAL_REQUEST §R1 | DONE |
| 2 | R1.2: Remove Service Greying/Blocking | Keep all service icons colorful and accessible without geofence polygon checks | M1 | ORIGINAL_REQUEST §R1 | DONE |
| 3 | R1.3: Remove Warning Banners | Eliminate "Lokasi Terbatas" and "Izin lokasi ditolak" banners from HomePage | M1 | ORIGINAL_REQUEST §R1 | DONE |
| 4 | R1.4: Lazy GPS in Order Pages | Preserve existing lazy GPS handling in `RidePage.jsx` when ordering | M1 | ORIGINAL_REQUEST §R1 | DONE |
| 5 | R2.1: PostGIS Schema Migration | Add `lat`, `lng`, `location GEOGRAPHY(Point, 4326)` and GiST index to `public.drivers` | M2 | ORIGINAL_REQUEST §R2 | READY |
| 6 | R2.2: Nearest Neighbor RPC | Implement `get_nearest_drivers` and `find_nearest_drivers` without absolute radius limit | M2 | ORIGINAL_REQUEST §R2 | READY |
| 7 | R3.1: Automated Proximity Test | Implement `test_proximity.js` at root with mock driver insertion, RPC query, and cleanup | M3 | ORIGINAL_REQUEST §R3 | PLANNED |
| 8 | R3.2: Mathematical Distance Validation | Assert strict monotonic ascending order and <1% delta between PostGIS and Haversine formula | M3 | ORIGINAL_REQUEST §R3 | PLANNED |

## Milestones
| # | Name | Scope | Dependencies | Status | Key Outputs |
|---|------|-------|-------------|--------|-------------|
| M1 | Frontend Lazy GPS Load | Update `frontend-user/src/pages/HomePage.jsx` to remove auto-GPS and zone blocking | None | DONE | `frontend-user/src/pages/HomePage.jsx` updated, build passed, gate approved |
| M2 | Supabase PostGIS Nearest Driver RPC | Create `setup_nearest_driver.sql` with schema extension, trigger, and `get_nearest_drivers` RPC; apply migration | None | READY | - |
| M3 | Proximity Verification & Test Runner | Create and run `test_proximity.js` verifying mathematical accuracy and ordering without radius cutoff | M2 | PLANNED | - |

## Interface Contracts

### Frontend (`frontend-user/src/pages/HomePage.jsx`)
- State: `activeServices` initialized from `SERVICES` with default enabled status.
- Services toggled only via `globalFlags` from Supabase `feature_flags`.
- No invocation of `navigator.geolocation` or `get_zone_for_location` during HomePage render.

### Supabase PostGIS RPC Contract
- **Function**: `get_nearest_drivers(user_lat DOUBLE PRECISION, user_lng DOUBLE PRECISION, target_vehicle_type TEXT DEFAULT NULL, only_online BOOLEAN DEFAULT true, max_results INT DEFAULT 10)`
- **Alias**: `find_nearest_drivers(lat DOUBLE PRECISION, lng DOUBLE PRECISION, target_vehicle_type TEXT DEFAULT NULL, only_online BOOLEAN DEFAULT true, max_results INT DEFAULT 10)`
- **Returns**:
  ```sql
  TABLE (
    id UUID,
    name TEXT,
    phone TEXT,
    vehicle_type VARCHAR,
    vehicle_plate VARCHAR,
    rating DECIMAL,
    status VARCHAR,
    is_online BOOLEAN,
    lat DOUBLE PRECISION,
    lng DOUBLE PRECISION,
    distance_meters DOUBLE PRECISION
  )
  ```
- **Distance Formula**: `ST_Distance(location, ST_SetSRID(ST_MakePoint(user_lng, user_lat), 4326)::geography)`
- **Ordering**: `ORDER BY location <-> ST_SetSRID(ST_MakePoint(user_lng, user_lat), 4326)::geography ASC`

### Test Runner Contract (`test_proximity.js`)
- Executable via `node test_proximity.js` from workspace root.
- Exit code `0` on success, non-zero on failure.
- Self-contained environment parsing (`process.loadEnvFile('backend/.env')`).
- Strictly cleans up all mock records on exit.

## Code Layout
- `frontend-user/src/pages/HomePage.jsx`: Frontend home page service menus and location state (M1 DONE).
- `setup_nearest_driver.sql`: Database migration for PostGIS schema and RPC functions (M2).
- `test_proximity.js`: Verification test script verifying PostGIS nearest-neighbor matching against Haversine calculations (M3).
