# Handoff Report: Milestone M2 Adversarial Review (PostGIS Schema, Trigger, & RPC)

**Author**: `challenger_backend_2` (Backend Challenger / Empirical Critic)  
**Recipient**: `parent` (Orchestrator Agent `33d8d42c-8936-412f-bec0-5f5aca64e47b`)  
**Date**: 2026-09-12T13:45:00Z  
**Type**: Hard Handoff (Adversarial Assessment Complete)  
**Verdict**: **REQUEST_CHANGES**

---

## 1. Observation

1. **Trigger `sync_driver_location` Implementation (`setup_nearest_driver.sql` lines 33–55)**:
   ```sql
   CREATE OR REPLACE FUNCTION sync_driver_location()
   RETURNS TRIGGER AS $$
   BEGIN
       -- Skenario A: Update berbasis koordinat skalar lat & lng (misal dari payload REST/JSON)
       IF NEW.lat IS NOT NULL AND NEW.lng IS NOT NULL THEN
           NEW.location := ST_SetSRID(ST_MakePoint(NEW.lng, NEW.lat), 4326)::geography;
       -- Skenario B: Update berbasis objek geografi location langsung
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

2. **Trigger Behavior on `UPDATE location`**:
   - In PostgreSQL, for any `UPDATE public.drivers SET location = ... WHERE id = ...;`, columns not listed in the `SET` statement retain their current values (`NEW.lat = OLD.lat`, `NEW.lng = OLD.lng`).
   - If a driver row already has non-null coordinates (e.g. `lat = -8.5833, lng = 116.1167`), the trigger's first condition `IF NEW.lat IS NOT NULL AND NEW.lng IS NOT NULL` evaluates to `TRUE`.
   - The trigger executes `NEW.location := ST_SetSRID(ST_MakePoint(NEW.lng, NEW.lat), 4326)::geography;`, which re-calculates `location` from `OLD.lng` and `OLD.lat`.
   - The caller's new `location` is completely overwritten and reverted to the old coordinates. `ELSIF NEW.location IS NOT NULL` is dead code for any existing driver.

3. **Trigger Behavior on Coordinate Deletion / Nullification**:
   - Executing `UPDATE public.drivers SET lat = NULL, lng = NULL WHERE id = ...;`:
   - `NEW.lat` and `NEW.lng` are null, so `Skenario A` is false.
   - `NEW.location` retains `OLD.location`, so `ELSIF NEW.location IS NOT NULL` fires and executes:
     `NEW.lng := ST_X(NEW.location::geometry); NEW.lat := ST_Y(NEW.location::geometry);`.
   - The trigger resurrects `lat` and `lng` from `OLD.location`. Coordinates cannot be cleared.

4. **Vehicle Type Filter in `get_nearest_drivers` (`setup_nearest_driver.sql` lines 101 & 121)**:
   - Line 101 projects: `COALESCE(d.vehicle_type, 'motor')::TEXT AS vehicle_type`.
   - Line 121 filters: `AND (target_vehicle_type IS NULL OR target_vehicle_type = '' OR d.vehicle_type = target_vehicle_type)`.
   - When a driver row has `vehicle_type = NULL`:
     - If `target_vehicle_type = NULL` or `''`, the driver is returned with `vehicle_type = 'motor'`.
     - If `target_vehicle_type = 'motor'`, the driver is excluded because `d.vehicle_type = 'motor'` evaluates to `NULL = 'motor'` which is `FALSE`.

5. **GiST Spatial Index Bypassing in `ORDER BY` clause (`setup_nearest_driver.sql` lines 22–23 & 122–123)**:
   - Spatial index: `CREATE INDEX IF NOT EXISTS idx_drivers_location_gist ON public.drivers USING GIST (location);`.
   - Ordering clause in `get_nearest_drivers`:
     `ORDER BY COALESCE(d.location, ST_SetSRID(ST_MakePoint(d.lng, d.lat), 4326)::geography) <-> u_point ASC`.
   - PostgreSQL cannot use an index on `location` for KNN ordering when `location` is wrapped inside `COALESCE(...)`. This forces a sequential scan (`Seq Scan`) and heap sort instead of an index scan (`Index Scan using idx_drivers_location_gist`).

6. **Empirical Test Suite Execution (`adversarial_test.js`)**:
   - Command: `node .agents/challenger_backend_2/adversarial_test.js`
   - Output summary:
     ```
     TEST RESULTS SUMMARY: 11 passed, 4 failed out of 15 tests
     FINAL VERDICT: REQUEST_CHANGES
     ```

---

## 2. Logic Chain

1. **Trigger Flaw Analysis**:
   - Observation 1 & 2 demonstrate that the trigger does not inspect `TG_OP` or compare `NEW` vs `OLD` (`IS DISTINCT FROM`).
   - On an update where only `location` is updated, `NEW.lat` and `NEW.lng` are populated from `OLD`. Because `NEW.lat IS NOT NULL AND NEW.lng IS NOT NULL` is checked first, `NEW.location` is overwritten with the old coordinates, completely neutralizing the caller's update.
   - Observation 3 shows that attempts to set `lat = NULL, lng = NULL` cause the trigger to fall through to `ELSIF NEW.location IS NOT NULL` and re-populate `lat` and `lng` from the stale `location`.

2. **Vehicle Filtering Discrepancy**:
   - Observation 4 demonstrates an asymmetry between the SELECT projection (`COALESCE(d.vehicle_type, 'motor')`) and the WHERE clause (`d.vehicle_type = target_vehicle_type`).
   - Drivers with `NULL` vehicle types are treated as `'motor'` when unfiltered, but disappeared when explicitly filtered by `'motor'`.

3. **Performance & Query Optimization Breakdown**:
   - Observation 5 shows the KNN query orders by `COALESCE(d.location, ST_SetSRID(...)) <-> u_point`.
   - In PostgreSQL, functional wrappers around indexed columns disable index usage unless a dedicated expression index exists.
   - Because the trigger maintains `d.location` consistently, `d.location` is guaranteed to be non-null for active drivers with coordinates. Ordering directly by `d.location <-> u_point ASC` enables the PostgreSQL planner to use `idx_drivers_location_gist` with $O(\log N)$ KNN traversal.

---

## 3. Caveats

- In Supabase Cloud, custom DDL migrations are executed through the Supabase Dashboard SQL Editor rather than PostgREST REST API.
- The adversarial test harness simulated PostgreSQL trigger and query filter mechanics in Node.js; the behavior of `BEFORE UPDATE` triggers and index suppression on `COALESCE` expressions is standard PostgreSQL engine specification.

---

## 4. Conclusion & Required Changes

Verdict: **REQUEST_CHANGES**

The following fixes must be applied to `/Users/ishakalmaazi/.gemini/antigravity/scratch/wira/setup_nearest_driver.sql`:

### Required Change 1: Robust Trigger Implementation
Replace `sync_driver_location()` with a state-aware trigger using `TG_OP` and `IS DISTINCT FROM`:
```sql
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
                NEW.location := ST_SetSRID(ST_MakePoint(NEW.lng, NEW.lat), 4326)::geography;
            ELSE
                NEW.location := NULL;
            END IF;
        -- Skenario C: Keduanya diubah atau fallback
        ELSIF NEW.lat IS NOT NULL AND NEW.lng IS NOT NULL THEN
            NEW.location := ST_SetSRID(ST_MakePoint(NEW.lng, NEW.lat), 4326)::geography;
        ELSIF NEW.location IS NOT NULL THEN
            NEW.lng := ST_X(NEW.location::geometry);
            NEW.lat := ST_Y(NEW.location::geometry);
        END IF;
    ELSE -- TG_OP = 'INSERT'
        IF NEW.lat IS NOT NULL AND NEW.lng IS NOT NULL THEN
            NEW.location := ST_SetSRID(ST_MakePoint(NEW.lng, NEW.lat), 4326)::geography;
        ELSIF NEW.location IS NOT NULL THEN
            NEW.lng := ST_X(NEW.location::geometry);
            NEW.lat := ST_Y(NEW.location::geometry);
        END IF;
    END IF;

    NEW.updated_at := NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
```

### Required Change 2: Consistent Vehicle Filtering
In `get_nearest_drivers`, align the WHERE clause with the default vehicle type:
```sql
AND (target_vehicle_type IS NULL OR target_vehicle_type = '' OR COALESCE(d.vehicle_type, 'motor') = target_vehicle_type)
```

### Required Change 3: GiST Indexable KNN Ordering
In `get_nearest_drivers`, order directly by the indexed `location` column:
```sql
ORDER BY 
    d.location <-> u_point ASC
```

---

## 5. Verification Method

1. Run the adversarial test suite:
   ```bash
   node .agents/challenger_backend_2/adversarial_test.js
   ```
2. Invalidation Condition:
   - If `adversarial_test.js` exits with code 1 or any of the 4 critical findings remain unaddressed in `setup_nearest_driver.sql`.
