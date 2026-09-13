#!/usr/bin/env node
/**
 * apply_nearest_driver.js
 * 
 * Tool for validating, inspecting, and testing Requirement R2:
 * "Sistem Pencocokan Driver Terdekat (PostGIS Nearest Neighbor)"
 * 
 * Features:
 * 1. Static validation of setup_nearest_driver.sql syntax, PostGIS operators, coordinate orders, and security definitions.
 * 2. Live Supabase database inspection (PostGIS extension, drivers table schema, RPC availability).
 * 3. Functional RPC execution test with mock spatial coordinates if applied.
 * 4. Step-by-step operator guide for applying the migration in Supabase SQL Editor.
 */

const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

// 1. Zero-dependency environment loader
function loadEnvironment() {
  const envCandidates = [
    path.resolve(__dirname, 'backend/.env'),
    path.resolve(__dirname, '.env'),
    path.resolve(__dirname, 'frontend-user/.env'),
    path.resolve(__dirname, 'frontend-mitra/.env')
  ];

  if (typeof process.loadEnvFile === 'function') {
    for (const envFile of envCandidates) {
      if (fs.existsSync(envFile)) {
        try { process.loadEnvFile(envFile); } catch (_) {}
      }
    }
  }

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
}

// 2. Static SQL Analysis
function validateSqlFile(sqlPath) {
  console.log('\n======================================================');
  console.log('1. VALIDATING SQL MIGRATION: setup_nearest_driver.sql');
  console.log('======================================================');

  if (!fs.existsSync(sqlPath)) {
    throw new Error(`SQL file not found at: ${sqlPath}`);
  }

  const sql = fs.readFileSync(sqlPath, 'utf8');
  const checks = [
    {
      id: 'POSTGIS_EXT',
      name: 'PostGIS extension activation',
      test: /CREATE\s+EXTENSION\s+IF\s+NOT\s+EXISTS\s+postgis/i
    },
    {
      id: 'COL_LAT',
      name: 'Add lat column (DOUBLE PRECISION)',
      test: /ALTER\s+TABLE\s+public\.drivers\s+ADD\s+COLUMN\s+IF\s+NOT\s+EXISTS\s+lat\s+DOUBLE\s+PRECISION/i
    },
    {
      id: 'COL_LNG',
      name: 'Add lng column (DOUBLE PRECISION)',
      test: /ALTER\s+TABLE\s+public\.drivers\s+ADD\s+COLUMN\s+IF\s+NOT\s+EXISTS\s+lng\s+DOUBLE\s+PRECISION/i
    },
    {
      id: 'COL_LOCATION',
      name: 'Add location column (GEOGRAPHY Point, 4326)',
      test: /ALTER\s+TABLE\s+public\.drivers\s+ADD\s+COLUMN\s+IF\s+NOT\s+EXISTS\s+location\s+GEOGRAPHY\s*\(\s*Point\s*,\s*4326\s*\)/i
    },
    {
      id: 'GIST_INDEX',
      name: 'GiST spatial index on drivers.location',
      test: /CREATE\s+INDEX\s+IF\s+NOT\s+EXISTS\s+idx_drivers_location_gist\s+ON\s+public\.drivers\s+USING\s+GIST\s*\(\s*location\s*\)/i
    },
    {
      id: 'SYNC_TRIGGER',
      name: 'Coordinate sync function & trigger (Longitude=X, Latitude=Y)',
      test: /ST_MakePoint\s*\(\s*NEW\.lng\s*,\s*NEW\.lat\s*\)/i
    },
    {
      id: 'RPC_GET_NEAREST',
      name: 'get_nearest_drivers RPC definition',
      test: /CREATE\s+OR\s+REPLACE\s+FUNCTION\s+get_nearest_drivers/i
    },
    {
      id: 'KNN_OPERATOR',
      name: 'PostGIS KNN operator (<->) used for nearest sorting',
      test: /<->\s*u_point\s+ASC/i
    },
    {
      id: 'ST_DISTANCE',
      name: 'PostGIS ST_Distance calculation on WGS84 geography',
      test: /ST_Distance\s*\(/i
    },
    {
      id: 'NO_RADIUS_LIMIT',
      name: 'Unbounded distance search (No ST_DWithin cutoff in WHERE clause)',
      test: (s) => !/ST_DWithin/i.test(s)
    },
    {
      id: 'RPC_ALIAS',
      name: 'find_nearest_drivers convenience alias',
      test: /CREATE\s+OR\s+REPLACE\s+FUNCTION\s+find_nearest_drivers/i
    },
    {
      id: 'RLS_POLICIES',
      name: 'Row Level Security policy for drivers read',
      test: /CREATE\s+POLICY\s+"Public can view online active drivers"/i
    },
    {
      id: 'GRANTS',
      name: 'Execute permission granted to anon, authenticated, and service_role',
      test: /GRANT\s+EXECUTE\s+ON\s+FUNCTION\s+get_nearest_drivers/i
    },
    {
      id: 'COMPAT_VIEW',
      name: 'Backward-compatible driver_locations view',
      test: /CREATE\s+OR\s+REPLACE\s+VIEW\s+public\.driver_locations/i
    },
    {
      id: 'COORD_BOUNDS',
      name: 'Coordinate bounds validation in get_nearest_drivers (WGS84 range check)',
      test: /user_lat\s*<\s*-90[\s\S]*user_lat\s*>\s*90[\s\S]*user_lng\s*<\s*-180[\s\S]*user_lng\s*>\s*180/i
    },
    {
      id: 'LIMIT_CLAMP',
      name: 'Negative & overflow limit clamping (LEAST/GREATEST guard)',
      test: /LIMIT\s+LEAST\s*\(\s*GREATEST\s*\(\s*COALESCE\s*\(\s*max_results/i
    },
    {
      id: 'TRIGGER_DISTINCT',
      name: 'Trigger location sync uses IS DISTINCT FROM to avoid overwriting',
      test: /NEW\.location\s+IS\s+DISTINCT\s+FROM\s+OLD\.location/i
    },
    {
      id: 'VEHICLE_FILTER_ALIGN',
      name: 'Vehicle type filter alignment with COALESCE default',
      test: /COALESCE\s*\(\s*d\.vehicle_type\s*,\s*'motor'\s*\)\s*=\s*target_vehicle_type/i
    },
    {
      id: 'BACKFILL_LOCATION',
      name: 'Spatial backfill migration for existing driver lat/lng rows',
      test: /UPDATE\s+public\.drivers\s+SET\s+location\s+=\s+ST_SetSRID\s*\(\s*ST_MakePoint\s*\(\s*lng\s*,\s*lat\s*\)/i
    },
    {
      id: 'GIST_ORDER_BY',
      name: 'GiST-indexable KNN ordering directly on d.location',
      test: /ORDER\s+BY\s+d\.location\s+<->\s+u_point\s+ASC/i
    }
  ];

  let passed = 0;
  for (const c of checks) {
    const isOk = typeof c.test === 'function' ? c.test(sql) : c.test.test(sql);
    if (isOk) {
      console.log(`  [PASS] ${c.name}`);
      passed++;
    } else {
      console.error(`  [FAIL] ${c.name}`);
    }
  }

  console.log(`\nStatic Validation Score: ${passed}/${checks.length}`);
  if (passed !== checks.length) {
    throw new Error('Static SQL validation failed!');
  }
}

// 3. Live Database Audit & Invocation Test
async function auditLiveDatabase() {
  console.log('\n======================================================');
  console.log('2. AUDITING LIVE SUPABASE DATABASE STATE');
  console.log('======================================================');

  const supabaseUrl = process.env.SUPABASE_URL || 'https://yhxhcxgcjadchrjskozt.supabase.co';
  const serviceKey = process.env.SUPABASE_SERVICE_KEY;

  if (!serviceKey) {
    console.warn('WARNING: SUPABASE_SERVICE_KEY not found. Skipping live DB audit.');
    return;
  }

  console.log(`Supabase Host: ${supabaseUrl}`);
  const sb = createClient(supabaseUrl, serviceKey);

  // A. Check PostGIS via existing RPC
  try {
    const { data: zoneData, error: zoneErr } = await sb.rpc('get_zone_for_location', { lat: -8.5833, lng: 116.1167 });
    if (!zoneErr) {
      console.log('  [PASS] PostGIS extension is ACTIVE in database (verified via get_zone_for_location).');
    } else {
      console.log('  [WARN] get_zone_for_location returned:', zoneErr.message);
    }
  } catch (err) {
    console.log('  [WARN] PostGIS check error:', err.message);
  }

  // B. Check drivers table
  try {
    const { data: drivers, error: dErr } = await sb.from('drivers').select('*').limit(1);
    if (!dErr) {
      console.log('  [PASS] public.drivers table is accessible.');
      if (drivers && drivers.length > 0) {
        console.log('  Driver sample keys:', Object.keys(drivers[0]));
      }
    } else {
      console.error('  [FAIL] Error accessing public.drivers:', dErr.message);
    }
  } catch (err) {
    console.error('  [FAIL] Network/Client error accessing drivers:', err.message);
  }

  // C. Check get_nearest_drivers RPC
  console.log('\nTesting get_nearest_drivers RPC execution...');
  try {
    const { data, error } = await sb.rpc('get_nearest_drivers', {
      user_lat: -8.5866,
      user_lng: 116.1158,
      max_results: 5
    });

    if (!error) {
      console.log('  [LIVE READY] RPC get_nearest_drivers is DEPLOYED and ACTIVE!');
      console.log(`  RPC returned ${data.length} driver(s).`);
      if (data.length > 0) {
        console.log('  First match sample:', data[0]);
      }
      // Also test find_nearest_drivers alias
      const { data: aliasData, error: aliasErr } = await sb.rpc('find_nearest_drivers', {
        lat: -8.5866,
        lng: 116.1158,
        max_results: 5
      });
      if (!aliasErr) {
        console.log('  [LIVE READY] Alias find_nearest_drivers is also DEPLOYED and ACTIVE!');
      }
    } else {
      if (error.message && error.message.includes('Could not find the function')) {
        console.log('  [PENDING DEPLOYMENT] Function get_nearest_drivers is not yet applied in Supabase.');
        printDeploymentInstructions();
      } else {
        console.log('  RPC response note:', error.message);
      }
    }
  } catch (err) {
    console.log('  RPC test network error:', err.message);
  }
}

function printDeploymentInstructions() {
  console.log('\n======================================================');
  console.log('3. SUPABASE SQL EDITOR DEPLOYMENT GUIDE');
  console.log('======================================================');
  console.log('To apply the migration in Supabase:');
  console.log('1. Open your browser and navigate to:');
  console.log('   https://supabase.com/dashboard/project/yhxhcxgcjadchrjskozt/sql');
  console.log('2. Click "New Query".');
  console.log('3. Paste the contents of "setup_nearest_driver.sql" into the editor.');
  console.log('4. Click "Run" (Green button).');
  console.log('5. Re-run "node apply_nearest_driver.js" to verify live status.');
  console.log('======================================================\n');
}

async function main() {
  loadEnvironment();
  const sqlPath = path.resolve(__dirname, 'setup_nearest_driver.sql');
  validateSqlFile(sqlPath);
  await auditLiveDatabase();
  console.log('\n[SUCCESS] Milestone M2 setup_nearest_driver.sql validation complete.');
}

main().catch((err) => {
  console.error('\n[FATAL ERROR]', err.message);
  process.exit(1);
});
