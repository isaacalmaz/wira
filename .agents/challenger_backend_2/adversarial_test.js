#!/usr/bin/env node
/**
 * adversarial_test.js
 * 
 * Adversarial test harness for Milestone M2 (setup_nearest_driver.sql)
 * Stress-testing:
 * 1. Trigger `sync_driver_location` coordinate synchronization across all update permutations
 * 2. Vehicle type filtering (NULL, '', 'motor', 'mobil', casing, null in db)
 * 3. `only_online` toggle (true, false, null, null in db)
 * 4. PostGIS KNN GiST indexability & SQL query plan analysis
 * 5. Verification of proposed fixes
 */

const fs = require('fs');
const path = require('path');

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;
const findings = [];

function assert(condition, testName, details) {
  totalTests++;
  if (condition) {
    passedTests++;
    console.log(`  [PASS] ${testName}`);
  } else {
    failedTests++;
    console.error(`  [FAIL] ${testName}`);
    console.error(`         Details: ${details}`);
    findings.push({ testName, details });
  }
}

function parsePoint(locationStr) {
  if (!locationStr) return null;
  const match = locationStr.match(/POINT\s*\(\s*([-\d.]+)\s+([-\d.]+)\s*\)/i);
  if (match) {
    return { lng: parseFloat(match[1]), lat: parseFloat(match[2]) };
  }
  return null;
}

function makePoint(lng, lat) {
  return `POINT(${lng} ${lat})`;
}

// Current trigger logic from setup_nearest_driver.sql lines 33-48
function currentTrigger(OLD, NEW) {
  const row = { ...NEW };
  if (row.lat !== null && row.lat !== undefined && row.lng !== null && row.lng !== undefined) {
    row.location = makePoint(row.lng, row.lat);
  } else if (row.location !== null && row.location !== undefined) {
    const pt = parsePoint(row.location);
    if (pt) {
      row.lng = pt.lng;
      row.lat = pt.lat;
    }
  }
  row.updated_at = new Date().toISOString();
  return row;
}

// Proposed robust trigger logic
function robustTrigger(TG_OP, OLD, NEW) {
  const row = { ...NEW };
  if (TG_OP === 'UPDATE') {
    const locChanged = row.location !== OLD.location;
    const latChanged = row.lat !== OLD.lat;
    const lngChanged = row.lng !== OLD.lng;

    if (locChanged && !latChanged && !lngChanged) {
      if (row.location != null) {
        const pt = parsePoint(row.location);
        row.lng = pt ? pt.lng : null;
        row.lat = pt ? pt.lat : null;
      } else {
        row.lat = null;
        row.lng = null;
      }
    } else if (latChanged || lngChanged) {
      if (row.lat != null && row.lng != null) {
        row.location = makePoint(row.lng, row.lat);
      } else {
        row.location = null;
      }
    } else if (row.lat != null && row.lng != null) {
      row.location = makePoint(row.lng, row.lat);
    } else if (row.location != null) {
      const pt = parsePoint(row.location);
      row.lng = pt ? pt.lng : null;
      row.lat = pt ? pt.lat : null;
    }
  } else {
    // INSERT
    if (row.lat != null && row.lng != null) {
      row.location = makePoint(row.lng, row.lat);
    } else if (row.location != null) {
      const pt = parsePoint(row.location);
      row.lng = pt ? pt.lng : null;
      row.lat = pt ? pt.lat : null;
    }
  }
  row.updated_at = new Date().toISOString();
  return row;
}

// ============================================================================
// TEST SUITE 1: TRIGGER sync_driver_location EVALUATION
// ============================================================================
console.log('\n======================================================');
console.log('TEST SUITE 1: TRIGGER sync_driver_location EVALUATION');
console.log('======================================================');

// 1.1 INSERT with (lat, lng)
{
  const initial = { id: 'd1', lat: -8.5833, lng: 116.1167, location: null };
  const res = currentTrigger(null, initial);
  assert(
    res.location === 'POINT(116.1167 -8.5833)' && res.lat === -8.5833 && res.lng === 116.1167,
    '1.1 INSERT with scalar (lat, lng) creates matching location geography',
    `Result: lat=${res.lat}, lng=${res.lng}, location=${res.location}`
  );
}

