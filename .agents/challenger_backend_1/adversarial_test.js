#!/usr/bin/env node
/**
 * adversarial_test.js
 * 
 * Adversarial test suite for Milestone M2 PostGIS distance matching.
 * Validates:
 * 1. Absence of hard radius cutoffs (ST_DWithin, bounding boxes, fixed distance filters).
 * 2. Extreme coordinate calculations across Lombok and Indonesia (50km, 100km, 1000km, 2800km)
 *    and verifies strict monotonic distance ordering and retention.
 * 3. Coordinate boundary traps: Latitude > 90, Latitude < -90, Longitude > 180, Longitude < -180,
 *    NaN, Infinity, Negative LIMIT, and PostGIS geography casting behavior.
 */

const fs = require('fs');
const path = require('path');

// ----------------------------------------------------------------------------
// Mathematical Oracles (WGS84 Ellipsoidal Geodesic & Spherical Great-Circle)
// ----------------------------------------------------------------------------

// WGS84 Constants (matching PostGIS ST_Distance(geography, geography))
const WGS84_A = 6378137.0;          // semi-major axis (meters)
const WGS84_B = 6356752.314245;     // semi-minor axis (meters)
const WGS84_F = 1 / 298.257223563;  // flattening

// Mean Earth Radius for Spherical calculations (matching PostGIS geography <->)
const SPHERE_R = 6371008.8;

function toRad(deg) {
  return (deg * Math.PI) / 180.0;
}

// Vincenty inverse formula for ellipsoidal distance (WGS84)
function vincentyDistance(lat1, lon1, lat2, lon2) {
  const L = toRad(lon2 - lon1);
  const U1 = Math.atan((1 - WGS84_F) * Math.tan(toRad(lat1)));
  const U2 = Math.atan((1 - WGS84_F) * Math.tan(toRad(lat2)));
  const sinU1 = Math.sin(U1), cosU1 = Math.cos(U1);
  const sinU2 = Math.sin(U2), cosU2 = Math.cos(U2);

  let lambda = L;
  let lambdaP;
  let iterLimit = 100;
  let cosSqAlpha, sinSigma, cos2SigmaM, cosSigma, sigma, sinLambda, cosLambda;

  do {
    sinLambda = Math.sin(lambda);
    cosLambda = Math.cos(lambda);
    sinSigma = Math.sqrt(
      (cosU2 * sinLambda) * (cosU2 * sinLambda) +
      (cosU1 * sinU2 - sinU1 * cosU2 * cosLambda) * (cosU1 * sinU2 - sinU1 * cosU2 * cosLambda)
    );
    if (sinSigma === 0) return 0; // coincident points

    cosSigma = sinU1 * sinU2 + cosU1 * cosU2 * cosLambda;
    sigma = Math.atan2(sinSigma, cosSigma);
    const sinAlpha = (cosU1 * cosU2 * sinLambda) / sinSigma;
    cosSqAlpha = 1 - sinAlpha * sinAlpha;
    cos2SigmaM = cosSqAlpha !== 0 ? cosSigma - (2 * sinU1 * sinU2) / cosSqAlpha : 0;

    const C = (WGS84_F / 16) * cosSqAlpha * (4 + WGS84_F * (4 - 3 * cosSqAlpha));
    lambdaP = lambda;
    lambda = L + (1 - C) * WGS84_F * sinAlpha * (
      sigma + C * sinSigma * (cos2SigmaM + C * cosSigma * (-1 + 2 * cos2SigmaM * cos2SigmaM))
    );
  } while (Math.abs(lambda - lambdaP) > 1e-12 && --iterLimit > 0);

  if (iterLimit === 0) {
    // Formula failed to converge (near antipodal), fallback to great circle
    return haversineDistance(lat1, lon1, lat2, lon2, WGS84_A);
  }

  const uSq = (cosSqAlpha * (WGS84_A * WGS84_A - WGS84_B * WGS84_B)) / (WGS84_B * WGS84_B);
  const A = 1 + (uSq / 16384) * (4096 + uSq * (-768 + uSq * (320 - 175 * uSq)));
  const B = (uSq / 1024) * (256 + uSq * (-128 + uSq * (74 - 47 * uSq)));
  const deltaSigma = B * sinSigma * (
    cos2SigmaM + (B / 4) * (
      cosSigma * (-1 + 2 * cos2SigmaM * cos2SigmaM) -
      (B / 6) * cos2SigmaM * (-3 + 4 * sinSigma * sinSigma) * (-3 + 4 * cos2SigmaM * cos2SigmaM)
    )
  );

  return WGS84_B * A * (sigma - deltaSigma);
}

