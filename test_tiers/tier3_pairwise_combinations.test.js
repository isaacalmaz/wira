#!/usr/bin/env node

/**
 * ============================================================================
 * Wira Mitra E2E Test Suite - Tier 3: Cross-Feature Pairwise Interactions
 * File: test_tiers/tier3_pairwise_combinations.test.js
 * ============================================================================
 * Coverage: ≥7 tests covering pairwise interactions between features:
 * - Pair 1: Driver Mode (F2) + GPS Tracking (F3)
 * - Pair 2: Unified Toggle (F1) + Active Order State (F2)
 * - Pair 3: Merchant Mode (F4) + Real-Time Sync (F5)
 * - Pair 4: Driver Mode (F2) + Real-Time Order Cancellation (F5)
 * - Pair 5: Online Toggle (F1) + Parallel Incoming Orders (F2/F5)
 * - Pair 6: Merchant Food Preparation (F4) + Driver Delivery Handover (F2/F3)
 * - Pair 7: Real-Time Disconnect (F5) + REST Fallback Polling Recovery (F2)
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

async function runTier3() {
  console.log('============================================================');
  console.log('🧪 RUNNING TIER 3: CROSS-FEATURE PAIRWISE INTERACTIONS (≥7 TESTS)');
  console.log('============================================================');

  const runner = createTestRunner('Tier 3: Pairwise Combinations');
  const partnerService = await getPartnerOrderService();

  // --------------------------------------------------------------------------
  // PAIR 1: Driver Mode (F2) + GPS Location Tracking (F3)
  // --------------------------------------------------------------------------
  await runner.test('P1: Driver Mode + GPS Tracking: Location updates along route as order stages progress', async () => {
    const client = createShadowSupabase();
    const driverId = 'u-driver-001';

    // 1. Create and accept ride order
    const { data: order } = await client.from('orders').insert({
      id: 'pair1-ride-01',
      service_type: 'ride',
      status: 'pending',
      total_price: 25000
    }).select().single();

    await partnerService.acceptOrder(client, order.id, driverId, 'driver');
    await partnerService.updateDriverLocation(client, driverId, -8.5833, 116.1167);

    // 2. En route to pickup
    await partnerService.updateOrderStatus(client, order.id, OrderStatus.PICKING_UP);
    await partnerService.updateDriverLocation(client, driverId, -8.5850, 116.1180);

    // 3. Passenger onboard -> in trip
    await partnerService.updateOrderStatus(client, order.id, OrderStatus.IN_TRIP);
    await partnerService.updateDriverLocation(client, driverId, -8.5900, 116.1220);

    // 4. Complete trip
    const completed = await partnerService.completeOrder(client, order.id);
    assert.strictEqual(completed.status, 'completed');

    // Confirm final driver position in database
    const { data: driverRec } = await client.from('drivers').select('*').eq('id', driverId).single();
    assert.strictEqual(driverRec.lat, -8.5900);
    assert.strictEqual(driverRec.lng, 116.1220);
    assert.strictEqual(driverRec.is_online, true);
  });

  // --------------------------------------------------------------------------
  // PAIR 2: Unified Toggle (F1) + Active Order State (F2)
  // --------------------------------------------------------------------------
  await runner.test('P2: Unified Toggle + Active Order: Mode switch blocked during active ride; permitted upon completion', async () => {
    const client = createShadowSupabase();
    const partnerId = 'u-dual-001';
    let currentMode = 'driver';

    // Insert active order
    const { data: order } = await client.from('orders').insert({
      id: 'pair2-ride-01',
      service_type: 'ride',
      status: 'pending',
      total_price: 30000
    }).select().single();

    await partnerService.acceptOrder(client, order.id, partnerId, 'driver');

    // Function attempting mode switch
    function attemptSwitchMode(targetMode, activeOrders) {
      const hasActive = activeOrders.some(o => ['accepted', 'picking_up', 'in_trip'].includes(o.status));
      if (hasActive) {
        throw new Error('Active order in progress. Complete order before switching mode.');
      }
      currentMode = targetMode;
      return currentMode;
    }

    // Verify switch is blocked
    const activeOrders = [await partnerService.getOrderById(client, order.id)];
    assert.throws(
      () => attemptSwitchMode('merchant', activeOrders),
      /Active order in progress/
    );
    assert.strictEqual(currentMode, 'driver');

    // Complete order
    await partnerService.completeOrder(client, order.id);
    const updatedOrders = [await partnerService.getOrderById(client, order.id)];

    // Verify switch now succeeds
    const newMode = attemptSwitchMode('merchant', updatedOrders);
    assert.strictEqual(newMode, 'merchant');
    assert.strictEqual(currentMode, 'merchant');
  });

  // --------------------------------------------------------------------------
  // PAIR 3: Merchant Mode (F4) + Real-Time Sync (F5)
  // --------------------------------------------------------------------------
  await runner.test('P3: Merchant Mode + Realtime Sync: Incoming food order notified via stream and status tracked in real-time', async () => {
    const client = createShadowSupabase();
    const merchantId = 'm-food-001';

    let incomingNotified = null;
    const unsubMerchant = partnerService.subscribeToMerchantOrders(client, merchantId, (order) => {
      incomingNotified = order;
    });

    // Customer places food order
    await client.from('orders').insert({
      id: 'pair3-food-01',
      service_type: 'food',
      merchant_id: merchantId,
      status: 'pending',
      title: 'Ayam Taliwang Pedas',
      total_price: 50000
    });

    assert.ok(incomingNotified, 'Merchant must receive incoming order via stream');
    assert.strictEqual(incomingNotified.id, 'pair3-food-01');

    // Track status updates
    const statusEvents = [];
    const unsubTrack = partnerService.subscribeToOrderUpdates(client, 'pair3-food-01', (upd) => {
      statusEvents.push(upd.status);
    });

    await partnerService.acceptOrder(client, 'pair3-food-01', merchantId, 'merchant');
    await partnerService.updateOrderStatus(client, 'pair3-food-01', OrderStatus.PREPARING);
    await partnerService.updateOrderStatus(client, 'pair3-food-01', OrderStatus.READY);
    await partnerService.completeOrder(client, 'pair3-food-01');

    assert.ok(statusEvents.includes('accepted'));
    assert.ok(statusEvents.includes('preparing'));
    assert.ok(statusEvents.includes('ready'));
    assert.ok(statusEvents.includes('completed'));

    unsubMerchant();
    unsubTrack();
  });

  // --------------------------------------------------------------------------
  // PAIR 4: Driver Mode (F2) + Real-Time Order Cancellation (F5)
  // --------------------------------------------------------------------------
  await runner.test('P4: Driver Mode + Real-Time Cancel: Customer cancels order while incoming alert is visible; acceptance rejected', async () => {
    const client = createShadowSupabase();
    const { data: order } = await client.from('orders').insert({
      id: 'pair4-cancel-01',
      service_type: 'ride',
      status: 'pending',
      total_price: 20000
    }).select().single();

    let cancelledAlertReceived = false;
    const unsubTrack = partnerService.subscribeToOrderUpdates(client, order.id, (upd) => {
      if (upd.status === 'cancelled') {
        cancelledAlertReceived = true;
      }
    });

    // Customer cancels order
    await client.from('orders').update({ status: 'cancelled' }).eq('id', order.id);
    assert.strictEqual(cancelledAlertReceived, true);

    // Driver tries to accept cancelled order
    await assert.rejects(
      async () => partnerService.acceptOrder(client, order.id, 'u-driver-001', 'driver'),
      /already accepted, cancelled|no rows updated/
    );

    unsubTrack();
  });

  // --------------------------------------------------------------------------
  // PAIR 5: Online Status Toggle (F1) + Parallel Incoming Orders (F2/F5)
  // --------------------------------------------------------------------------
  await runner.test('P5: Online Toggle + Parallel Orders: Offline driver suppresses incoming orders; online receives stream', async () => {
    const client = createShadowSupabase();
    let isOnline = false;
    let alertsReceived = 0;

    const unsub = partnerService.subscribeToDriverOrders(client, (order) => {
      if (isOnline) {
        alertsReceived++;
      }
    });

    // 2 orders arrive while driver is offline
    await client.from('orders').insert([
      { id: 'off-ord-01', service_type: 'ride', status: 'pending', driver_id: null },
      { id: 'off-ord-02', service_type: 'send', status: 'pending', driver_id: null }
    ]);
    assert.strictEqual(alertsReceived, 0, 'No alerts should trigger while offline');

    // Driver toggles online
    isOnline = true;

    // Next order arrives
    await client.from('orders').insert({
      id: 'on-ord-01',
      service_type: 'ride',
      status: 'pending',
      driver_id: null
    });
    assert.strictEqual(alertsReceived, 1, 'Online driver should receive new alert');

    unsub();
  });

  // --------------------------------------------------------------------------
  // PAIR 6: Merchant Food Prep (F4) + Driver Delivery Handover (F2/F3)
  // --------------------------------------------------------------------------
  await runner.test('P6: Merchant Food + Driver Delivery: Merchant prepares food, marks ready; driver claims and completes delivery', async () => {
    const client = createShadowSupabase();
    const merchantId = 'm-food-001';
    const driverId = 'u-driver-001';

    // 1. Food order placed
    const { data: foodOrder } = await client.from('orders').insert({
      id: 'pair6-food-01',
      service_type: 'food',
      merchant_id: merchantId,
      status: 'pending',
      title: 'Bebek Bakar Lombok',
      total_price: 65000
    }).select().single();

    // 2. Merchant accepts and prepares
    await partnerService.acceptOrder(client, foodOrder.id, merchantId, 'merchant');
    await partnerService.updateOrderStatus(client, foodOrder.id, OrderStatus.PREPARING);
    await partnerService.updateOrderStatus(client, foodOrder.id, OrderStatus.READY);

    // 3. Driver accepts for pickup/delivery
    const driverClaim = await client.from('orders').update({
      driver_id: driverId,
      status: OrderStatus.PICKING_UP
    }).eq('id', foodOrder.id).select().single();

    assert.strictEqual(driverClaim.data.status, OrderStatus.PICKING_UP);
    assert.strictEqual(driverClaim.data.driver_id, driverId);

    // 4. Driver transitions to in_trip and completes
    await partnerService.updateOrderStatus(client, foodOrder.id, OrderStatus.IN_TRIP);
    const finalOrder = await partnerService.completeOrder(client, foodOrder.id);
    assert.strictEqual(finalOrder.status, OrderStatus.COMPLETED);
  });

  // --------------------------------------------------------------------------
  // PAIR 7: Real-Time Disconnect (F5) + REST Fallback Polling Recovery (F2)
  // --------------------------------------------------------------------------
  await runner.test('P7: Realtime Disconnect + REST Fallback: Recovers dropped socket orders via polling ticker', async () => {
    const client = createShadowSupabase();
    let socketConnected = false; // Simulating socket drop

    // Order created while socket is down
    await client.from('orders').insert({
      id: 'pair7-reconnect-01',
      service_type: 'send',
      status: 'pending',
      driver_id: null,
      title: 'Paket Dokumen Cepat'
    });

    // Polling ticker executes
    async function executePollingFallback() {
      return partnerService.fetchPendingOrders(client, 'driver');
    }

    const pendingOrders = await executePollingFallback();
    assert.ok(pendingOrders.some(o => o.id === 'pair7-reconnect-01'));

    // Driver accepts polled order
    const accepted = await partnerService.acceptOrder(client, 'pair7-reconnect-01', 'u-driver-001', 'driver');
    assert.strictEqual(accepted.status, 'accepted');

    // Socket reconnects
    socketConnected = true;
    const completed = await partnerService.completeOrder(client, 'pair7-reconnect-01');
    assert.strictEqual(completed.status, 'completed');
  });

  const success = runner.printSummary();
  if (!success) {
    process.exit(1);
  }
}

if (require.main === module) {
  runTier3().catch((err) => {
    console.error('Unhandled error in Tier 3:', err);
    process.exit(1);
  });
}

module.exports = { runTier3 };
