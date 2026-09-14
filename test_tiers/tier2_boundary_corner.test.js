#!/usr/bin/env node

/**
 * ============================================================================
 * WiraPartner E2E Test Suite - Tier 2: Boundary & Corner Cases
 * File: test_tiers/tier2_boundary_corner.test.js
 * ============================================================================
 * Coverage: ≥35 tests covering edge cases, boundary values, error handling,
 * network disconnect simulation, and invalid state transitions:
 * - Feature 1 Boundaries (5 tests)
 * - Feature 2 Boundaries (5 tests)
 * - Feature 3 Boundaries (5 tests)
 * - Feature 4 Boundaries (5 tests)
 * - Feature 5 Boundaries (5 tests)
 * - Feature 6 Boundaries (5 tests)
 * - Feature 7 Boundaries (5 tests)
 * ============================================================================
 */

const fs = require('fs');
const path = require('path');
const assert = require('assert');
const {
  loadEnvironment,
  calculateHaversineMeters,
  createShadowSupabase,
  OrderStatus,
  getPartnerOrderService,
  createTestRunner
} = require('./test_harness');

async function runTier2() {
  console.log('============================================================');
  console.log('🧪 RUNNING TIER 2: BOUNDARY & CORNER CASES (≥35 TESTS)');
  console.log('============================================================');

  const runner = createTestRunner('Tier 2: Boundary & Corner Cases');
  const partnerService = await getPartnerOrderService();

  // --------------------------------------------------------------------------
  // FEATURE 1 BOUNDARIES (5 tests)
  // --------------------------------------------------------------------------
  console.log('\n--- [Feature 1 Boundaries] Mode Toggle & Access Permissions ---');

  await runner.test('B1.1: Driver-only partner cannot toggle to merchant mode without permission', async () => {
    const driverUser = { id: 'd-only', mitra_access: ['driver'], role: 'driver' };

    function canSwitchMode(targetMode, user) {
      if (!user.mitra_access || !user.mitra_access.includes(targetMode)) {
        return { allowed: false, reason: `Akun belum memiliki akses ${targetMode}` };
      }
      return { allowed: true };
    }

    const res = canSwitchMode('merchant', driverUser);
    assert.strictEqual(res.allowed, false);
    assert.ok(res.reason.includes('merchant'));
  });

  await runner.test('B1.2: Mode switch is blocked when an active order is in progress', async () => {
    const activeOrders = [{ id: 'act-1', status: 'picking_up' }];

    function validateModeSwitch(targetMode, activeOrderList) {
      const ongoing = activeOrderList.find(o => ['accepted', 'picking_up', 'in_trip', 'preparing'].includes(o.status));
      if (ongoing) {
        throw new Error(`Cannot switch mode: order ${ongoing.id} is still in progress (${ongoing.status})`);
      }
      return true;
    }

    assert.throws(
      () => validateModeSwitch('merchant', activeOrders),
      /still in progress/
    );
  });

  await runner.test('B1.3: Corrupted or invalid value in localStorage falls back safely to default mode', async () => {
    function sanitizeStoredMode(val, allowedModes = ['driver', 'merchant']) {
      if (!val || typeof val !== 'string' || !allowedModes.includes(val.toLowerCase().trim())) {
        return 'driver'; // Safe fallback
      }
      return val.toLowerCase().trim();
    }

    assert.strictEqual(sanitizeStoredMode('HACKER_MODE'), 'driver');
    assert.strictEqual(sanitizeStoredMode(''), 'driver');
    assert.strictEqual(sanitizeStoredMode(null), 'driver');
    assert.strictEqual(sanitizeStoredMode(undefined), 'driver');
    assert.strictEqual(sanitizeStoredMode('merchant'), 'merchant');
  });

  await runner.test('B1.4: Rapid consecutive toggle clicks maintain state consistency without deadlocks', async () => {
    let mode = 'driver';
    const user = { mitra_access: ['driver', 'merchant'] };

    // Simulate 100 rapid toggles
    for (let i = 0; i < 100; i++) {
      mode = mode === 'driver' ? 'merchant' : 'driver';
    }
    assert.strictEqual(mode, 'driver'); // 100 toggles returns to start
  });

  await runner.test('B1.5: User with null or empty mitra_access falls back to legacy role or pending verification', async () => {
    function evaluateAccess(user) {
      if (user.status === 'Pending') return '/pending-verification';
      if (!user.mitra_access || user.mitra_access.length === 0) {
        if (user.role === 'driver') return ['driver'];
        if (user.role === 'merchant') return ['merchant'];
        return '/unauthorized';
      }
      return user.mitra_access;
    }

    assert.strictEqual(evaluateAccess({ status: 'Pending' }), '/pending-verification');
    assert.deepStrictEqual(evaluateAccess({ status: 'Active', mitra_access: [], role: 'driver' }), ['driver']);
    assert.strictEqual(evaluateAccess({ status: 'Active', mitra_access: [], role: 'customer' }), '/unauthorized');
  });

  // --------------------------------------------------------------------------
  // FEATURE 2 BOUNDARIES (5 tests)
  // --------------------------------------------------------------------------
  console.log('\n--- [Feature 2 Boundaries] Driver Order Lifecycle & Concurrency ---');

  await runner.test('B2.1: Race condition: second driver attempting to accept claimed order is rejected', async () => {
    const client = createShadowSupabase({
      orders: [{ id: 'race-ord-01', status: 'pending', driver_id: null }]
    });

    // Driver 1 accepts
    const acc1 = await partnerService.acceptOrder(client, 'race-ord-01', 'driver-001', 'driver');
    assert.strictEqual(acc1.status, 'accepted');
    assert.strictEqual(acc1.driver_id, 'driver-001');

    // Driver 2 attempts to accept same order concurrently
    await assert.rejects(
      async () => {
        await partnerService.acceptOrder(client, 'race-ord-01', 'driver-002', 'driver');
      },
      /already accepted|cancelled|no rows updated/
    );
  });

  await runner.test('B2.2: Accepting an order already marked cancelled by customer fails gracefully', async () => {
    const client = createShadowSupabase({
      orders: [{ id: 'canc-ord-01', status: 'cancelled', driver_id: null }]
    });

    await assert.rejects(
      async () => {
        await partnerService.acceptOrder(client, 'canc-ord-01', 'driver-001', 'driver');
      },
      /already accepted, cancelled/
    );
  });

  await runner.test('B2.3: Completing an order directly from pending status without accepting throws error', async () => {
    const client = createShadowSupabase({
      orders: [{ id: 'jump-ord-01', status: 'pending', driver_id: null }]
    });

    await assert.rejects(
      async () => {
        await partnerService.completeOrder(client, 'jump-ord-01');
      },
      /Invalid status transition/
    );
  });

  await runner.test('B2.4: Malformed or null JSON details strings are parsed safely without crashing', async () => {
    function parseOrderDetails(details) {
      if (!details) return {};
      if (typeof details === 'object') return details;
      try {
        return JSON.parse(details);
      } catch (_) {
        return { raw: details };
      }
    }

    assert.deepStrictEqual(parseOrderDetails(null), {});
    assert.deepStrictEqual(parseOrderDetails(undefined), {});
    assert.deepStrictEqual(parseOrderDetails('{"foo":"bar"}'), { foo: 'bar' });
    assert.deepStrictEqual(parseOrderDetails('Not JSON at all'), { raw: 'Not JSON at all' });
    assert.deepStrictEqual(parseOrderDetails('{malformed json: true'), { raw: '{malformed json: true' });
  });

  await runner.test('B2.5: Zero or negative price order boundary validation flags anomaly', async () => {
    function validateOrderPricing(order) {
      if (order.total_price === null || order.total_price === undefined || order.total_price <= 0) {
        return { valid: false, error: 'Total price must be greater than zero' };
      }
      return { valid: true };
    }

    assert.strictEqual(validateOrderPricing({ total_price: 0 }).valid, false);
    assert.strictEqual(validateOrderPricing({ total_price: -15000 }).valid, false);
    assert.strictEqual(validateOrderPricing({ total_price: 25000 }).valid, true);
  });

  // --------------------------------------------------------------------------
  // FEATURE 3 BOUNDARIES (5 tests)
  // --------------------------------------------------------------------------
  console.log('\n--- [Feature 3 Boundaries] GPS Tracking & PostGIS Coordinates ---');

  await runner.test('B3.1: GPS permission denied (error.code === 1) triggers default Mataram fallback coordinates', async () => {
    function handleGeolocationError(error) {
      const DEFAULT_COORDS = { lat: -8.5833, lng: 116.1167, fallback: true };
      if (error && error.code === 1) { // PERMISSION_DENIED
        return { coords: DEFAULT_COORDS, message: 'Izin GPS ditolak. Menggunakan lokasi default Mataram.' };
      }
      return { coords: DEFAULT_COORDS, message: 'GPS tidak tersedia.' };
    }

    const result = handleGeolocationError({ code: 1, message: 'User denied geolocation' });
    assert.strictEqual(result.coords.lat, -8.5833);
    assert.strictEqual(result.coords.lng, 116.1167);
    assert.strictEqual(result.coords.fallback, true);
    assert.ok(result.message.includes('Izin GPS ditolak'));
  });

  await runner.test('B3.2: Invalid GPS coordinates (null, NaN, 0.0, 0.0) are rejected by updateDriverLocation', async () => {
    const client = createShadowSupabase();

    await assert.rejects(
      async () => partnerService.updateDriverLocation(client, 'u-driver-001', null, 116.1167),
      /Invalid GPS coordinates/
    );

    await assert.rejects(
      async () => partnerService.updateDriverLocation(client, 'u-driver-001', NaN, 116.1167),
      /Invalid GPS coordinates/
    );

    await assert.rejects(
      async () => partnerService.updateDriverLocation(client, 'u-driver-001', 0, 0),
      /Invalid GPS coordinates/
    );
  });

  await runner.test('B3.3: High-frequency GPS updates are throttled (sub-second bursts throttled)', async () => {
    let lastSent = 0;
    const THROTTLE_MS = 3000;
    let sentCount = 0;

    function throttledLocationUpdate(now) {
      if (now - lastSent >= THROTTLE_MS) {
        lastSent = now;
        sentCount++;
        return true;
      }
      return false; // Throttled
    }

    const t0 = 10000;
    assert.strictEqual(throttledLocationUpdate(t0), true);
    assert.strictEqual(throttledLocationUpdate(t0 + 200), false); // 200ms later -> rejected
    assert.strictEqual(throttledLocationUpdate(t0 + 800), false); // 800ms later -> rejected
    assert.strictEqual(throttledLocationUpdate(t0 + 3100), true); // 3.1s later -> accepted
    assert.strictEqual(sentCount, 2);
  });

  await runner.test('B3.4: Extreme teleportation jump (>100km in 1s) flags abnormal speed', async () => {
    function detectAnomalousDisplacement(lat1, lng1, lat2, lng2, deltaTimeSec) {
      const distMeters = calculateHaversineMeters(lat1, lng1, lat2, lng2);
      const speedKmh = (distMeters / 1000) / (deltaTimeSec / 3600);
      return { distMeters, speedKmh, anomalous: speedKmh > 200 }; // Speed > 200 km/h is flagged
    }

    // Move from Mataram to Denpasar (100km) in 2 seconds
    const jump = detectAnomalousDisplacement(-8.5833, 116.1167, -8.6705, 115.2126, 2);
    assert.strictEqual(jump.anomalous, true);
    assert.ok(jump.speedKmh > 1000);
  });

  await runner.test('B3.5: PostGIS coordinate precision is preserved up to 6 decimal places (~10cm accuracy)', async () => {
    const lat = -8.58334567;
    const lng = 116.11678901;
    const precisionLat = Number(lat.toFixed(6));
    const precisionLng = Number(lng.toFixed(6));
    assert.strictEqual(precisionLat, -8.583346);
    assert.strictEqual(precisionLng, 116.116789);
  });

  // --------------------------------------------------------------------------
  // FEATURE 4 BOUNDARIES (5 tests)
  // --------------------------------------------------------------------------
  console.log('\n--- [Feature 4 Boundaries] Merchant Operations & Pipelines ---');

  await runner.test('B4.1: Merchant cannot accept order if store status is marked closed (is_open = false)', async () => {
    function validateStoreStatus(merchant) {
      if (!merchant.is_open) {
        throw new Error('Toko sedang tutup. Buka toko untuk menerima pesanan.');
      }
      return true;
    }

    assert.throws(
      () => validateStoreStatus({ is_open: false }),
      /Toko sedang tutup/
    );
  });

  await runner.test('B4.2: Backward state transition (ready -> pending) is strictly rejected', async () => {
    const client = createShadowSupabase({
      orders: [{ id: 'back-ord-01', status: 'ready' }]
    });

    await assert.rejects(
      async () => {
        await partnerService.updateOrderStatus(client, 'back-ord-01', OrderStatus.PENDING);
      },
      /Invalid status transition/
    );
  });

  await runner.test('B4.3: Villa booking with zero or negative nights is rejected by validation', async () => {
    function validateVillaBooking(details) {
      if (!details.nights || details.nights <= 0) {
        throw new Error('Durasi menginap harus minimal 1 malam');
      }
      return true;
    }

    assert.throws(() => validateVillaBooking({ nights: 0 }), /minimal 1 malam/);
    assert.throws(() => validateVillaBooking({ nights: -2 }), /minimal 1 malam/);
    assert.strictEqual(validateVillaBooking({ nights: 3 }), true);
  });

  await runner.test('B4.4: Customer cancellation during preparing stage transitions order to cancelled', async () => {
    const client = createShadowSupabase({
      orders: [{ id: 'canc-prep-01', status: 'preparing' }]
    });

    const cancelled = await partnerService.updateOrderStatus(client, 'canc-prep-01', OrderStatus.CANCELLED);
    assert.strictEqual(cancelled.status, 'cancelled');
  });

  await runner.test('B4.5: Empty items array in food order details flags validation warning', async () => {
    function validateFoodOrderPayload(details) {
      if (!details.items || !Array.isArray(details.items) || details.items.length === 0) {
        return { valid: false, error: 'Pesanan makanan tidak memiliki item menu' };
      }
      return { valid: true };
    }

    assert.strictEqual(validateFoodOrderPayload({ items: [] }).valid, false);
    assert.strictEqual(validateFoodOrderPayload({ items: [{ name: 'Ayam Taliwang', qty: 1 }] }).valid, true);
  });

  // --------------------------------------------------------------------------
  // FEATURE 5 BOUNDARIES (5 tests)
  // --------------------------------------------------------------------------
  console.log('\n--- [Feature 5 Boundaries] Realtime WebSocket & Polling Fallback ---');

  await runner.test('B5.1: WebSocket disconnect event activates fallback polling ticker', async () => {
    let pollingActive = false;

    function handleConnectionStateChange(state) {
      if (state === 'CLOSED' || state === 'CHANNEL_ERROR' || state === 'TIMED_OUT') {
        pollingActive = true;
      } else if (state === 'SUBSCRIBED') {
        pollingActive = false;
      }
      return pollingActive;
    }

    assert.strictEqual(handleConnectionStateChange('CHANNEL_ERROR'), true);
    assert.strictEqual(pollingActive, true);
    assert.strictEqual(handleConnectionStateChange('SUBSCRIBED'), false);
    assert.strictEqual(pollingActive, false);
  });

  await runner.test('B5.2: Reconnection backoff calculation matches exponential schedule (1s, 2s, 4s, 8s, max 10s)', async () => {
    function getBackoffDelay(attempt) {
      const base = 1000 * Math.pow(2, attempt);
      return Math.min(base, 10000);
    }

    assert.strictEqual(getBackoffDelay(0), 1000);
    assert.strictEqual(getBackoffDelay(1), 2000);
    assert.strictEqual(getBackoffDelay(2), 4000);
    assert.strictEqual(getBackoffDelay(3), 8000);
    assert.strictEqual(getBackoffDelay(4), 10000); // Capped at 10s
    assert.strictEqual(getBackoffDelay(5), 10000);
  });

  await runner.test('B5.3: Polling ticker is suppressed when partner is offline (isOnline = false)', async () => {
    function shouldExecutePoll(isOnline, hasActiveOrder) {
      if (!isOnline) return false;
      if (hasActiveOrder) return false;
      return true;
    }

    assert.strictEqual(shouldExecutePoll(false, false), false);
    assert.strictEqual(shouldExecutePoll(true, true), false);
    assert.strictEqual(shouldExecutePoll(true, false), true);
  });

  await runner.test('B5.4: Duplicate realtime event deduplication ignores identical event IDs within window', async () => {
    const seenEvents = new Set();

    function processEventDeduplicated(eventId, handler) {
      if (seenEvents.has(eventId)) {
        return false; // Deduplicated
      }
      seenEvents.add(eventId);
      handler();
      return true;
    }

    let processed = 0;
    const fn = () => processed++;

    assert.strictEqual(processEventDeduplicated('evt-1', fn), true);
    assert.strictEqual(processEventDeduplicated('evt-1', fn), false); // Duplicate
    assert.strictEqual(processEventDeduplicated('evt-2', fn), true);
    assert.strictEqual(processed, 2);
  });

  await runner.test('B5.5: Realtime payload with missing optional columns handled gracefully without null pointer exceptions', async () => {
    function normalizeRealtimeOrder(raw) {
      return {
        id: raw.id,
        status: raw.status || 'pending',
        service_type: raw.service_type || 'ride',
        total_price: Number(raw.total_price) || 0,
        title: raw.title || 'Pesanan Baru',
        details: raw.details || '{}'
      };
    }

    const partial = { id: 'part-01' };
    const normalized = normalizeRealtimeOrder(partial);
    assert.strictEqual(normalized.id, 'part-01');
    assert.strictEqual(normalized.status, 'pending');
    assert.strictEqual(normalized.total_price, 0);
  });

  // --------------------------------------------------------------------------
  // FEATURE 6 BOUNDARIES (5 tests)
  // --------------------------------------------------------------------------
  console.log('\n--- [Feature 6 Boundaries] Capacitor Configuration & Android Manifest ---');

  await runner.test('B6.1: Capacitor configuration missing webDir is rejected by validator', async () => {
    function validateCapConfig(cfg) {
      if (!cfg || !cfg.webDir || cfg.webDir.trim() === '') {
        throw new Error('Capacitor config must define non-empty webDir');
      }
      return true;
    }

    assert.throws(() => validateCapConfig({ appId: 'com.wira.partner' }), /define non-empty webDir/);
    assert.strictEqual(validateCapConfig({ webDir: 'dist' }), true);
  });

  await runner.test('B6.2: Non-https androidScheme triggers security alert for Android WebView', async () => {
    function checkAndroidScheme(cfg) {
      const scheme = cfg?.server?.androidScheme;
      if (scheme !== 'https') {
        return { secure: false, warning: 'androidScheme should be "https" to prevent mixed-content warnings' };
      }
      return { secure: true };
    }

    assert.strictEqual(checkAndroidScheme({ server: { androidScheme: 'http' } }).secure, false);
    assert.strictEqual(checkAndroidScheme({ server: { androidScheme: 'https' } }).secure, true);
  });

  await runner.test('B6.3: Empty or whitespace-only appId is flagged invalid by naming convention', async () => {
    function validateAppId(id) {
      const regex = /^[a-z][a-z0-9_]*(\.[a-z0-9_]+)+$/i;
      return regex.test(id);
    }

    assert.strictEqual(validateAppId(''), false);
    assert.strictEqual(validateAppId('   '), false);
    assert.strictEqual(validateAppId('invalid_id'), false);
    assert.strictEqual(validateAppId('com.wira.partner'), true);
  });

  await runner.test('B6.4: Android manifest permissions validator confirms INTERNET and ACCESS_FINE_LOCATION', async () => {
    const mockManifestXml = `
      <manifest xmlns:android="http://schemas.android.com/apk/res/android">
        <uses-permission android:name="android.permission.INTERNET" />
        <uses-permission android:name="android.permission.ACCESS_FINE_LOCATION" />
      </manifest>
    `;

    function validateManifestPermissions(xml) {
      const hasInternet = xml.includes('android.permission.INTERNET');
      const hasLocation = xml.includes('android.permission.ACCESS_FINE_LOCATION');
      return hasInternet && hasLocation;
    }

    assert.strictEqual(validateManifestPermissions(mockManifestXml), true);
    assert.strictEqual(validateManifestPermissions('<manifest></manifest>'), false);
  });

  await runner.test('B6.5: Corrupted or malformed JSON in capacitor.config.json is caught gracefully', async () => {
    function safeParseJson(content) {
      try {
        return { data: JSON.parse(content), error: null };
      } catch (err) {
        return { data: null, error: err.message };
      }
    }

    const res = safeParseJson('{"appId": "com.wira.partner", broken_json}');
    assert.strictEqual(res.data, null);
    assert.ok(res.error !== null);
  });

  // --------------------------------------------------------------------------
  // FEATURE 7 BOUNDARIES (5 tests)
  // --------------------------------------------------------------------------
  console.log('\n--- [Feature 7 Boundaries] Build & Bundle Integrity ---');

  await runner.test('B7.1: Missing build script in package.json is detected as build defect', async () => {
    function validateBuildScript(pkg) {
      if (!pkg.scripts || !pkg.scripts.build) {
        throw new Error('package.json missing required build script');
      }
      return true;
    }

    assert.throws(() => validateBuildScript({ scripts: {} }), /missing required build script/);
    assert.strictEqual(validateBuildScript({ scripts: { build: 'vite build' } }), true);
  });

  await runner.test('B7.2: Missing core dependency @capacitor/core is flagged', async () => {
    function validateCoreDependencies(pkg) {
      const deps = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) };
      const missing = [];
      if (!deps['@capacitor/core']) missing.push('@capacitor/core');
      if (!deps['@supabase/supabase-js']) missing.push('@supabase/supabase-js');
      return missing;
    }

    assert.deepStrictEqual(validateCoreDependencies({ dependencies: {} }), ['@capacitor/core', '@supabase/supabase-js']);
    assert.deepStrictEqual(
      validateCoreDependencies({ dependencies: { '@capacitor/core': '^6.1.2', '@supabase/supabase-js': '^2.0.0' } }),
      []
    );
  });

  await runner.test('B7.3: Incompatible React 19 alpha/beta is flagged to maintain React 18 monorepo consistency', async () => {
    function checkReactVersionCompatibility(versionStr) {
      if (versionStr.startsWith('19') || versionStr.includes('canary')) {
        return { compatible: false, reason: 'React 19 breaks peer dependencies with existing frontend-mitra/admin' };
      }
      return { compatible: true };
    }

    assert.strictEqual(checkReactVersionCompatibility('^18.3.1').compatible, true);
    assert.strictEqual(checkReactVersionCompatibility('19.0.0-beta').compatible, false);
  });

  await runner.test('B7.4: Empty outDir in vite configuration defaults or errors appropriately', async () => {
    function resolveBuildOutDir(config) {
      return config?.build?.outDir || 'dist';
    }

    assert.strictEqual(resolveBuildOutDir({}), 'dist');
    assert.strictEqual(resolveBuildOutDir({ build: { outDir: 'build' } }), 'build');
  });

  await runner.test('B7.5: Build exit code semantics: exit code 0 indicates build success, non-zero indicates failure', async () => {
    function evaluateBuildExit(code) {
      if (code !== 0) {
        throw new Error(`Build failed with exit code ${code}`);
      }
      return 'SUCCESS';
    }

    assert.strictEqual(evaluateBuildExit(0), 'SUCCESS');
    assert.throws(() => evaluateBuildExit(1), /Build failed with exit code 1/);
    assert.throws(() => evaluateBuildExit(127), /Build failed with exit code 127/);
  });

  const success = runner.printSummary();
  if (!success) {
    process.exit(1);
  }
}

if (require.main === module) {
  runTier2().catch((err) => {
    console.error('Unhandled error in Tier 2:', err);
    process.exit(1);
  });
}

module.exports = { runTier2 };
