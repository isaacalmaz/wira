# Deep Technical Analysis: PostGIS Proximity Test Verification Script (`test_proximity.js`)

**Target Requirement**: R3 — Bukti Verifikasi (Test Script)  
**Agent**: `explorer_test_1` (Test Verification Explorer)  
**Date**: 2026-09-12  
**Context**: Transition from Strict Geofencing to PostGIS Proximity-Based Matching in Wira  

---

## 1. Executive Summary

Requirement R3 mandates:
> *"Bukti Verifikasi (Test Script): Tim agen harus menyertakan skrip simulasi (misal: test_proximity.js) di root folder yang secara otomatis memasukkan beberapa koordinat driver palsu dan menguji apakah RPC benar-benar mereturn daftar driver dengan urutan jarak yang tepat secara matematis."*

This investigation analyzed the repository's test/utility scripts, runtime environment, Supabase credentials, PostGIS spatial queries, and mathematical validation models. 

### Key Discoveries & Recommendations:
1. **Runtime Dependency Hazard**: Existing test scripts in root (`test_contains.js`, `test_select.js`, etc.) crash with `MODULE_NOT_FOUND` because they require `dotenv`, which is NOT installed in root `node_modules` (it only exists inside `backend/node_modules`). `test_proximity.js` must be strictly self-contained using zero external dependencies for env parsing, leveraging Node.js native capabilities (Node v24.20.0 supports `process.loadEnvFile` or regex-based `.env` reading).
2. **Supabase Client Credentials**: `backend/.env` contains `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_KEY`. For testing, `SUPABASE_SERVICE_KEY` should be prioritized over `ANON_KEY` because it bypasses Row-Level Security (RLS), guaranteeing test isolation, clean mock data insertion, and deterministic teardown.
3. **Database Schema & Foreign Key Constraints**: In `master_schema.sql`, `users.id` strictly references `auth.users(id)`. Attempting to seed mock drivers into `driver_profiles` or `users` directly via SQL or Supabase REST will fail foreign key constraint checks unless mock auth accounts are created. Therefore, Requirement R2 must introduce a dedicated `driver_locations` table (or decoupled spatial columns) that allows transient driver coordinate updates and test seeding without polluting `auth.users`.
4. **Mathematical Verification Ground Truth**: PostGIS `geography(Point, 4326)` calculates ellipsoidal distance on the WGS84 spheroid in meters (`ST_Distance`). `test_proximity.js` will compute independent mathematical ground truth using the great-circle Haversine formula in pure JavaScript. Because the WGS84 ellipsoid and spherical Haversine diverge by at most ~0.2-0.4% around Lombok's latitude (~-8.5°), the test script can assert both **100% strict monotonic rank matching** and **distance numerical accuracy within 1% tolerance**.
5. **Proving "No Absolute Radius Limit"**: Requirement R2 requires matching *"tanpa batasan radius mutlak"*. The test dataset must include mock drivers placed at varying distances: ~320m, ~860m, ~1.9km, ~13.2km, ~25.8km (Lombok Airport), and ~50.5km (Sembalun Rinjani). Verifying that drivers at 25km and 50km are returned proves that no arbitrary 5km/10km geofencing or `ST_DWithin` threshold is silently dropping distant drivers.
6. **Execution Resilience**: The script must provide clean idempotency (pre-cleaning and post-cleanup in `finally` blocks) and graceful error diagnostics if executed in offline or sandbox environments.

---

## 2. Codebase & Existing Test Scripts Audit

An exhaustive audit of root scripts was conducted:

| Script | Purpose | Mechanism | Observations & Deficiencies |
|---|---|---|---|
| `test_contains.js` | Test JSON contains query | `require('@supabase/supabase-js')`, `require('dotenv')` | **Broken**. Throws `Cannot find module 'dotenv'`. Uses hardcoded path `/Users/.../frontend-user/.env`. |
| `test_select.js` | Test user selection | `require('@supabase/supabase-js')`, `require('dotenv')` | **Broken**. Throws `Cannot find module 'dotenv'`. |
| `test_signup.js` | Test user registration | `require('@supabase/supabase-js')`, `require('dotenv')` | **Broken**. Throws `Cannot find module 'dotenv'`. |
| `apply_sql.js` | SQL executor stub | `require('dotenv')` | Incomplete stub; cannot execute DDL with anon key. |
| `seed_from_data.js` | Seeding script | ESM `import * as dotenv from 'dotenv'` | Incompatible with CommonJS root (`package.json` lacks `"type": "module"`). |
| `create_mock_users.js`| Seed auth users | `require('dotenv')` | Uses hardcoded path to `frontend-mitra/.env`. |
| `check_db.js` | Query `vehicles` | `require('dotenv')` | Throws `Cannot find module 'dotenv'`. |

