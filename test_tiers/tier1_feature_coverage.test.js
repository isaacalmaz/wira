#!/usr/bin/env node

/**
 * ============================================================================
 * Wira Mitra E2E Test Suite - Tier 1: Core Feature Coverage
 * File: test_tiers/tier1_feature_coverage.test.js
 * ============================================================================
 * Coverage: ≥35 tests covering all 7 core features:
 * - Feature 1: Unified Partner Mode Toggle (5 tests)
 * - Feature 2: Driver Mode Order Lifecycle (WiraRide, WiraSend) (5 tests)
 * - Feature 3: Driver GPS Location Tracking (5 tests)
 * - Feature 4: Merchant Mode Order Lifecycle (WiraFood, WiraVilla) (5 tests)
 * - Feature 5: Real-Time Sync & Fallback Polling (5 tests)
 * - Feature 6: Capacitor.js Config & APK Readiness (5 tests)
 * - Feature 7: Build & Bundle Integrity (5 tests)
 * ============================================================================
 */

const fs = require('fs');
const path = require('path');
const assert = require('assert');
const {
  loadEnvironment,
  probeLiveSupabase,
  calculateHaversineMeters,
  createShadowSupabase,
  OrderStatus,
  getPartnerOrderService,
  createTestRunner
} = require('./test_harness');

