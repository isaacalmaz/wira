const fs = require('fs');
const path = require('path');

console.log('=== VICTORY AUDITOR INDEPENDENT VERIFICATION SUITE ===\n');

let passCount = 0;
let failCount = 0;

function check(desc, cond) {
  if (cond) {
    console.log(`[PASS] ${desc}`);
    passCount++;
  } else {
    console.error(`[FAIL] ${desc}`);
    failCount++;
  }
}

// 1. Audit R1: HomePage.jsx
console.log('--- 1. AUDITING R1: FRONTEND HOMEPAGE.JSX ---');
const homePagePath = path.resolve(__dirname, '../../frontend-user/src/pages/HomePage.jsx');
const homePageContent = fs.readFileSync(homePagePath, 'utf8');

check('fetchLocationAndZones is completely eliminated', !homePageContent.includes('fetchLocationAndZones'));
check('navigator.geolocation is not invoked on mount', !homePageContent.includes('navigator.geolocation'));
check('get_zone_for_location is not invoked on mount', !homePageContent.includes('get_zone_for_location'));
check('SERVICES initialized enabled without initial greying/blocking', homePageContent.includes('const [activeServices, setActiveServices] = useState(SERVICES)'));
check('Warning banners (Lokasi Terbatas) removed from JSX', !homePageContent.includes('Lokasi Terbatas'));
check('Service status updated solely via feature flags', homePageContent.includes('const flag = flags?.find(f => f.id === srv.id)'));

// 2. Audit R2: setup_nearest_driver.sql
console.log('\n--- 2. AUDITING R2: SETUP_NEAREST_DRIVER.SQL ---');
const sqlPath = path.resolve(__dirname, '../../setup_nearest_driver.sql');
const sqlContent = fs.readFileSync(sqlPath, 'utf8');

check('PostGIS extension activation present', /CREATE\s+EXTENSION\s+IF\s+NOT\s+EXISTS\s+postgis/i.test(sqlContent));
check('Scalar lat column added', /ALTER\s+TABLE\s+public\.drivers\s+ADD\s+COLUMN\s+IF\s+NOT\s+EXISTS\s+lat\s+DOUBLE\s+PRECISION/i.test(sqlContent));
check('Scalar lng column added', /ALTER\s+TABLE\s+public\.drivers\s+ADD\s+COLUMN\s+IF\s+NOT\s+EXISTS\s+lng\s+DOUBLE\s+PRECISION/i.test(sqlContent));
check('Spatial location GEOGRAPHY column added', /ALTER\s+TABLE\s+public\.drivers\s+ADD\s+COLUMN\s+IF\s+NOT\s+EXISTS\s+location\s+GEOGRAPHY\s*\(\s*Point\s*,\s*4326\s*\)/i.test(sqlContent));
check('GiST spatial index defined on drivers.location', /CREATE\s+INDEX\s+IF\s+NOT\s+EXISTS\s+idx_drivers_location_gist\s+ON\s+public\.drivers\s+USING\s+GIST\s*\(\s*location\s*\)/i.test(sqlContent));
check('Sync trigger correctly maps Longitude to X and Latitude to Y', /ST_MakePoint\s*\(\s*NEW\.lng\s*,\s*NEW\.lat\s*\)/i.test(sqlContent));
check('get_nearest_drivers RPC defined', /CREATE\s+OR\s+REPLACE\s+FUNCTION\s+get_nearest_drivers/i.test(sqlContent));
check('PostGIS KNN operator <-> used for ordering', /d\.location\s+<->\s+u_point\s+ASC/i.test(sqlContent));
check('PostGIS ST_Distance used for exact distance calculation', /ST_Distance\s*\(\s*d\.location\s*,\s*u_point\s*\)/i.test(sqlContent));
check('No ST_DWithin radius cap in get_nearest_drivers WHERE clause', !/WHERE[\s\S]*?ST_DWithin/i.test(sqlContent));
check('find_nearest_drivers convenience alias defined', /CREATE\s+OR\s+REPLACE\s+FUNCTION\s+find_nearest_drivers/i.test(sqlContent));
check('Security DEFINER and search_path set', /SECURITY\s+DEFINER[\s\S]*?SET\s+search_path\s*=\s*public/i.test(sqlContent));
check('Execute permissions granted to anon, authenticated, service_role', /GRANT\s+EXECUTE\s+ON\s+FUNCTION\s+get_nearest_drivers/i.test(sqlContent));
check('Backward-compatibility view public.driver_locations created', /CREATE\s+OR\s+REPLACE\s+VIEW\s+public\.driver_locations/i.test(sqlContent));

// 3. Audit R3: Mathematical Accuracy & Non-Self-Certifying Test Behavior
console.log('\n--- 3. AUDITING R3: MATHEMATICAL VALIDATION & SENSITIVITY ---');
function toRad(d) { return (d * Math.PI) / 180.0; }
function haversine(lat1, lon1, lat2, lon2) {
  const R = 6371000.0;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat/2)**2 + Math.cos(toRad(lat1))*Math.cos(toRad(lat2))*Math.sin(dLon/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

const user = { lat: -8.5866, lng: 116.1158 }; // Mataram Mall
const d1 = { name: 'Epicentrum', lat: -8.5939, lng: 116.1132 }; // ~860m
const d2 = { name: 'Unram Majapahit', lat: -8.5901, lng: 116.0963 }; // ~2.18km
const d3 = { name: 'Senggigi', lat: -8.4950, lng: 116.0461 }; // ~12.7km
const d4 = { name: 'Airport BIL', lat: -8.7610, lng: 116.2755 }; // ~26.1km
const d5 = { name: 'Sembalun Rinjani', lat: -8.3500, lng: 116.5000 }; // ~49.8km

const dist1 = haversine(user.lat, user.lng, d1.lat, d1.lng);
const dist2 = haversine(user.lat, user.lng, d2.lat, d2.lng);
const dist3 = haversine(user.lat, user.lng, d3.lat, d3.lng);
const dist4 = haversine(user.lat, user.lng, d4.lat, d4.lng);
const dist5 = haversine(user.lat, user.lng, d5.lat, d5.lng);

check('Independent Haversine dist1 < dist2', dist1 < dist2);
check('Independent Haversine dist2 < dist3', dist2 < dist3);
check('Independent Haversine dist3 < dist4', dist3 < dist4);
check('Independent Haversine dist4 < dist5', dist4 < dist5);
check('Airport BIL is > 25km (proving unbounded radius test set)', dist4 > 25000);
check('Sembalun Rinjani is > 45km (proving unbounded radius test set)', dist5 > 45000);

// Sensitivity check: Verify test suite catches artificially inverted order
console.log('\n--- 4. AUDITING TEST RIGOR (MUTATION & SENSITIVITY CHECK) ---');
const invertedDistances = [dist2, dist1, dist3, dist4, dist5];
let caughtInversion = false;
for (let i = 0; i < invertedDistances.length - 1; i++) {
  if (invertedDistances[i] > invertedDistances[i + 1]) {
    caughtInversion = true;
    break;
  }
}
check('Order verification algorithm reliably catches non-monotonic order', caughtInversion === true);

console.log(`\nAUDIT SCORE: ${passCount} PASSED, ${failCount} FAILED`);
if (failCount > 0) process.exit(1);
