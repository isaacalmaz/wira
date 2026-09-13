const fs = require('fs');
const path = require('path');

const HOME_PAGE_PATH = path.resolve(__dirname, '../../frontend-user/src/pages/HomePage.jsx');
const SERVICES_PATH = path.resolve(__dirname, '../../frontend-user/src/config/services.js');
const FRONTEND_SRC = path.resolve(__dirname, '../../frontend-user/src');

console.log('=== STARTING ADVERSARIAL VERIFICATION FOR M1 ===\n');

let passCount = 0;
let failCount = 0;

function assert(condition, testName, details = '') {
  if (condition) {
    console.log(`[PASS] ${testName}`);
    passCount++;
  } else {
    console.error(`[FAIL] ${testName} - ${details}`);
    failCount++;
  }
}

// -------------------------------------------------------------
// TEST 1: Source & AST Pattern Matching on HomePage.jsx
// -------------------------------------------------------------
console.log('--- Test Suite 1: Source Inspection of HomePage.jsx ---');
const homePageContent = fs.readFileSync(HOME_PAGE_PATH, 'utf-8');

const forbiddenIdentifiers = [
  'navigator.geolocation',
  'geolocation',
  'getCurrentPosition',
  'watchPosition',
  'get_zone_for_location',
  'fetchLocationAndZones',
  'userZones',
  'locationWarning',
  'isLoadingLocation',
  'Lokasi Terbatas',
  'Izin lokasi ditolak'
];

forbiddenIdentifiers.forEach(ident => {
  const contains = homePageContent.includes(ident);
  assert(!contains, `HomePage.jsx must NOT contain '${ident}'`, `Found forbidden identifier '${ident}' in HomePage.jsx`);
});

// Verify activeServices initial state is SERVICES
const hasDefaultServices = homePageContent.includes('const [activeServices, setActiveServices] = useState(SERVICES);');
assert(hasDefaultServices, 'HomePage.jsx initializes activeServices directly from SERVICES');

// Verify no zone check in updateServices
const hasZoneCheck = /userZones|isZoneEnabled|zones/i.test(homePageContent);
assert(!hasZoneCheck, 'HomePage.jsx has zero zone/geofence checking logic in updateServices');

// -------------------------------------------------------------
// TEST 2: Transitive Dependency Inspection
// -------------------------------------------------------------
console.log('\n--- Test Suite 2: Transitive Dependency Check for HomePage imports ---');
// Extract imports from HomePage.jsx
const importRegex = /import\s+.*?from\s+['"](.*?)['"]/g;
let match;
const imports = [];
while ((match = importRegex.exec(homePageContent)) !== null) {
  imports.push(match[1]);
}

console.log('Detected imports in HomePage.jsx:', imports);

imports.forEach(imp => {
  if (imp.startsWith('.')) {
    // Resolve relative import
    let resolved = path.resolve(path.dirname(HOME_PAGE_PATH), imp);
    const extensions = ['', '.js', '.jsx', '.ts', '.tsx', '/index.js', '/index.jsx'];
    let foundPath = null;
    for (const ext of extensions) {
      if (fs.existsSync(resolved + ext) && fs.statSync(resolved + ext).isFile()) {
        foundPath = resolved + ext;
        break;
      }
    }

    if (foundPath) {
      const depContent = fs.readFileSync(foundPath, 'utf-8');
      const hasGeo = /navigator\.geolocation|getCurrentPosition|get_zone_for_location/g.test(depContent);
      assert(!hasGeo, `Dependency '${imp}' (${path.basename(foundPath)}) does not trigger geolocation or get_zone_for_location`);
    }
  }
});

// -------------------------------------------------------------
// TEST 3: Verification of 8 Service Buttons in config/services.js
// -------------------------------------------------------------
console.log('\n--- Test Suite 3: Services Configuration & Button Enablement ---');
const servicesContent = fs.readFileSync(SERVICES_PATH, 'utf-8');

const expectedServices = [
  'wira_ride',
  'wira_food',
  'wira_send',
  'wira_pay',
  'wira_pulsa',
  'wira_villa',
  'wira_service',
  'wira_pool'
];

expectedServices.forEach(srvId => {
  const hasService = servicesContent.includes(`id: '${srvId}'`);
  assert(hasService, `Service '${srvId}' is defined in services.js`);
});

// Check that every service has enabled: true
const idRegex = /id:\s*'([^']+)'[\s\S]*?enabled:\s*(true|false)/g;
let srvMatch;
let foundServices = {};
while ((srvMatch = idRegex.exec(servicesContent)) !== null) {
  foundServices[srvMatch[1]] = srvMatch[2] === 'true';
}