### Critical Root Environment Observations:
1. `node_modules` at root contains:
   - `@supabase/supabase-js` (Installed & working: `^2.x`)
   - `@turf/*` packages (`@turf/distance` is present, but pure JS Haversine is even lighter with zero import overhead)
   - Symlinks to workspaces: `wira-backend`, `wira-frontend-user`, `wira-mitra`, `wira-admin`
2. Missing at root: `dotenv`.
3. Node Version: **Node.js v24.20.0**.
   - Supports `process.loadEnvFile()` natively.
   - Supports CommonJS `require()`.

---

## 3. Supabase Credentials & Client Initialization

### Location of Credentials
1. `backend/.env`:
   - `SUPABASE_URL=https://yhxhcxgcjadchrjskozt.supabase.co`
   - `SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...`
   - `SUPABASE_SERVICE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...`
2. `frontend-user/src/config/supabase.js`:
   - Contains fallback hardcoded URL and Anon Key.

### Zero-Dependency Environment Loader
To ensure `node test_proximity.js` never fails due to missing environment modules, the script must implement a native loader:
```javascript
const fs = require('fs');
const path = require('path');

function getSupabaseConfig() {
  const envCandidates = [
    path.resolve(__dirname, 'backend/.env'),
    path.resolve(__dirname, '.env'),
    path.resolve(__dirname, 'frontend-user/.env'),
    path.resolve(__dirname, 'frontend-mitra/.env')
  ];

  // Try native Node.js process.loadEnvFile first
  if (typeof process.loadEnvFile === 'function') {
    for (const envFile of envCandidates) {
      if (fs.existsSync(envFile)) {
        try { process.loadEnvFile(envFile); } catch (_) {}
      }
    }
  }

  // Fallback regex parser if process.loadEnvFile didn't populate
  for (const envFile of envCandidates) {
    if (fs.existsSync(envFile)) {
      try {
        const text = fs.readFileSync(envFile, 'utf8');
        for (const line of text.split('\n')) {
          const trimmed = line.trim();
          if (!trimmed || trimmed.startsWith('#')) continue;
          const idx = trimmed.indexOf('=');
          if (idx > 0) {
            const k = trimmed.slice(0, idx).trim();
            let v = trimmed.slice(idx + 1).trim();
            if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
              v = v.slice(1, -1);
            }
            if (!process.env[k]) process.env[k] = v;
          }
        }
      } catch (_) {}
    }
  }

  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || 'https://yhxhcxgcjadchrjskozt.supabase.co';
  const key = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;
  const isServiceKey = Boolean(process.env.SUPABASE_SERVICE_KEY);

  return { url, key, isServiceKey };
}
```

---

## 4. Database Schema & RPC Interface Contract

### Database Schema Considerations for R2 & R3
In `master_schema.sql`:
- `public.users(id)` is constrained to `REFERENCES auth.users(id) ON DELETE CASCADE`.
- `public.driver_profiles(user_id)` is constrained to `REFERENCES public.users(id) ON DELETE CASCADE UNIQUE`.