// 1.2 UPDATE only lat
{
  const existing = { id: 'd1', lat: -8.5833, lng: 116.1167, location: 'POINT(116.1167 -8.5833)' };
  const newRow = { ...existing, lat: -8.5900 };
  const res = currentTrigger(existing, newRow);
  assert(
    res.lat === -8.5900 && res.lng === 116.1167 && res.location === 'POINT(116.1167 -8.59)',
    '1.2 UPDATE only lat synchronizes location and preserves lng',
    `Expected POINT(116.1167 -8.59), got: ${res.location}`
  );
}

// 1.3 UPDATE only lng
{
  const existing = { id: 'd1', lat: -8.5833, lng: 116.1167, location: 'POINT(116.1167 -8.5833)' };
  const newRow = { ...existing, lng: 116.1200 };
  const res = currentTrigger(existing, newRow);
  assert(
    res.lat === -8.5833 && res.lng === 116.1200 && res.location === 'POINT(116.12 -8.5833)',
    '1.3 UPDATE only lng synchronizes location and preserves lat',
    `Expected POINT(116.12 -8.5833), got: ${res.location}`
  );
}

// 1.4 UPDATE both lat and lng
{
  const existing = { id: 'd1', lat: -8.5833, lng: 116.1167, location: 'POINT(116.1167 -8.5833)' };
  const newRow = { ...existing, lat: -8.6000, lng: 116.1300 };
  const res = currentTrigger(existing, newRow);
  assert(
    res.lat === -8.6000 && res.lng === 116.1300 && res.location === 'POINT(116.13 -8.6)',
    '1.4 UPDATE both lat and lng synchronizes location correctly',
    `Expected POINT(116.13 -8.6), got: ${res.location}`
  );
}

// 1.5 ADVERSARIAL: UPDATE only location on existing driver
{
  const existing = { id: 'd1', lat: -8.5833, lng: 116.1167, location: 'POINT(116.1167 -8.5833)' };
  // Application or GIS worker updates location directly:
  // UPDATE drivers SET location = ST_SetSRID(ST_MakePoint(116.2000, -8.7000), 4326)::geography WHERE id = 'd1';
  // In PostgreSQL, lat and lng in NEW retain their OLD values (-8.5833, 116.1167)
  const newRow = { ...existing, location: 'POINT(116.2 -8.7)' };
  const resCurrent = currentTrigger(existing, newRow);

  const isBrokenInCurrent = (
    resCurrent.location === 'POINT(116.1167 -8.5833)' &&
    resCurrent.lat === -8.5833 &&
    resCurrent.lng === 116.1167
  );

  assert(
    !isBrokenInCurrent,
    '1.5 ADVERSARIAL CHALLENGE: UPDATE only location on existing driver must update lat/lng and NOT overwrite location',
    `CRITICAL BUG DETECTED: When only 'location' is updated on an existing row that already has lat/lng, the trigger checks (NEW.lat IS NOT NULL AND NEW.lng IS NOT NULL), evaluates to TRUE, and SILENTLY OVERWRITES NEW.location back to the old coordinates (${resCurrent.location}) while ignoring the new location POINT(116.2 -8.7)!`
  );
}

// 1.6 ADVERSARIAL: Clearing coordinates by setting lat = null, lng = null
{
  const existing = { id: 'd1', lat: -8.5833, lng: 116.1167, location: 'POINT(116.1167 -8.5833)' };
  const newRow = { ...existing, lat: null, lng: null };
  const resCurrent = currentTrigger(existing, newRow);

  const resurrected = (resCurrent.lat !== null && resCurrent.lng !== null);
  assert(
    !resurrected,
    '1.6 ADVERSARIAL CHALLENGE: Setting lat = NULL, lng = NULL should clear location, NOT resurrect lat/lng from location',
    `UNEXPECTED BEHAVIOR: Setting lat=null, lng=null caused trigger to resurrect lat=${resCurrent.lat}, lng=${resCurrent.lng} because NEW.location was not null!`
  );
}

// ============================================================================
// TEST SUITE 2: VEHICLE TYPE FILTERING EVALUATION
// ============================================================================
console.log('\n======================================================');
console.log('TEST SUITE 2: VEHICLE TYPE FILTERING EVALUATION');
console.log('======================================================');

function sqlVehicleFilter(driverVehicleType, targetVehicleType) {
  if (targetVehicleType === null || targetVehicleType === undefined) return true;
  if (targetVehicleType === '') return true;
  if (driverVehicleType === null || driverVehicleType === undefined) return false;
  return driverVehicleType === targetVehicleType;
}