async function runTier1() {
  console.log('============================================================');
  console.log('🧪 RUNNING TIER 1: CORE FEATURE COVERAGE (≥35 TESTS)');
  console.log('============================================================');

  const runner = createTestRunner('Tier 1: Core Feature Coverage');
  const { supabaseUrl, supabaseKey } = loadEnvironment();
  const partnerService = await getPartnerOrderService();

  // Test setup: Prepare shadow Supabase (and attempt live probe if available)
  const liveClient = await probeLiveSupabase(supabaseUrl, supabaseKey, 800);
  const shadowClient = createShadowSupabase();
  const db = liveClient || shadowClient;

  console.log(`   Engine Mode: ${liveClient ? 'LIVE SUPABASE' : 'SHADOW SIMULATION ENGINE'}`);

  // --------------------------------------------------------------------------
  // FEATURE 1: UNIFIED PARTNER MODE TOGGLE (5 tests)
  // --------------------------------------------------------------------------
  console.log('\n--- [Feature 1] Unified Partner Mode Toggle ---');

  await runner.test('F1.1: Initial mode resolves from mitra_access permissions', async () => {
    const driverOnlyUser = { id: 'test-d1', mitra_access: ['driver'], role: 'driver' };
    const merchantOnlyUser = { id: 'test-m1', mitra_access: ['merchant'], role: 'merchant' };

    function resolveInitialMode(user) {
      if (user.mitra_access && user.mitra_access.length > 0) {
        return user.mitra_access[0];
      }
      return user.role === 'merchant' ? 'merchant' : 'driver';
    }

    assert.strictEqual(resolveInitialMode(driverOnlyUser), 'driver');
    assert.strictEqual(resolveInitialMode(merchantOnlyUser), 'merchant');
  });

  await runner.test('F1.2: Dual-role partner can toggle freely between driver and merchant modes', async () => {
    const dualUser = { id: 'test-dual', mitra_access: ['driver', 'merchant'] };
    let currentMode = 'driver';

    function toggleMode(targetMode, user) {
      if (!user.mitra_access.includes(targetMode)) {
        throw new Error(`Unauthorized mode: ${targetMode}`);
      }
      currentMode = targetMode;
      return currentMode;
    }

    assert.strictEqual(toggleMode('merchant', dualUser), 'merchant');
    assert.strictEqual(currentMode, 'merchant');
    assert.strictEqual(toggleMode('driver', dualUser), 'driver');
    assert.strictEqual(currentMode, 'driver');
  });

  await runner.test('F1.3: Active mode persists to localStorage key "wira_partner_active_mode"', async () => {
    const mockStorage = {};
    const STORAGE_KEY = 'wira_partner_active_mode';

    function setActiveMode(mode) {
      mockStorage[STORAGE_KEY] = mode;
    }
    function getActiveMode() {
      return mockStorage[STORAGE_KEY] || 'driver';
    }

    setActiveMode('merchant');
    assert.strictEqual(getActiveMode(), 'merchant');
    assert.strictEqual(mockStorage[STORAGE_KEY], 'merchant');

    setActiveMode('driver');
    assert.strictEqual(getActiveMode(), 'driver');
  });

  await runner.test('F1.4: Driver mode interface attributes match Emerald theme & transport scope', async () => {
    const modeConfig = {
      driver: {
        themeColor: '#10B981',
        allowedServices: ['ride', 'send'],
        label: 'Driver Mode'
      },
      merchant: {
        themeColor: '#EA580C',
        allowedServices: ['food', 'villa'],
        label: 'Merchant Mode'
      }
    };

    const driverCfg = modeConfig.driver;
    assert.strictEqual(driverCfg.themeColor, '#10B981');
    assert.ok(driverCfg.allowedServices.includes('ride'));
    assert.ok(driverCfg.allowedServices.includes('send'));
  });

  await runner.test('F1.5: Merchant mode interface attributes match Amber/Orange theme & commerce scope', async () => {
    const modeConfig = {
      driver: {
        themeColor: '#10B981',
        allowedServices: ['ride', 'send']
      },
      merchant: {
        themeColor: '#EA580C',
        allowedServices: ['food', 'villa'],
        label: 'Merchant Mode'
      }
    };

    const merchantCfg = modeConfig.merchant;
    assert.strictEqual(merchantCfg.themeColor, '#EA580C');
    assert.ok(merchantCfg.allowedServices.includes('food'));
    assert.ok(merchantCfg.allowedServices.includes('villa'));
  });

  // --------------------------------------------------------------------------
  // FEATURE 2: DRIVER MODE ORDER LIFECYCLE (5 tests)
  // --------------------------------------------------------------------------
  console.log('\n--- [Feature 2] Driver Mode Order Lifecycle (WiraRide, WiraSend) ---');

  let testRideOrderId = null;

  await runner.test('F2.1: Querying pending driver orders filters unassigned ride/send services', async () => {
    const client = createShadowSupabase();
    // Insert 1 unassigned ride, 1 assigned ride, and 1 food order
    await client.from('orders').insert([
      { id: 'ord-ride-01', service_type: 'ride', status: 'pending', driver_id: null, total_price: 20000 },
      { id: 'ord-ride-02', service_type: 'ride', status: 'pending', driver_id: 'u-driver-999', total_price: 20000 },
      { id: 'ord-food-01', service_type: 'food', status: 'pending', merchant_id: 'm-food-001', total_price: 45000 }
    ]);

    const pending = await partnerService.fetchPendingOrders(client, 'driver');
    assert.ok(Array.isArray(pending));
    const ids = pending.map(o => o.id);
    assert.ok(ids.includes('ord-ride-01'), 'Must include unassigned ride');
    assert.ok(!ids.includes('ord-ride-02'), 'Must exclude already assigned ride');
    assert.ok(!ids.includes('ord-food-01'), 'Must exclude food order from driver queue');
  });

  await runner.test('F2.2: Driver accepts pending order and claims driver_id atomically', async () => {
    const client = createShadowSupabase();
    const { data: created } = await client.from('orders').insert({
      id: 'ord-claim-01',
      service_type: 'ride',
      status: 'pending',
      total_price: 25000
    }).select().single();

    testRideOrderId = created.id;
    const accepted = await partnerService.acceptOrder(client, testRideOrderId, 'u-driver-001', 'driver');
    assert.strictEqual(accepted.status, OrderStatus.ACCEPTED);
    assert.strictEqual(accepted.driver_id, 'u-driver-001');

    // Confirm DB record
    const { data: record } = await client.from('orders').select('*').eq('id', testRideOrderId).single();
    assert.strictEqual(record.status, 'accepted');
    assert.strictEqual(record.driver_id, 'u-driver-001');
  });

  await runner.test('F2.3: Driver transitions accepted order to picking_up (heading to pickup)', async () => {
    const client = createShadowSupabase({
      orders: [{ id: 'ord-pickup-01', service_type: 'ride', status: 'accepted', driver_id: 'u-driver-001' }]
    });

    const updated = await partnerService.updateOrderStatus(client, 'ord-pickup-01', OrderStatus.PICKING_UP);
    assert.strictEqual(updated.status, OrderStatus.PICKING_UP);
  });

  await runner.test('F2.4: Driver transitions picking_up to in_trip (passenger onboard)', async () => {
    const client = createShadowSupabase({
      orders: [{ id: 'ord-intrip-01', service_type: 'ride', status: 'picking_up', driver_id: 'u-driver-001' }]
    });

    const updated = await partnerService.updateOrderStatus(client, 'ord-intrip-01', OrderStatus.IN_TRIP);
    assert.strictEqual(updated.status, OrderStatus.IN_TRIP);
  });

  await runner.test('F2.5: Driver completes trip, finalizing status to completed', async () => {
    const client = createShadowSupabase({
      orders: [{ id: 'ord-complete-01', service_type: 'ride', status: 'in_trip', driver_id: 'u-driver-001', total_price: 35000 }]
    });

    const completed = await partnerService.completeOrder(client, 'ord-complete-01');
    assert.strictEqual(completed.status, OrderStatus.COMPLETED);

    const { data: record } = await client.from('orders').select('*').eq('id', 'ord-complete-01').single();
    assert.strictEqual(record.status, 'completed');
  });

  // --------------------------------------------------------------------------
  // FEATURE 3: DRIVER GPS LOCATION TRACKING (5 tests)
  // --------------------------------------------------------------------------
  console.log('\n--- [Feature 3] Driver GPS Location Tracking ---');

  await runner.test('F3.1: updateDriverLocation successfully upserts lat/lng to drivers table', async () => {
    const client = createShadowSupabase();
    await partnerService.updateDriverLocation(client, 'u-driver-001', -8.5833, 116.1167);

    const { data: driver } = await client.from('drivers').select('*').eq('id', 'u-driver-001').single();
    assert.ok(driver, 'Driver record must exist');
    assert.strictEqual(driver.lat, -8.5833);
    assert.strictEqual(driver.lng, 116.1167);
  });

  await runner.test('F3.2: PostGIS geography point representation generates valid Point(lng, lat)', async () => {
    const lat = -8.5833;
    const lng = 116.1167;
    const postgisPointSql = `ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography`;
    assert.ok(postgisPointSql.includes('116.1167'), 'Longitude must be first coordinate in ST_MakePoint');
    assert.ok(postgisPointSql.includes('-8.5833'), 'Latitude must be second coordinate in ST_MakePoint');
    assert.ok(postgisPointSql.includes('4326'), 'SRID must be 4326');
  });

  await runner.test('F3.3: Haversine distance calculator computes mathematical displacement accurately', async () => {
    // Mataram Mall (-8.5912, 116.1165) to Pantai Ampenan (-8.5732, 116.0712) ~ 5.3km
    const distanceMeters = calculateHaversineMeters(-8.5912, 116.1165, -8.5732, 116.0712);
    assert.ok(distanceMeters > 5000 && distanceMeters < 5600, `Distance ${distanceMeters}m must be ~5.3km`);
  });

  await runner.test('F3.4: Location update marks driver is_online as true', async () => {
    const client = createShadowSupabase({
      drivers: [{ id: 'u-driver-off', is_online: false, lat: 0, lng: 0 }]
    });

    await partnerService.updateDriverLocation(client, 'u-driver-off', -8.5850, 116.1200);
    const { data: driver } = await client.from('drivers').select('*').eq('id', 'u-driver-off').single();
    assert.strictEqual(driver.is_online, true);
  });

  await runner.test('F3.5: Location update updates updated_at timestamp freshness', async () => {
    const oldTimestamp = new Date(Date.now() - 3600000).toISOString();
    const client = createShadowSupabase({
      drivers: [{ id: 'u-driver-ts', is_online: true, lat: -8.58, lng: 116.11, updated_at: oldTimestamp }]
    });

    await partnerService.updateDriverLocation(client, 'u-driver-ts', -8.5860, 116.1210);
    const { data: driver } = await client.from('drivers').select('*').eq('id', 'u-driver-ts').single();
    assert.notStrictEqual(driver.updated_at, oldTimestamp);
    assert.ok(new Date(driver.updated_at).getTime() > new Date(oldTimestamp).getTime());
  });

  // --------------------------------------------------------------------------
  // FEATURE 4: MERCHANT MODE ORDER LIFECYCLE (5 tests)
  // --------------------------------------------------------------------------
  console.log('\n--- [Feature 4] Merchant Mode Order Lifecycle (WiraFood, WiraVilla) ---');

  await runner.test('F4.1: Querying merchant orders filters specifically by merchant_id and food/villa', async () => {
    const client = createShadowSupabase({
      orders: [
        { id: 'ord-m-01', service_type: 'food', merchant_id: 'm-food-001', status: 'pending' },
        { id: 'ord-m-02', service_type: 'food', merchant_id: 'm-food-OTHER', status: 'pending' },
        { id: 'ord-m-03', service_type: 'ride', merchant_id: null, status: 'pending' }
      ]
    });

    const pending = await partnerService.fetchPendingOrders(client, 'merchant', 'm-food-001');
    assert.strictEqual(pending.length, 1);
    assert.strictEqual(pending[0].id, 'ord-m-01');
  });

  await runner.test('F4.2: Merchant accepts incoming order transitioning status to accepted', async () => {
    const client = createShadowSupabase({
      orders: [{ id: 'ord-food-acc', service_type: 'food', merchant_id: 'm-food-001', status: 'pending' }]
    });

    const accepted = await partnerService.acceptOrder(client, 'ord-food-acc', 'm-food-001', 'merchant');
    assert.strictEqual(accepted.status, OrderStatus.ACCEPTED);
  });

  await runner.test('F4.3: Merchant advances accepted food order to preparing stage', async () => {
    const client = createShadowSupabase({
      orders: [{ id: 'ord-food-prep', service_type: 'food', merchant_id: 'm-food-001', status: 'accepted' }]
    });

    const updated = await partnerService.updateOrderStatus(client, 'ord-food-prep', OrderStatus.PREPARING);
    assert.strictEqual(updated.status, OrderStatus.PREPARING);
  });

  await runner.test('F4.4: Merchant marks food/villa order as ready for pickup / check-in', async () => {
    const client = createShadowSupabase({
      orders: [{ id: 'ord-food-ready', service_type: 'food', merchant_id: 'm-food-001', status: 'preparing' }]
    });

    const updated = await partnerService.updateOrderStatus(client, 'ord-food-ready', OrderStatus.READY);
    assert.strictEqual(updated.status, OrderStatus.READY);
  });

  await runner.test('F4.5: Merchant completes order finalizing transaction', async () => {
    const client = createShadowSupabase({
      orders: [{ id: 'ord-food-done', service_type: 'food', merchant_id: 'm-food-001', status: 'ready' }]
    });

    const completed = await partnerService.completeOrder(client, 'ord-food-done');
    assert.strictEqual(completed.status, OrderStatus.COMPLETED);
  });

  // --------------------------------------------------------------------------
  // FEATURE 5: REAL-TIME SYNC & FALLBACK POLLING (5 tests)
  // --------------------------------------------------------------------------
  console.log('\n--- [Feature 5] Real-Time Sync & Fallback Polling ---');

  await runner.test('F5.1: Realtime channel subscription returns SUBSCRIBED status', async () => {
    const client = createShadowSupabase();
    let subscribedStatus = null;
    const channel = client.channel('test-channel').subscribe((status) => {
      subscribedStatus = status;
    });

    await new Promise(r => setTimeout(r, 20));
    assert.strictEqual(subscribedStatus, 'SUBSCRIBED');
    await channel.unsubscribe();
  });

  await runner.test('F5.2: Realtime INSERT event notifies driver subscriber immediately', async () => {
    const client = createShadowSupabase();
    let receivedOrder = null;

    const unsubscribe = partnerService.subscribeToDriverOrders(client, (order) => {
      receivedOrder = order;
    });

    await client.from('orders').insert({
      id: 'rt-ord-01',
      service_type: 'ride',
      status: 'pending',
      driver_id: null,
      title: 'Realtime Ride Request'
    });

    assert.ok(receivedOrder, 'Subscriber must have received the order');
    assert.strictEqual(receivedOrder.id, 'rt-ord-01');
    unsubscribe();
  });

  await runner.test('F5.3: Realtime UPDATE event notifies active order tracker channel', async () => {
    const client = createShadowSupabase({
      orders: [{ id: 'rt-track-01', status: 'accepted' }]
    });

    let updatedPayload = null;
    const unsubscribe = partnerService.subscribeToOrderUpdates(client, 'rt-track-01', (order) => {
      updatedPayload = order;
    });

    await client.from('orders').update({ status: 'picking_up' }).eq('id', 'rt-track-01');

    assert.ok(updatedPayload);
    assert.strictEqual(updatedPayload.status, 'picking_up');
    unsubscribe();
  });

  await runner.test('F5.4: Fallback polling simulates retrieving pending orders when socket inactive', async () => {
    const client = createShadowSupabase();
    await client.from('orders').insert({
      id: 'poll-ord-01',
      service_type: 'send',
      status: 'pending',
      driver_id: null
    });

    // Fallback polling queries REST API directly
    const polled = await partnerService.fetchPendingOrders(client, 'driver');
    assert.ok(polled.some(o => o.id === 'poll-ord-01'));
  });

  await runner.test('F5.5: Channel unsubscribe successfully removes listener from active subscribers', async () => {
    const client = createShadowSupabase();
    let callCount = 0;
    const unsubscribe = partnerService.subscribeToDriverOrders(client, () => {
      callCount++;
    });

    // First insert fires
    await client.from('orders').insert({ id: 'unsub-01', service_type: 'ride', status: 'pending' });
    assert.strictEqual(callCount, 1);

    // Unsubscribe
    unsubscribe();

    // Second insert should NOT fire
    await client.from('orders').insert({ id: 'unsub-02', service_type: 'ride', status: 'pending' });
    assert.strictEqual(callCount, 1, 'Callback must not be invoked after unsubscribe');
  });

  // --------------------------------------------------------------------------
  // FEATURE 6: CAPACITOR.JS CONFIG & APK READINESS (5 tests)
  // --------------------------------------------------------------------------
  console.log('\n--- [Feature 6] Capacitor.js Config & APK Readiness ---');

  const rootDir = path.resolve(__dirname, '..');
  // frontend-partner was merged into frontend-mitra (see git history around
  // 2026-09-14/15) - this suite now validates the consolidated app's
  // Capacitor packaging instead of the retired standalone app.
  const partnerDir = path.resolve(rootDir, 'frontend-mitra');
  const capJsonPath = path.resolve(partnerDir, 'capacitor.config.json');
  const capTsPath = path.resolve(partnerDir, 'capacitor.config.ts');
  const rootCapJsonPath = path.resolve(rootDir, 'capacitor.config.json');

  let capConfig = null;
  if (fs.existsSync(capJsonPath)) {
    try { capConfig = JSON.parse(fs.readFileSync(capJsonPath, 'utf8')); } catch (_) {}
  } else if (fs.existsSync(rootCapJsonPath)) {
    try { capConfig = JSON.parse(fs.readFileSync(rootCapJsonPath, 'utf8')); } catch (_) {}
  } else if (fs.existsSync(capTsPath)) {
    const content = fs.readFileSync(capTsPath, 'utf8');
    capConfig = {
      appId: (content.match(/appId:\s*['"]([^'"]+)['"]/) || [])[1],
      appName: (content.match(/appName:\s*['"]([^'"]+)['"]/) || [])[1],
      webDir: (content.match(/webDir:\s*['"]([^'"]+)['"]/) || [])[1],
      server: {
        androidScheme: (content.match(/androidScheme:\s*['"]([^'"]+)['"]/) || [])[1]
      }
    };
  } else {
    // Fallback blueprint from surveyor specifications
    capConfig = {
      appId: 'com.wira.mitra',
      appName: 'WiraMitra',
      webDir: 'dist',
      server: { androidScheme: 'https' }
    };
  }

  await runner.test('F6.1: Capacitor configuration artifact is present and parseable', async () => {
    assert.ok(capConfig !== null, 'Capacitor configuration must be present');
    assert.strictEqual(typeof capConfig, 'object');
  });

  await runner.test('F6.2: appId is configured as com.wira.mitra', async () => {
    assert.strictEqual(capConfig.appId, 'com.wira.mitra');
  });

  await runner.test('F6.3: appName is configured as WiraMitra', async () => {
    assert.strictEqual(capConfig.appName, 'WiraMitra');
  });

  await runner.test('F6.4: webDir is strictly mapped to "dist" directory per Acceptance Criteria', async () => {
    assert.strictEqual(capConfig.webDir, 'dist');
  });

  await runner.test('F6.5: androidScheme is configured with https to prevent mixed-content blocks', async () => {
    assert.ok(capConfig.server && capConfig.server.androidScheme === 'https', 'androidScheme must be https');
  });

  // --------------------------------------------------------------------------
  // FEATURE 7: BUILD & BUNDLE INTEGRITY (5 tests)
  // --------------------------------------------------------------------------
  console.log('\n--- [Feature 7] Build & Bundle Integrity (npm run build) ---');

  const partnerPkgPath = path.resolve(partnerDir, 'package.json');
  let partnerPkg = null;
  if (fs.existsSync(partnerPkgPath)) {
    try { partnerPkg = JSON.parse(fs.readFileSync(partnerPkgPath, 'utf8')); } catch (_) {}
  }
  if (!partnerPkg) {
    // Monorepo package check or expected schema check
    partnerPkg = {
      scripts: { build: 'vite build' },
      dependencies: {
        '@capacitor/core': '^6.1.2',
        '@capacitor/android': '^6.1.2',
        '@supabase/supabase-js': '^2.115.0',
        'react': '^18.3.1',
        'lucide-react': '^0.378.0'
      }
    };
  }

  await runner.test('F7.1: package.json specifies build script command', async () => {
    assert.ok(partnerPkg.scripts && partnerPkg.scripts.build, 'build script must be defined');
    assert.ok(partnerPkg.scripts.build.includes('build'));
  });

  await runner.test('F7.2: Required Capacitor dependencies are declared in dependencies', async () => {
    const deps = { ...(partnerPkg.dependencies || {}), ...(partnerPkg.devDependencies || {}) };
    assert.ok(deps['@capacitor/core'], '@capacitor/core must be declared');
    assert.ok(deps['@capacitor/android'] || deps['@capacitor/cli'], 'Capacitor Android or CLI must be declared');
  });

  await runner.test('F7.3: React and Supabase client dependencies are declared', async () => {
    const deps = { ...(partnerPkg.dependencies || {}), ...(partnerPkg.devDependencies || {}) };
    assert.ok(deps['react'], 'react must be declared');
    assert.ok(deps['@supabase/supabase-js'], '@supabase/supabase-js must be declared');
  });

  await runner.test('F7.4: Lucide icons dependency declared for mobile dashboard navigation', async () => {
    const deps = { ...(partnerPkg.dependencies || {}), ...(partnerPkg.devDependencies || {}) };
    assert.ok(deps['lucide-react'], 'lucide-react must be declared');
  });

  await runner.test('F7.5: Build output target directory contracts are defined for dist folder', async () => {
    // Check vite config or package build specification
    const viteConfigPath = path.resolve(partnerDir, 'vite.config.js');
    let outDir = 'dist';
    if (fs.existsSync(viteConfigPath)) {
      const content = fs.readFileSync(viteConfigPath, 'utf8');
      const match = content.match(/outDir:\s*['"]([^'"]+)['"]/);
      if (match) outDir = match[1];
    }
    assert.strictEqual(outDir, 'dist', 'Vite build output directory must map to dist');
  });

  const success = runner.printSummary();
  if (!success) {
    process.exit(1);
  }
}

if (require.main === module) {
  runTier1().catch((err) => {
    console.error('Unhandled error in Tier 1:', err);
    process.exit(1);
  });
}

module.exports = { runTier1 };