Because of this cascade constraint to `auth.users`, inserting mock driver records directly into `driver_profiles` or `users` requires either:
1. Creating fake users in `auth.users` via `supabase.auth.signUp()`, which triggers auth rate limits and leaves dirty accounts in Supabase Auth.
2. **Recommended Architectural Design (Contract with R2)**:
   Create a dedicated spatial table `public.driver_locations` for real-time driver coordinates:
   ```sql
   CREATE TABLE IF NOT EXISTS public.driver_locations (
       id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
       driver_id UUID,
       name TEXT NOT NULL,
       vehicle_type TEXT DEFAULT 'motor',
       lat DOUBLE PRECISION NOT NULL,
       lng DOUBLE PRECISION NOT NULL,
       location GEOGRAPHY(Point, 4326),
       is_online BOOLEAN DEFAULT true,
       updated_at TIMESTAMPTZ DEFAULT NOW()
   );

   CREATE INDEX IF NOT EXISTS idx_driver_locations_geog 
   ON public.driver_locations USING GIST (location);
   ```
   *Benefit*: Real-time GPS location telemetry is separated from static user profiles, preventing DB lock contention and table bloat on `users`. It also allows clean, decoupled mock testing.

### RPC Signature Contract: `get_nearest_drivers`
The Supabase PostGIS RPC must accept:
- `user_lat` (DOUBLE PRECISION / float8)
- `user_lng` (DOUBLE PRECISION / float8)
- `limit_count` (INTEGER, default 10)

SQL Implementation:
```sql
CREATE OR REPLACE FUNCTION get_nearest_drivers(
    user_lat DOUBLE PRECISION,
    user_lng DOUBLE PRECISION,
    limit_count INT DEFAULT 10
)
RETURNS TABLE (
    id UUID,
    name TEXT,
    vehicle_type TEXT,
    lat DOUBLE PRECISION,
    lng DOUBLE PRECISION,
    distance_meters DOUBLE PRECISION
) AS $$
DECLARE
    user_point GEOGRAPHY;
BEGIN
    -- NOTE: PostGIS ST_MakePoint takes (longitude, latitude)
    user_point := ST_SetSRID(ST_MakePoint(user_lng, user_lat), 4326)::geography;

    RETURN QUERY
    SELECT 
        dl.id,
        dl.name,
        dl.vehicle_type,
        dl.lat,
        dl.lng,
        ROUND(ST_Distance(dl.location, user_point)::numeric, 1)::double precision AS distance_meters
    FROM public.driver_locations dl
    WHERE dl.is_online = true
      AND dl.location IS NOT NULL
    ORDER BY dl.location <-> user_point ASC
    LIMIT limit_count;
END;
$$ LANGUAGE plpgsql;
```

---

## 5. Mathematical Ground Truth: Haversine Model

To verify that PostGIS distance calculations and ranking are mathematically accurate, the test script independently implements the Haversine formula:

$$\Delta\phi = \text{lat}_2 - \text{lat}_1, \quad \Delta\lambda = \text{lon}_2 - \text{lon}_1$$

$$a = \sin^2\left(\frac{\Delta\phi}{2}\right) + \cos(\phi_1)\cos(\phi_2)\sin^2\left(\frac{\Delta\lambda}{2}\right)$$

$$c = 2 \cdot \operatorname{atan2}\left(\sqrt{a}, \sqrt{1 - a}\right)$$

$$d = R \cdot c \quad (R = 6,371,000 \text{ m})$$

### JavaScript Implementation:
```javascript
function haversineDistanceMeters(lat1, lon1, lat2, lon2) {
  const R = 6371000; // Earth mean radius in meters
  const toRad = (deg) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}
```

---

## 6. Mock Driver Dataset & Expected Ground Truth

Reference User Coordinate:
- **Mataram Epicentrum Mall**: `lat: -8.5939, lng: 116.1132`

Mock Driver Distribution (verified by calculation):
```
1. Driver 1 (Super Dekat - Epicentrum Area):
   lat: -8.5910, lng: 116.1132 -> Expected Dist: ~322.5 m (0.32 km)
2. Driver 2 (Dekat - Mataram Mall Cokroaminoto):
   lat: -8.5866, lng: 116.1158 -> Expected Dist: ~860.6 m (0.86 km)
3. Driver 3 (Sedang - Universitas Mataram Majapahit):
   lat: -8.5901, lng: 116.0963 -> Expected Dist: ~1,905.5 m (1.91 km)
4. Driver 4 (Jauh - Senggigi Beach):
   lat: -8.4950, lng: 116.0461 -> Expected Dist: ~13,243.0 m (13.24 km)
5. Driver 5 (Sangat Jauh - Bandara Internasional Lombok Praya):
   lat: -8.7610, lng: 116.2755 -> Expected Dist: ~25,758.9 m (25.76 km)
6. Driver 6 (Ekstrem Jauh - Sembalun Lereng Rinjani):
   lat: -8.3500, lng: 116.5000 -> Expected Dist: ~50,450.4 m (50.45 km)
```