const mockDrivers = [
  { id: 'd1', vehicle_type: 'motor' },
  { id: 'd2', vehicle_type: 'mobil' },
  { id: 'd3', vehicle_type: 'motor' },
  { id: 'd4', vehicle_type: null }
];

// 2.1 target_vehicle_type = NULL
{
  const filtered = mockDrivers.filter(d => sqlVehicleFilter(d.vehicle_type, null));
  assert(
    filtered.length === 4,
    '2.1 target_vehicle_type = NULL returns all drivers regardless of vehicle type',
    `Expected 4, got: ${filtered.length}`
  );
}

// 2.2 target_vehicle_type = '' (empty string)
{
  const filtered = mockDrivers.filter(d => sqlVehicleFilter(d.vehicle_type, ''));
  assert(
    filtered.length === 4,
    '2.2 target_vehicle_type = \'\' returns all drivers regardless of vehicle type',
    `Expected 4, got: ${filtered.length}`
  );
}

// 2.3 target_vehicle_type = 'motor'
{
  const filtered = mockDrivers.filter(d => sqlVehicleFilter(d.vehicle_type, 'motor'));
  const allMotor = filtered.every(d => d.vehicle_type === 'motor');
  assert(
    filtered.length === 2 && allMotor,
    '2.3 target_vehicle_type = \'motor\' strictly filters to motor drivers',
    `Expected 2 motor drivers, got: ${filtered.length}`
  );
}

// 2.4 target_vehicle_type = 'mobil'
{
  const filtered = mockDrivers.filter(d => sqlVehicleFilter(d.vehicle_type, 'mobil'));
  const allMobil = filtered.every(d => d.vehicle_type === 'mobil');
  assert(
    filtered.length === 1 && allMobil,
    '2.4 target_vehicle_type = \'mobil\' strictly filters to mobil drivers',
    `Expected 1 mobil driver, got: ${filtered.length}`
  );
}

// 2.5 ADVERSARIAL: Driver with vehicle_type = NULL vs output COALESCE(vehicle_type, 'motor')
{
  const d4WhenNullTarget = sqlVehicleFilter(mockDrivers[3].vehicle_type, null);
  const d4WhenMotorTarget = sqlVehicleFilter(mockDrivers[3].vehicle_type, 'motor');
  const hasInconsistency = (d4WhenNullTarget === true && d4WhenMotorTarget === false);

  assert(
    !hasInconsistency,
    '2.5 ADVERSARIAL CHALLENGE: Driver with NULL vehicle_type should be filterable by default vehicle_type (\'motor\')',
    `INCONSISTENCY FOUND: Line 101 returns COALESCE(d.vehicle_type, 'motor'), meaning drivers with NULL vehicle_type are reported to callers as 'motor'. However, filtering by target_vehicle_type='motor' excludes them because WHERE clause does not use COALESCE(d.vehicle_type, 'motor') = target_vehicle_type!`
  );
}

// ============================================================================
// TEST SUITE 3: only_online TOGGLE EVALUATION
// ============================================================================
console.log('\n======================================================');
console.log('TEST SUITE 3: only_online TOGGLE EVALUATION');
console.log('======================================================');

function sqlOnlineFilter(driverIsOnline, onlyOnlineParam) {
  if (onlyOnlineParam === true) {
    return driverIsOnline === true;
  }
  if (onlyOnlineParam === false) {
    return true;
  }
  if (onlyOnlineParam === null || onlyOnlineParam === undefined) {
    return driverIsOnline === true;
  }
  return true;
}

const mockOnlineDrivers = [
  { id: 'd1', is_online: true },
  { id: 'd2', is_online: false },
  { id: 'd3', is_online: true },
  { id: 'd4', is_online: false },
  { id: 'd5', is_online: null }
];

// 3.1 only_online = true
{
  const filtered = mockOnlineDrivers.filter(d => sqlOnlineFilter(d.is_online, true));
  const allOnline = filtered.every(d => d.is_online === true);
  assert(
    filtered.length === 2 && allOnline,
    '3.1 only_online = true strictly filters to online drivers (is_online = true)',
    `Expected 2 online drivers, got: ${filtered.length}`
  );
}

// 3.2 only_online = false
{
  const filtered = mockOnlineDrivers.filter(d => sqlOnlineFilter(d.is_online, false));
  assert(
    filtered.length === 5,
    '3.2 only_online = false includes all drivers (both online and offline)',
    `Expected 5 drivers, got: ${filtered.length}`
  );
}

