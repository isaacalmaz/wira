# Changes Log: PostGIS Backend & Proximity Verification (Milestones M2 & M3)

**Author**: `worker_proximity_1` (PostGIS Backend & Test Verification Worker)  
**Date**: 2026-09-12T13:57:00Z  
**Target Milestone**: M2 & M3  

---

## 1. File Changes Summary

| File | Status | Description of Changes |
|---|---|---|
| `setup_nearest_driver.sql` | Modified | Applied 6 challenger improvements: WGS84 bounds validation, negative LIMIT clamping, state-aware trigger with `IS DISTINCT FROM` and coordinate bounds, default vehicle type filter alignment, spatial backfill migration, and GiST-indexed `<->` ordering directly on `d.location`. |
| `apply_nearest_driver.js` | Modified | Added 6 new static validation checks (total 20 checks) validating the new safety and optimization patterns. |
| `test_proximity.js` | Created | New standalone test script with zero external dependencies, native env loading, Supabase client integration, pure JS Haversine calculator, 5 graduated mock drivers across Lombok, and 5-point verification assertions with deterministic teardown. |

---

## 2. Detailed Technical Modifications

### 2.1 `setup_nearest_driver.sql`
1. **Trigger `sync_driver_location()` State-Aware Synchronization**:
   - Replaced naive `IF NEW.lat IS NOT NULL` with `TG_OP = 'UPDATE'` evaluation.
   - Handled explicit `NEW.location` update when scalar `lat/lng` are unchanged using `NEW.location IS DISTINCT FROM OLD.location`.
   - Prevented coordinate resurrection when setting `lat = NULL, lng = NULL`.
   - Enforced coordinate boundary validation before PostGIS geography casting (`lat ∈ [-90, 90]` and `lng ∈ [-180, 180]`).
2. **Backfill Existing Coordinates**:
   - Added `UPDATE public.drivers SET location = ST_SetSRID(ST_MakePoint(lng, lat), 4326)::geography WHERE location IS NULL AND lat IS NOT NULL AND lng IS NOT NULL;`.
3. **RPC `get_nearest_drivers` Coordinate Bounds Guard**:
   - Validated `IF user_lat IS NULL OR user_lng IS NULL THEN RETURN; END IF;`.
   - Validated `IF user_lat < -90.0 OR user_lat > 90.0 OR user_lng < -180.0 OR user_lng > 180.0 THEN RETURN; END IF;`.
   - Return empty table gracefully rather than raising PostGIS SQLSTATE `22003`.
4. **GiST Index Utilization in KNN Ordering**:
   - Replaced `COALESCE(d.location, ST_SetSRID(...)) <-> u_point` with direct `d.location <-> u_point ASC`.
   - Filtered `AND d.location IS NOT NULL` in `WHERE` clause.
5. **Vehicle Type Filter Alignment**:
   - Aligned `WHERE` filter with projection default: `AND (target_vehicle_type IS NULL OR target_vehicle_type = '' OR COALESCE(d.vehicle_type, 'motor') = target_vehicle_type)`.
6. **Result Limit Clamping**:
   - Guarded `max_results` against negative inputs: `LIMIT LEAST(GREATEST(COALESCE(max_results, 10), 1), 100);`.

### 2.2 `apply_nearest_driver.js`
- Added static validation test cases:
  - `COORD_BOUNDS`: WGS84 range check in `get_nearest_drivers`
  - `LIMIT_CLAMP`: `LEAST/GREATEST` limit guard
  - `TRIGGER_DISTINCT`: `IS DISTINCT FROM` logic in trigger
  - `VEHICLE_FILTER_ALIGN`: `COALESCE(d.vehicle_type, 'motor') = target_vehicle_type`
  - `BACKFILL_LOCATION`: Migration backfill statement
  - `GIST_ORDER_BY`: Direct `d.location <-> u_point ASC` ordering
- Total static validation score: **20/20 PASS**.

### 2.3 `test_proximity.js`
- **Zero External Dependencies**: Uses `process.loadEnvFile('backend/.env')` with fallback regex parser.
- **Reference Coordinates**:
  - User at Mataram Mall (`-8.5866, 116.1158`)
  - Driver 1 (Epicentrum Mall): `-8.5939, 116.1132` (~860m)
  - Driver 2 (Unram): `-8.5901, 116.0963` (~2.18km)
  - Driver 3 (Senggigi Beach): `-8.4950, 116.0461` (~12.7km)
  - Driver 4 (Bandara BIL Praya): `-8.7610, 116.2755` (~25.8km)
  - Driver 5 (Sembalun Rinjani): `-8.3500, 116.5000` (~50.5km)
- **Mathematical Formula**: Implemented pure JavaScript Haversine formula ($R = 6,371,000\text{ m}$) as ground truth.
- **5 Rigorous Verification Assertions**:
  1. A1: Execution success and return of all candidate driver records.
  2. A2: Strict monotonic ascending distance ordering ($d_i \le d_{i+1}$).
  3. A3: 100% Rank concordance with mathematical Haversine ranking.
  4. A4: PostGIS distance matches WGS84 geodesic within $<1\%$ tolerance (observed max delta: $0.463\%$).
  5. A5: Absence of radius cutoff (both 26km and 50km drivers successfully returned).
- **Resilience & Cleanup**: Deterministic teardown in a `finally` block ensuring zero orphaned mock data.

---

## 3. Verification Commands & Results
- `node apply_nearest_driver.js` -> Exit code `0` (Score: 20/20 PASS)
- `node test_proximity.js` -> Exit code `0` (All 5/5 assertions PASS)
- `node .agents/challenger_backend_1/adversarial_test.js` -> Exit code `0` (16/16 checks PASS)
- `node .agents/challenger_backend_1/test_mitigation.js` -> Exit code `0` (All checks PASS)
- `npm run lint` -> Exit code `0`
- `npm run build` -> Exit code `0` (Vite build succeeded)