### Monotonic Relationship:
$$322.5\text{ m} < 860.6\text{ m} < 1,905.5\text{ m} < 13,243.0\text{ m} < 25,758.9\text{ m} < 50,450.4\text{ m}$$

---

## 7. Verification Assertions & Pass/Fail Criteria

The script must execute and report on 5 strict mathematical assertions:

| Assertion # | Assertion Name | Verification Criterion | Rationale |
|---|---|---|---|
| **A1** | RPC Call & Non-Empty Result | Returned rows > 0 and no Supabase error | Ensures PostGIS extension and RPC function exist and execute properly. |
| **A2** | Monotonic Ascending Order | `returned[i].distance <= returned[i+1].distance` for all $i$ | Guarantees results are sorted nearest-to-farthest. |
| **A3** | Mathematical Ranking Concordance | Order of driver names matches Haversine sorted order | Validates that PostGIS ordering matches spherical geometry ranking. |
| **A4** | Distance Value Accuracy | $\frac{\|d_{\text{postgis}} - d_{\text{haversine}}\|}{d_{\text{haversine}}} < 0.01$ (within 1%) | Confirms PostGIS returns meters (not degrees or miles) and calculates ellipsoidal distance within physical bounds. |
| **A5** | Absence of Radius Cap | Drivers at 25km and 50km are returned | Specifically proves compliance with *"tanpa batasan radius mutlak"*. |

---

## 8. Test Idempotency & Teardown Protocol

To ensure tests can be run repeatedly without polluting the database:
1. Each mock driver record contains a deterministic prefix or test run tag:
   `name: 'TEST_PROXIMITY_MOCK_' + index`
2. **Pre-test Cleanup**: Before inserting mock data, execute:
   `DELETE FROM driver_locations WHERE name LIKE 'TEST_PROXIMITY_MOCK_%'`
3. **Post-test Cleanup**: In a `finally` block:
   ```javascript
   finally {
     console.log('🧹 Cleaning up mock test records...');
     await supabase.from('driver_locations').delete().like('name', 'TEST_PROXIMITY_MOCK_%');
   }
   ```
4. If a test crashes, the next run cleans up any orphaned records.

---

## 9. Full Recommended Architecture for `test_proximity.js`

Here is the complete blueprint that the implementation worker agent can use to construct `test_proximity.js`:

```javascript
#!/usr/bin/env node

/**
 * ============================================================================
 * WIRA ECOSYSTEM: POSTGIS PROXIMITY VERIFICATION SCRIPT (test_proximity.js)
 * ============================================================================
 * Objective: Verify Requirement R3 & R2
 * - Automatically seed mock drivers across Lombok at varying distances
 * - Query PostGIS nearest driver RPC without arbitrary radius limits
 * - Verify mathematical accuracy and ranking against Haversine ground truth
 * - Clean up all test mock data to guarantee idempotency
 * ============================================================================
 */

const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

// 1. Zero-dependency configuration loader
function loadEnv() {
  const envFiles = [
    path.resolve(__dirname, 'backend/.env'),
    path.resolve(__dirname, '.env'),
    path.resolve(__dirname, 'frontend-user/.env'),
    path.resolve(__dirname, 'frontend-mitra/.env')
  ];

  if (typeof process.loadEnvFile === 'function') {
    for (const f of envFiles) {
      if (fs.existsSync(f)) {
        try { process.loadEnvFile(f); } catch (_) {}
      }
    }
  }

  for (const f of envFiles) {
    if (fs.existsSync(f)) {
      try {
        const text = fs.readFileSync(f, 'utf8');
        for (const line of text.split('\n')) {
          const trimmed = line.trim();
          if (!trimmed || trimmed.startsWith('#')) continue;
          const idx = trimmed.indexOf('=');
          if (idx > 0) {
            const k = trimmed.slice(0, idx).trim();
            let v = trimmed.slice(idx + 1).trim();
            if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
              v = v.slice(1, -1);
            }
            if (!process.env[k]) process.env[k] = v;
          }
        }
      } catch (_) {}
    }
  }

  return {
    supabaseUrl: process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || 'https://yhxhcxgcjadchrjskozt.supabase.co',
    supabaseKey: process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY
  };
}

// 2. Pure JavaScript Haversine distance calculator (meters)
function haversineDistanceMeters(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const toRad = (deg) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

// 3. Test Dataset
const USER_LOCATION = {
  name: 'Mataram Epicentrum Mall',
  lat: -8.5939,
  lng: 116.1132
};

const MOCK_DRIVERS = [
  { name: 'TEST_PROXIMITY_MOCK_1_Epicentrum_Dekat', lat: -8.5910, lng: 116.1132, vehicle_type: 'motor' },
  { name: 'TEST_PROXIMITY_MOCK_2_Mataram_Mall', lat: -8.5866, lng: 116.1158, vehicle_type: 'motor' },
  { name: 'TEST_PROXIMITY_MOCK_3_Unram', lat: -8.5901, lng: 116.0963, vehicle_type: 'mobil' },
  { name: 'TEST_PROXIMITY_MOCK_4_Senggigi', lat: -8.4950, lng: 116.0461, vehicle_type: 'mobil' },
  { name: 'TEST_PROXIMITY_MOCK_5_Bandara_BIL', lat: -8.7610, lng: 116.2755, vehicle_type: 'mobil' },
  { name: 'TEST_PROXIMITY_MOCK_6_Sembalun_Rinjani', lat: -8.3500, lng: 116.5000, vehicle_type: 'motor' }
];

async function main() {
  console.log('================================================================');
  console.log('🧭 WIRA POSTGIS PROXIMITY VERIFICATION SUITE');
  console.log('================================================================');
  console.log(`User Coordinate: [${USER_LOCATION.lat}, ${USER_LOCATION.lng}] (${USER_LOCATION.name})`);

  const { supabaseUrl, supabaseKey } = loadEnv();
  console.log(`Supabase Endpoint: ${supabaseUrl}`);
  const supabase = createClient(supabaseUrl, supabaseKey);

  // Compute expected mathematical ground truth
  const groundTruth = MOCK_DRIVERS.map((d) => ({
    ...d,
    expectedDistanceMeters: haversineDistanceMeters(USER_LOCATION.lat, USER_LOCATION.lng, d.lat, d.lng)
  })).sort((a, b) => a.expectedDistanceMeters - b.expectedDistanceMeters);

  console.log('\n[1/5] 📐 Calculated Mathematical Ground Truth (Haversine):');
  groundTruth.forEach((d, idx) => {
    console.log(`   ${idx + 1}. ${d.name} -> ${(d.expectedDistanceMeters / 1000).toFixed(2)} km (${d.expectedDistanceMeters.toFixed(1)} m)`);
  });

  try {
    // Clean stale data
    console.log('\n[2/5] 🧹 Cleaning stale mock records...');
    await supabase.from('driver_locations').delete().like('name', 'TEST_PROXIMITY_MOCK_%');

    // Seed mock drivers
    console.log('\n[3/5] 🌱 Seeding mock driver coordinates...');
    const seedPayload = MOCK_DRIVERS.map((d) => ({
      name: d.name,
      lat: d.lat,
      lng: d.lng,
      vehicle_type: d.vehicle_type,
      is_online: true
    }));

    const { error: insertErr } = await supabase.from('driver_locations').insert(seedPayload);
    if (insertErr) {
      throw new Error(`Failed to insert mock drivers: ${insertErr.message}`);
    }

    // Call PostGIS RPC
    console.log('\n[4/5] ⚡ Calling PostGIS RPC get_nearest_drivers...');
    const { data: results, error: rpcErr } = await supabase.rpc('get_nearest_drivers', {
      user_lat: USER_LOCATION.lat,
      user_lng: USER_LOCATION.lng,
      limit_count: 10
    });

    if (rpcErr) {
      throw new Error(`RPC get_nearest_drivers error: ${rpcErr.message}`);
    }

    // Filter down to test drivers
    const testResults = (results || []).filter((r) => r.name && r.name.startsWith('TEST_PROXIMITY_MOCK_'));

    console.log(`   Returned ${testResults.length} test drivers from RPC.`);

    // Assertions
    console.log('\n[5/5] 🔬 Executing Verification Assertions:');

    // A1: Non-empty
    if (testResults.length !== MOCK_DRIVERS.length) {
      throw new Error(`Assertion A1 FAILED: Expected ${MOCK_DRIVERS.length} drivers, got ${testResults.length}`);
    }
    console.log('   ✅ A1: All seeded mock drivers returned successfully.');

    // A2: Ascending order
    for (let i = 0; i < testResults.length - 1; i++) {
      if (testResults[i].distance_meters > testResults[i + 1].distance_meters) {
        throw new Error(`Assertion A2 FAILED: Driver ${testResults[i].name} (${testResults[i].distance_meters}m) is greater than next ${testResults[i + 1].name} (${testResults[i + 1].distance_meters}m)`);
      }
    }
    console.log('   ✅ A2: Strict monotonic ascending distance order verified.');

    // A3 & A4: Ground truth rank and distance accuracy
    console.log('\n   📊 Comparison Matrix (PostGIS vs Haversine Ground Truth):');
    console.log('   ' + '-'.repeat(78));
    console.log('   Rank | Driver Name                    | PostGIS (m) | Haversine (m) | Delta % | Status');
    console.log('   ' + '-'.repeat(78));

    for (let i = 0; i < testResults.length; i++) {
      const res = testResults[i];
      const truth = groundTruth[i];

      if (res.name !== truth.name) {
        throw new Error(`Assertion A3 FAILED: Expected rank ${i + 1} to be ${truth.name}, but got ${res.name}`);
      }

      const diff = Math.abs(res.distance_meters - truth.expectedDistanceMeters);
      const deltaPercent = (diff / truth.expectedDistanceMeters) * 100;

      if (deltaPercent > 1.0) {
        throw new Error(`Assertion A4 FAILED: Distance variance exceeds 1% for ${res.name} (Delta: ${deltaPercent.toFixed(2)}%)`);
      }

      console.log(
        `   ${String(i + 1).padStart(4)} | ` +
        `${res.name.padEnd(30)} | ` +
        `${res.distance_meters.toFixed(1).padStart(11)} | ` +
        `${truth.expectedDistanceMeters.toFixed(1).padStart(13)} | ` +
        `${deltaPercent.toFixed(2).padStart(6)}% | PASS`
      );
    }
    console.log('   ' + '-'.repeat(78));
    console.log('   ✅ A3: Exact ranking matches mathematical ground truth.');
    console.log('   ✅ A4: Distance values match WGS84 geodesic within < 1% error tolerance.');

    // A5: No radius limit check
    const hasDistantDriver = testResults.some((d) => d.name.includes('Sembalun_Rinjani'));
    if (!hasDistantDriver) {
      throw new Error('Assertion A5 FAILED: Distant driver (~50km) was excluded. Absolute radius cap detected!');
    }
    console.log('   ✅ A5: No absolute radius limit verified (~50km driver successfully returned).');

    console.log('\n🎉 ALL 5/5 VERIFICATION ASSERTIONS PASSED PERFECTLY!');
  } catch (err) {
    console.error(`\n❌ VERIFICATION TEST FAILED: ${err.message}`);
    process.exitCode = 1;
  } finally {
    console.log('\n🧹 Teardown: Removing test mock drivers...');
    try {
      await supabase.from('driver_locations').delete().like('name', 'TEST_PROXIMITY_MOCK_%');
      console.log('   Cleaned up successfully. Database restored.');
    } catch (cleanupErr) {
      console.warn(`   Cleanup warning: ${cleanupErr.message}`);
    }
  }
}

main();
```

---

## 10. Conclusion & Handoff Summary

Requirement R3 provides the definitive verification proof for the entire proximity transition. By adhering to:
1. Zero uninstalled runtime dependencies (native Node environment loading + native JS Haversine).
2. Clean separation of test mock coordinates via `driver_locations`.
3. 5-point rigorous mathematical assertion suite (including ranking, numerical tolerance, and radius absence proof).
4. Deterministic pre/post-execution cleanup.

The team has a complete, infallible blueprint ready for worker implementation.