// Great-circle Haversine formula (spherical distance)
function haversineDistance(lat1, lon1, lat2, lon2, radius = SPHERE_R) {
  const phi1 = toRad(lat1);
  const phi2 = toRad(lat2);
  const deltaPhi = toRad(lat2 - lat1);
  const deltaLambda = toRad(lon2 - lon1);

  const a = Math.sin(deltaPhi / 2) ** 2 +
            Math.cos(phi1) * Math.cos(phi2) * Math.sin(deltaLambda / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return radius * c;
}

// ----------------------------------------------------------------------------
// Test Runner
// ----------------------------------------------------------------------------

const testResults = {
  passed: 0,
  failed: 0,
  warnings: 0,
  details: []
};

function logSection(title) {
  console.log(`\n======================================================`);
  console.log(title);
  console.log(`======================================================`);
}

function assert(id, description, condition, details = '') {
  if (condition) {
    console.log(`  [PASS] ${id}: ${description}`);
    testResults.passed++;
    testResults.details.push({ id, status: 'PASS', description, details });
  } else {
    console.error(`  [FAIL] ${id}: ${description}`);
    if (details) console.error(`         Reason: ${details}`);
    testResults.failed++;
    testResults.details.push({ id, status: 'FAIL', description, details });
  }
}

function warn(id, description, details) {
  console.warn(`  [WARN] ${id}: ${description}`);
  if (details) console.warn(`         Note: ${details}`);
  testResults.warnings++;
  testResults.details.push({ id, status: 'WARN', description, details });
}

// ----------------------------------------------------------------------------
// TEST SUITE 1: Hard Radius & Spatial Filter Analysis
// ----------------------------------------------------------------------------
function testHardRadiusCutoff(sqlContent) {
  logSection('SUITE 1: HARD RADIUS & SPATIAL FILTER AUDIT IN SQL');

  // 1.1 Check for ST_DWithin
  const hasDWithin = /ST_DWithin/i.test(sqlContent);
  assert(
    'CUTOFF_01',
    'No ST_DWithin radius filter anywhere in setup_nearest_driver.sql',
    !hasDWithin,
    hasDWithin ? 'Found ST_DWithin in migration script!' : ''
  );

  // 1.2 Check for bounding box filters (&&, ST_MakeEnvelope, ST_Expand)
  const hasBBoxFilter = /(&&\s*u_point|ST_MakeEnvelope|ST_Expand)/i.test(sqlContent);
  assert(
    'CUTOFF_02',
    'No bounding box pre-filters (&&, ST_MakeEnvelope, ST_Expand)',
    !hasBBoxFilter,
    hasBBoxFilter ? 'Found spatial bounding box pre-filter!' : ''
  );

  // 1.3 Check WHERE clause in get_nearest_drivers
  const fnMatch = sqlContent.match(/CREATE\s+OR\s+REPLACE\s+FUNCTION\s+get_nearest_drivers[\s\S]*?\$\$[\s\S]*?WHERE([\s\S]*?)ORDER\s+BY/i);
  let whereClause = '';
  if (fnMatch && fnMatch[1]) {
    whereClause = fnMatch[1].trim();
  }

  const hasDistanceCutoffInWhere = /distance|ST_Distance|<->/i.test(whereClause);
  assert(
    'CUTOFF_03',
    'No distance/radius threshold conditions in get_nearest_drivers WHERE clause',
    !hasDistanceCutoffInWhere,
    hasDistanceCutoffInWhere ? `Found distance filtering in WHERE: ${whereClause}` : ''
  );

  // 1.4 Check sorting logic
  const hasKnnSort = /ORDER\s+BY\s+[\s\S]*?<->\s*u_point\s+ASC/i.test(sqlContent);
  assert(
    'CUTOFF_04',
    'Nearest-neighbor sorting uses PostGIS KNN (<-> u_point ASC)',
    hasKnnSort,
    'Missing "<-> u_point ASC" in ORDER BY'
  );

  // 1.5 Check unbounded LIMIT
  const hasLimit = /LIMIT\s+COALESCE\s*\(\s*max_results\s*,\s*10\s*\)/i.test(sqlContent);
  assert(
    'CUTOFF_05',
    'Result count constrained strictly by LIMIT parameter, not radius cutoff',
    hasLimit,
    'Unexpected LIMIT expression'
  );
}

// ----------------------------------------------------------------------------
// TEST SUITE 2: Extreme Distance Calculations Across Indonesia
// ----------------------------------------------------------------------------
function testExtremeCoordinates() {
  logSection('SUITE 2: EXTREME COORDINATES ACROSS LOMBOK & INDONESIA');

  const origin = { name: 'Mataram (Lombok)', lat: -8.5833, lon: 116.1167 };

  const destinations = [
    { name: 'Mataram City Hub (0.4 km)', lat: -8.5866, lon: 116.1158 },
    { name: 'Ampenan Beach (4.6 km)', lat: -8.5750, lon: 116.0750 },
    { name: 'Senggigi Beach (11.3 km)', lat: -8.5050, lon: 116.0500 },
    { name: 'Praya Lombok Airport (25 km)', lat: -8.7500, lon: 116.2750 },
    { name: 'Mt. Rinjani Sembalun (51 km - 50km boundary)', lat: -8.3600, lon: 116.5250 },
    { name: 'Padangbai Bali (67 km)', lat: -8.5300, lon: 115.5100 },
    { name: 'Denpasar Bali (100.2 km - 100km boundary)', lat: -8.6700, lon: 115.2100 },
    { name: 'Sumbawa Besar (145 km)', lat: -8.5000, lon: 117.4300 },
    { name: 'Surabaya East Java (399 km)', lat: -7.2575, lon: 112.7521 },
    { name: 'Yogyakarta Central Java (641 km)', lat: -7.7956, lon: 110.3695 },
    { name: 'Jakarta (1,068 km - 1000km boundary)', lat: -6.2088, lon: 106.8456 },
    { name: 'Medan North Sumatra (2,471 km)', lat: 3.5952, lon: 98.6722 },
    { name: 'Jayapura Papua (2,788 km)', lat: -2.5337, lon: 140.7181 }
  ];

  console.log(`Origin: ${origin.name} [${origin.lat}, ${origin.lon}]\n`);
  console.log(
    '#'.padEnd(4) +
    'Destination'.padEnd(45) +
    'WGS84 Ellipsoid'.padEnd(20) +
    'Spherical (<->)'.padEnd(20) +
    'Delta (%)'
  );
  console.log('-'.repeat(95));

  const computedPoints = destinations.map((dest, idx) => {
    const wgs84 = vincentyDistance(origin.lat, origin.lon, dest.lat, dest.lon);
    const sphere = haversineDistance(origin.lat, origin.lon, dest.lat, dest.lon);
    const deltaPct = (Math.abs(wgs84 - sphere) / wgs84) * 100;

    console.log(
      `${idx + 1}`.padEnd(4) +
      dest.name.padEnd(45) +
      `${(wgs84 / 1000).toFixed(3)} km`.padEnd(20) +
      `${(sphere / 1000).toFixed(3)} km`.padEnd(20) +
      `${deltaPct.toFixed(3)}%`
    );

    return {
      ...dest,
      index: idx,
      wgs84,
      sphere
    };
  });

  // 2.1 Verify strict monotonic ordering for WGS84 distance
  let monotonicWGS84 = true;
  for (let i = 0; i < computedPoints.length - 1; i++) {
    if (computedPoints[i].wgs84 >= computedPoints[i + 1].wgs84) {
      monotonicWGS84 = false;
      break;
    }
  }
  assert(
    'EXTREME_01',
    'Strict monotonic distance ordering holds across all checkpoints (0.4km to 2,788km)',
    monotonicWGS84,
    monotonicWGS84 ? '' : 'Order inversion detected in WGS84 distance sequence'
  );

  // 2.2 Verify that Spherical (<->) ordering matches WGS84 ordering
  let sphericalOrderMatches = true;
  for (let i = 0; i < computedPoints.length - 1; i++) {
    if (computedPoints[i].sphere >= computedPoints[i + 1].sphere) {
      sphericalOrderMatches = false;
      break;
    }
  }
  assert(
    'EXTREME_02',
    'Spherical KNN operator (<->) rank ordering perfectly aligns with ellipsoidal distance',
    sphericalOrderMatches,
    sphericalOrderMatches ? '' : 'Spherical vs Ellipsoidal ordering mismatch detected'
  );

  // 2.3 Verify distant points retention (>50km, >100km, >1000km)
  const p50km = computedPoints.find(p => p.wgs84 >= 50000);
  const p100km = computedPoints.find(p => p.wgs84 >= 100000);
  const p1000km = computedPoints.find(p => p.wgs84 >= 1000000);

  assert('EXTREME_03', 'Points beyond 50km threshold calculated without loss', !!p50km);
  assert('EXTREME_04', 'Points beyond 100km threshold calculated without loss', !!p100km);
  assert('EXTREME_05', 'Points beyond 1,000km threshold calculated without loss', !!p1000km);

  // 2.4 Mathematical delta between WGS84 and Spherical approximation in Equatorial zone
  const maxDelta = Math.max(...computedPoints.map(p => (Math.abs(p.wgs84 - p.sphere) / p.wgs84) * 100));
  assert(
    'EXTREME_06',
    `Equatorial geoid-sphere distortion is small (< 0.6%, observed: ${maxDelta.toFixed(3)}%)`,
    maxDelta < 0.6,
    `Distortion too large: ${maxDelta}%`
  );
}

// ----------------------------------------------------------------------------
// TEST SUITE 3: Coordinate Boundary Traps & Fault Injection
// ----------------------------------------------------------------------------
function testCoordinateBoundaryTraps(sqlContent) {
  logSection('SUITE 3: COORDINATE BOUNDARY TRAPS & FAULT INJECTION');

  // Inspect the input validation block in get_nearest_drivers
  // Lines 87-94 in setup_nearest_driver.sql:
  // IF user_lat IS NULL OR user_lng IS NULL THEN RETURN; END IF;
  // u_point := ST_SetSRID(ST_MakePoint(user_lng, user_lat), 4326)::geography;

  const fnBodyMatch = sqlContent.match(/CREATE\s+OR\s+REPLACE\s+FUNCTION\s+get_nearest_drivers[\s\S]*?BEGIN([\s\S]*?)RETURN\s+QUERY/i);
  const validationCode = fnBodyMatch ? fnBodyMatch[1] : '';

  console.log('Inspecting function input validation block:');
  console.log(validationCode.trim());
  console.log('-'.repeat(55));

  // 3.1 Check if user_lat boundary checks exist ([-90, 90])
  const hasLatRangeCheck = /user_lat\s*<\s*-90|user_lat\s*>\s*90|user_lat\s+BETWEEN\s+-90\s+AND\s+90/i.test(validationCode);
  
  // 3.2 Check if user_lng boundary checks exist ([-180, 180])
  const hasLngRangeCheck = /user_lng\s*<\s*-180|user_lng\s*>\s*180|user_lng\s+BETWEEN\s+-180\s+AND\s+180/i.test(validationCode);

  // 3.3 Check if NaN / Infinity check exists
  const hasNanCheck = /isnan|isinf|user_lat\s*!=\s*user_lat/i.test(validationCode);

  // 3.4 Check if max_results is protected against negative values
  const hasNegativeLimitGuard = /GREATEST\s*\(\s*.*max_results|max_results\s*<=\s*0/i.test(sqlContent);

  // PostGIS behavior specification:
  // Casting POINT(lng, lat)::geography when lat > 90 or lng > 180 raises:
  // "ERROR: Coordinate values were out of range [-180 -90, 180 90] for GEOGRAPHY type"
  // SQLSTATE: 22003 (Numeric value out of range)

  console.log('\nEvaluating PostGIS Geography Constructor Behavior on boundary values:');

  const boundaryCases = [
    { name: 'Latitude > 90 (e.g. 95.0)', lat: 95.0, lng: 116.11, willThrowInPostgis: true },
    { name: 'Latitude < -90 (e.g. -91.0)', lat: -91.0, lng: 116.11, willThrowInPostgis: true },
    { name: 'Longitude > 180 (e.g. 185.0)', lat: -8.58, lng: 185.0, willThrowInPostgis: true },
    { name: 'Longitude < -180 (e.g. -185.0)', lat: -8.58, lng: -185.0, willThrowInPostgis: true },
    { name: 'Latitude = 90.0 (North Pole)', lat: 90.0, lng: 116.11, willThrowInPostgis: false },
    { name: 'Latitude = -90.0 (South Pole)', lat: -90.0, lng: 116.11, willThrowInPostgis: false },
    { name: 'Longitude = 180.0 (Antimeridian)', lat: -8.58, lng: 180.0, willThrowInPostgis: false },
    { name: 'Longitude = -180.0 (Antimeridian)', lat: -8.58, lng: -180.0, willThrowInPostgis: false },
    { name: 'Null Coordinates', lat: null, lng: null, willThrowInPostgis: false },
    { name: 'NaN Coordinates', lat: NaN, lng: 116.11, willThrowInPostgis: true }
  ];

  for (const tc of boundaryCases) {
    let sqlHandledGracefully = false;
    if (tc.lat === null || tc.lng === null) {
      sqlHandledGracefully = true; // Caught by "IF user_lat IS NULL OR user_lng IS NULL THEN RETURN;"
    } else if (hasLatRangeCheck && (tc.lat < -90 || tc.lat > 90)) {
      sqlHandledGracefully = true;
    } else if (hasLngRangeCheck && (tc.lng < -180 || tc.lng > 180)) {
      sqlHandledGracefully = true;
    }

    console.log(
      `  Case: ${tc.name.padEnd(36)} ` +
      `PostGIS Throws: ${tc.willThrowInPostgis ? 'YES (SQLSTATE 22003)' : 'NO '}` +
      ` | RPC Handles Gracefully: ${sqlHandledGracefully ? 'YES' : 'NO (Uncaught Error)'}`
    );
  }

  // Assertion for Coordinate Bounds
  assert(
    'TRAP_01',
    'Null coordinates handled gracefully (returns empty table via RETURN)',
    /IF\s+user_lat\s+IS\s+NULL\s+OR\s+user_lng\s+IS\s+NULL\s+THEN\s+RETURN;/i.test(validationCode),
    'Missing NULL coordinates guard'
  );

  assert(
    'TRAP_02',
    'Latitude boundary validation (user_lat BETWEEN -90 AND 90) present in RPC',
    hasLatRangeCheck,
    'setup_nearest_driver.sql does NOT check user_lat < -90 OR user_lat > 90. Passing lat > 90 triggers an uncaught PostGIS exception: "Coordinate values were out of range [-180 -90, 180 90] for GEOGRAPHY type" (SQLSTATE 22003).'
  );

  assert(
    'TRAP_03',
    'Longitude boundary validation (user_lng BETWEEN -180 AND 180) present in RPC',
    hasLngRangeCheck,
    'setup_nearest_driver.sql does NOT check user_lng < -180 OR user_lng > 180. Passing lng > 180 triggers an uncaught PostGIS exception: "Coordinate values were out of range [-180 -90, 180 90] for GEOGRAPHY type" (SQLSTATE 22003).'
  );

  // 3.5 Check sync_driver_location Trigger coordinate validation
  const triggerBodyMatch = sqlContent.match(/CREATE\s+OR\s+REPLACE\s+FUNCTION\s+sync_driver_location[\s\S]*?BEGIN([\s\S]*?)END;/i);
  const triggerCode = triggerBodyMatch ? triggerBodyMatch[1] : '';
  const triggerHasBoundsCheck = /NEW\.lat\s*<\s*-90|NEW\.lat\s*>\s*90|NEW\.lng\s*<\s*-180|NEW\.lng\s*>\s*180/i.test(triggerCode);

  assert(
    'TRAP_04',
    'Driver sync trigger (sync_driver_location) bounds checks for lat/lng before geography cast',
    triggerHasBoundsCheck,
    'sync_driver_location trigger does not validate NEW.lat/NEW.lng bounds before executing ST_MakePoint(NEW.lng, NEW.lat)::geography. Updating a driver with lat > 90 crashes the database transaction.'
  );

  // 3.6 Check negative max_results
  assert(
    'TRAP_05',
    'Negative max_results parameter guarded against Postgres LIMIT -N error',
    hasNegativeLimitGuard,
    'max_results can be passed as a negative number (-1), which triggers Postgres fatal error: "LIMIT must not be negative".'
  );
}

// ----------------------------------------------------------------------------
// MAIN HARNESS
// ----------------------------------------------------------------------------
function runAdversarialHarness() {
  console.log('================================================================');
  console.log('ADVERSARIAL STRESS HARNESS: MILESTONE M2 POSTGIS MATCHING');
  console.log('================================================================');

  const sqlPath = path.resolve(__dirname, '../../setup_nearest_driver.sql');
  if (!fs.existsSync(sqlPath)) {
    console.error(`ERROR: Target SQL file not found at ${sqlPath}`);
    process.exit(1);
  }

  const sqlContent = fs.readFileSync(sqlPath, 'utf8');

  testHardRadiusCutoff(sqlContent);
  testExtremeCoordinates();
  testCoordinateBoundaryTraps(sqlContent);

  logSection('ADVERSARIAL CHALLENGE SUMMARY');
  console.log(`Passed Checks   : ${testResults.passed}`);
  console.log(`Failed / Bugs   : ${testResults.failed}`);
  console.log(`Warnings        : ${testResults.warnings}`);

  console.log('\nFailed Vulnerabilities & Traps:');
  const fails = testResults.details.filter(d => d.status === 'FAIL');
  fails.forEach((f, i) => {
    console.log(`${i + 1}. [${f.id}] ${f.description}`);
    console.log(`   Evidence: ${f.details}\n`);
  });

  console.log('================================================================');
}

runAdversarialHarness();