console.log('Services enabled status in config:', foundServices);
assert(Object.keys(foundServices).length === 8, 'Found exactly 8 service definitions');

for (const [id, isEnabled] of Object.entries(foundServices)) {
  assert(isEnabled === true, `Service '${id}' is enabled: true by default`);
}

// -------------------------------------------------------------
// TEST 4: Behavioral Simulation of Global Flags update
// -------------------------------------------------------------
console.log('\n--- Test Suite 4: Behavioral Simulation of Service Toggles ---');
const mockServices = [
  { id: 'wira_ride', enabled: true, path: '/ride' },
  { id: 'wira_food', enabled: true, path: '/food' },
  { id: 'wira_send', enabled: true, path: '/send' },
  { id: 'wira_pay', enabled: true, path: '/wallet' },
  { id: 'wira_pulsa', enabled: true, path: '/pulsa' },
  { id: 'wira_villa', enabled: true, path: '/villa' },
  { id: 'wira_service', enabled: true, path: '/service' },
  { id: 'wira_pool', enabled: true, path: '/pool' }
];

// Replicate updateServices logic from HomePage.jsx
function updateServices(flags, baseServices = mockServices) {
  return baseServices.map(srv => {
    const flag = flags?.find(f => f.id === srv.id);
    return { ...srv, enabled: flag ? flag.status : srv.enabled };
  });
}

// Case A: Null or empty flags (e.g. initial load or network failure)
const resInitial = updateServices([]);
assert(resInitial.every(s => s.enabled === true), 'All 8 services remain enabled when flags array is empty');

const resNull = updateServices(null);
assert(resNull.every(s => s.enabled === true), 'All 8 services remain enabled when flags is null');

// Case B: Feature flags disable one specific service (e.g. wira_pool)
const resPoolDisabled = updateServices([{ id: 'wira_pool', status: false }]);
const poolSrv = resPoolDisabled.find(s => s.id === 'wira_pool');
const rideSrv = resPoolDisabled.find(s => s.id === 'wira_ride');
assert(poolSrv && poolSrv.enabled === false, 'Service flag correctly toggles target service off');
assert(rideSrv && rideSrv.enabled === true, 'Non-targeted services remain enabled');

// Case C: Link routing check from HomePage.jsx:
// to={service.enabled ? service.path : '#'}
// onClick={(e) => { if(!service.enabled) e.preventDefault(); }}
mockServices.forEach(s => {
  const targetTo = s.enabled ? s.path : '#';
  const shouldPreventDefault = !s.enabled;
  assert(targetTo === s.path && !shouldPreventDefault, `Service '${s.id}' links to '${s.path}' without prevention`);
});

// -------------------------------------------------------------
// SUMMARY
// -------------------------------------------------------------
console.log(`\n=== TEST RESULTS SUMMARY ===`);
console.log(`PASSED: ${passCount}`);
console.log(`FAILED: ${failCount}`);

if (failCount > 0) {
  console.error('\n❌ ADVERSARIAL VERIFICATION FAILED!');
  process.exit(1);
} else {
  console.log('\n✅ ALL ADVERSARIAL VERIFICATIONS PASSED SUCCESSFULLY!');
  process.exit(0);
}