// 3.3 ADVERSARIAL: only_online = null
{
  const filtered = mockOnlineDrivers.filter(d => sqlOnlineFilter(d.is_online, null));
  assert(
    filtered.length === 2,
    '3.3 only_online = null behaves identically to only_online = true in 3-valued logic',
    `Filtered count: ${filtered.length}`
  );
}

// ============================================================================
// TEST SUITE 4: POSTGIS KNN GIST INDEXABILITY ANALYSIS
// ============================================================================
console.log('\n======================================================');
console.log('TEST SUITE 4: POSTGIS KNN GIST INDEXABILITY ANALYSIS');
console.log('======================================================');

const sqlContent = fs.readFileSync(path.resolve(__dirname, '../../setup_nearest_driver.sql'), 'utf8');

const hasGistIndex = /CREATE\s+INDEX\s+IF\s+NOT\s+EXISTS\s+idx_drivers_location_gist\s+ON\s+public\.drivers\s+USING\s+GIST\s*\(\s*location\s*\)/i.test(sqlContent);
const orderByMatch = sqlContent.match(/ORDER\s+BY\s+([\s\S]+?)\s+ASC/i);
const orderByClause = orderByMatch ? orderByMatch[1].trim() : '';

console.log('GiST Index Column: location');
console.log('ORDER BY Expression:', orderByClause);

const usesCoalesceInOrderBy = /COALESCE\s*\(\s*d\.location/i.test(orderByClause);

assert(
  !usesCoalesceInOrderBy,
  '4.1 ADVERSARIAL CHALLENGE: ORDER BY clause should use `d.location <-> u_point` directly to enable GiST KNN index scan',
  `PERFORMANCE / QUERY PLAN DEFECT: The GiST index is defined on public.drivers USING GIST (location). But the ORDER BY clause uses:\n  COALESCE(d.location, ST_SetSRID(ST_MakePoint(d.lng, d.lat), 4326)::geography) <-> u_point ASC\nPostgreSQL query optimizer CANNOT use a GiST index on 'location' for KNN ordering when the indexed column is wrapped inside a COALESCE(...) expression! This forces a sequential table scan (Seq Scan) and in-memory sort on every RPC call. Since the trigger guarantees d.location is populated, ORDER BY d.location <-> u_point ASC should be used.`
);

// ============================================================================
// TEST SUITE 5: VERIFICATION OF PROPOSED RESOLUTION
// ============================================================================
console.log('\n======================================================');
console.log('TEST SUITE 5: PROPOSED ROBUST IMPLEMENTATION VERIFICATION');
console.log('======================================================');

// Verify robustTrigger with UPDATE location
{
  const existing = { id: 'd1', lat: -8.5833, lng: 116.1167, location: 'POINT(116.1167 -8.5833)' };
  const newRow = { ...existing, location: 'POINT(116.2 -8.7)' };
  const res = robustTrigger('UPDATE', existing, newRow);
  console.log('  Robust trigger location update test:', res);
  if (res.lat === -8.7 && res.lng === 116.2 && res.location === 'POINT(116.2 -8.7)') {
    console.log('  [VERIFIED] Robust trigger properly updates lat & lng when location changes!');
  }
}

// Verify robustTrigger with clearing coordinates (lat=null, lng=null)
{
  const existing = { id: 'd1', lat: -8.5833, lng: 116.1167, location: 'POINT(116.1167 -8.5833)' };
  const newRow = { ...existing, lat: null, lng: null };
  const res = robustTrigger('UPDATE', existing, newRow);
  console.log('  Robust trigger clear coordinates test:', res);
  if (res.lat === null && res.lng === null && res.location === null) {
    console.log('  [VERIFIED] Robust trigger properly clears location when lat & lng are set to null!');
  }
}

// ============================================================================
// SUMMARY & VERDICT
// ============================================================================
console.log('\n======================================================');
console.log(`TEST RESULTS SUMMARY: ${passedTests} passed, ${failedTests} failed out of ${totalTests} tests`);
console.log('======================================================');

if (findings.length > 0) {
  console.log('\nCRITICAL FINDINGS:');
  findings.forEach((f, idx) => {
    console.log(`\n[FINDING ${idx + 1}] ${f.testName}`);
    console.log(`  ${f.details}`);
  });
  console.log('\n======================================================');
  console.log('FINAL VERDICT: REQUEST_CHANGES');
  console.log('======================================================');
  process.exit(1);
} else {
  console.log('\nFINAL VERDICT: APPROVE');
  process.exit(0);
}
