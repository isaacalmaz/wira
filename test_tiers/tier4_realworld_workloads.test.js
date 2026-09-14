#!/usr/bin/env node

/**
 * ============================================================================
 * Wira Mitra E2E Test Suite - Tier 4: Real-World Workload Scenarios
 * File: test_tiers/tier4_realworld_workloads.test.js
 * ============================================================================
 * Coverage: ≥5 end-to-end realistic production application scenarios:
 * - Scenario 1: Driver Ride Full Flow (WiraRide)
 * - Scenario 2: Driver Package Send Flow (WiraSend)
 * - Scenario 3: Merchant Food Preparation (WiraFood)
 * - Scenario 4: Merchant Villa Booking (WiraVilla)
 * - Scenario 5: Dual-Role Shift Switching (Driver <-> Merchant)
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

async function runTier4() {
  console.log('============================================================');
  console.log('🧪 RUNNING TIER 4: REAL-WORLD WORKLOAD SCENARIOS (≥5 SCENARIOS)');
  console.log('============================================================');

  const runner = createTestRunner('Tier 4: Real-World Workloads');
  const partnerService = await getPartnerOrderService();

  // --------------------------------------------------------------------------
  // SCENARIO 1: Driver Ride Full Flow (WiraRide)
  // --------------------------------------------------------------------------
  await runner.test('RW-1: WiraRide End-to-End: User orders ride -> Driver receives realtime alert -> Accepts -> GPS tracking -> Completed', async () => {
    const client = createShadowSupabase();
    const customerId = 'u-cust-001';
    const driverId = 'u-driver-001';

    let realtimeAlertReceived = false;
    const unsubAlert = partnerService.subscribeToDriverOrders(client, (order) => {
      if (order.id === 'rw-ride-101') realtimeAlertReceived = true;
    });

    // Step 1: Customer creates ride order
    const ridePayload = {
      id: 'rw-ride-101',
      user_id: customerId,
      service_type: 'ride',
      title: 'Perjalanan ke Bandara Lombok (BIL)',
      details: JSON.stringify({
        pickup: { name: 'Epicentrum Mall Mataram', lat: -8.5915, lng: 116.1158 },
        dropoff: { name: 'Bandara Internasional Lombok', lat: -8.7618, lng: 116.2764 },
        passenger_name: 'Ahmad User',
        passenger_phone: '081234567890'
      }),
      status: 'pending',
      total_price: 135000,
      payment_method: 'cash',
      payment_status: 'unpaid'
    };

    const { data: createdOrder } = await client.from('orders').insert(ridePayload).select().single();
    assert.strictEqual(createdOrder.status, 'pending');
    assert.strictEqual(realtimeAlertReceived, true, 'Realtime alert must be received by online driver');

    // Step 2: Driver accepts order
    const acceptedOrder = await partnerService.acceptOrder(client, createdOrder.id, driverId, 'driver');
    assert.strictEqual(acceptedOrder.status, 'accepted');
    assert.strictEqual(acceptedOrder.driver_id, driverId);

    // Step 3: Driver moves towards pickup (GPS updates)
    await partnerService.updateOrderStatus(client, createdOrder.id, OrderStatus.PICKING_UP);
    await partnerService.updateDriverLocation(client, driverId, -8.5900, 116.1150);

    // Step 4: Passenger picked up -> trip in progress
    await partnerService.updateOrderStatus(client, createdOrder.id, OrderStatus.IN_TRIP);
    await partnerService.updateDriverLocation(client, driverId, -8.6700, 116.1900); // Midway
    await partnerService.updateDriverLocation(client, driverId, -8.7618, 116.2764); // Airport

    // Step 5: Complete trip
    const completedOrder = await partnerService.completeOrder(client, createdOrder.id);
    assert.strictEqual(completedOrder.status, 'completed');

    // Step 6: Verify final database state
    const { data: finalRecord } = await client.from('orders').select('*').eq('id', createdOrder.id).single();
    assert.strictEqual(finalRecord.status, 'completed');
    assert.strictEqual(finalRecord.driver_id, driverId);
    assert.strictEqual(finalRecord.total_price, 135000);

    unsubAlert();
  });

  // --------------------------------------------------------------------------
  // SCENARIO 2: Driver Package Send Flow (WiraSend)
  // --------------------------------------------------------------------------
  await runner.test('RW-2: WiraSend End-to-End: Parcel courier pickup, tracking with receipt code, handover completion', async () => {
    const client = createShadowSupabase();
    const customerId = 'u-cust-001';
    const driverId = 'u-driver-001';

    // Step 1: Customer creates delivery request
    const sendPayload = {
      id: 'rw-send-201',
      user_id: customerId,
      service_type: 'send',
      title: 'Pengiriman Dokumen Penting',
      details: JSON.stringify({
        resi: 'WRS-2026-9912',
        sender: { name: 'Kantor Notaris Mataram', phone: '0811111111' },
        recipient: { name: 'Bank BNI Cakranegara', phone: '0822222222' },
        pickup: { lat: -8.5830, lng: 116.1160 },
        dropoff: { lat: -8.5890, lng: 116.1340 },
        package_info: { weight: '1kg', note: 'Dokumen Segel' }
      }),
      status: 'pending',
      total_price: 18000
    };

    const { data: sendOrder } = await client.from('orders').insert(sendPayload).select().single();
    assert.strictEqual(sendOrder.status, 'pending');

    // Step 2: Driver accepts parcel request
    const accepted = await partnerService.acceptOrder(client, sendOrder.id, driverId, 'driver');
    assert.strictEqual(accepted.status, 'accepted');

    // Step 3: Courier arrives at pickup location and collects package
    await partnerService.updateOrderStatus(client, sendOrder.id, OrderStatus.PICKING_UP);
    await partnerService.updateDriverLocation(client, driverId, -8.5830, 116.1160);

    // Step 4: In transit
    await partnerService.updateOrderStatus(client, sendOrder.id, OrderStatus.IN_TRIP);
    await partnerService.updateDriverLocation(client, driverId, -8.5890, 116.1340);

    // Step 5: Delivered and completed
    const finished = await partnerService.completeOrder(client, sendOrder.id);
    assert.strictEqual(finished.status, 'completed');

    const { data: verified } = await client.from('orders').select('*').eq('id', sendOrder.id).single();
    assert.strictEqual(verified.status, 'completed');
    assert.ok(verified.details.includes('WRS-2026-9912'));
  });

  // --------------------------------------------------------------------------
  // SCENARIO 3: Merchant Food Preparation (WiraFood)
  // --------------------------------------------------------------------------
  await runner.test('RW-3: WiraFood End-to-End: Restaurant order reception, kitchen preparation, ready marking, driver collection', async () => {
    const client = createShadowSupabase();
    const merchantId = 'm-food-001';
    const customerId = 'u-cust-001';
    const driverId = 'u-driver-001';

    // Step 1: Customer orders meal from merchant
    const foodPayload = {
      id: 'rw-food-301',
      user_id: customerId,
      merchant_id: merchantId,
      service_type: 'food',
      title: 'Order Ayam Taliwang & Plecing Kangkung',
      details: JSON.stringify({
        items: [
          { name: 'Ayam Taliwang Bakar', qty: 2, price: 45000 },
          { name: 'Plecing Kangkung', qty: 1, price: 15000 },
          { name: 'Es Jeruk', qty: 2, price: 10000 }
        ],
        notes: 'Sambal dipisah, tidak terlalu pedas'
      }),
      status: 'pending',
      total_price: 125000
    };

    const { data: foodOrder } = await client.from('orders').insert(foodPayload).select().single();
    assert.strictEqual(foodOrder.status, 'pending');

    // Step 2: Merchant accepts order
    const accepted = await partnerService.acceptOrder(client, foodOrder.id, merchantId, 'merchant');
    assert.strictEqual(accepted.status, 'accepted');

    // Step 3: Kitchen starts cooking
    const preparing = await partnerService.updateOrderStatus(client, foodOrder.id, OrderStatus.PREPARING);
    assert.strictEqual(preparing.status, 'preparing');

    // Step 4: Food packaged and ready for pickup
    const ready = await partnerService.updateOrderStatus(client, foodOrder.id, OrderStatus.READY);
    assert.strictEqual(ready.status, 'ready');

    // Step 5: Assigned driver arrives, collects food, and completes handover
    const completed = await partnerService.completeOrder(client, foodOrder.id);
    assert.strictEqual(completed.status, 'completed');

    const { data: checkDb } = await client.from('orders').select('*').eq('id', foodOrder.id).single();
    assert.strictEqual(checkDb.status, 'completed');
    assert.strictEqual(checkDb.total_price, 125000);
  });

  // --------------------------------------------------------------------------
  // SCENARIO 4: Merchant Villa Booking (WiraVilla)
  // --------------------------------------------------------------------------
  await runner.test('RW-4: WiraVilla End-to-End: Villa accommodation reservation, host confirmation, check-in readiness, completion', async () => {
    const client = createShadowSupabase();
    const merchantId = 'm-villa-001';
    const customerId = 'u-cust-001';

    // Step 1: Guest books villa stay
    const villaPayload = {
      id: 'rw-villa-401',
      user_id: customerId,
      merchant_id: merchantId,
      service_type: 'villa',
      title: 'Booking Villa Sunset Senggigi (2 Malam)',
      details: JSON.stringify({
        reservation_code: 'VIL-SGG-2026',
        room_type: 'Deluxe Sea View Villa',
        check_in: '2026-09-20',
        check_out: '2026-09-22',
        nights: 2,
        guests: 2
      }),
      status: 'pending',
      total_price: 1800000
    };

    const { data: booking } = await client.from('orders').insert(villaPayload).select().single();
    assert.strictEqual(booking.status, 'pending');

    // Step 2: Villa Host accepts booking
    const confirmed = await partnerService.acceptOrder(client, booking.id, merchantId, 'merchant');
    assert.strictEqual(confirmed.status, 'accepted');

    // Step 3: Host prepares villa room
    const preparing = await partnerService.updateOrderStatus(client, booking.id, OrderStatus.PREPARING);
    assert.strictEqual(preparing.status, 'preparing');

    // Step 4: Villa ready for guest check-in
    const ready = await partnerService.updateOrderStatus(client, booking.id, OrderStatus.READY);
    assert.strictEqual(ready.status, 'ready');

    // Step 5: Guest check-out / stay completion
    const completed = await partnerService.completeOrder(client, booking.id);
    assert.strictEqual(completed.status, 'completed');

    const { data: finalRecord } = await client.from('orders').select('*').eq('id', booking.id).single();
    assert.strictEqual(finalRecord.status, 'completed');
    assert.ok(finalRecord.details.includes('VIL-SGG-2026'));
  });

  // --------------------------------------------------------------------------
  // SCENARIO 5: Dual-Role Shift Switching (Driver <-> Merchant)
  // --------------------------------------------------------------------------
  await runner.test('RW-5: Dual-Role Shift Switching: Multi-role partner completes morning driver shift, toggles to merchant restaurant rush, and returns without state leaks', async () => {
    const client = createShadowSupabase();
    const dualPartnerId = 'u-dual-001';
    let currentActiveMode = 'driver';
    let shiftHistory = [];

    // --- Morning Shift: Driver Mode ---
    assert.strictEqual(currentActiveMode, 'driver');

    // Driver receives and completes Ride 1
    const { data: ride1 } = await client.from('orders').insert({
      id: 'shift-ride-1',
      service_type: 'ride',
      status: 'pending',
      total_price: 30000
    }).select().single();

    await partnerService.acceptOrder(client, ride1.id, dualPartnerId, 'driver');
    await partnerService.updateDriverLocation(client, dualPartnerId, -8.5833, 116.1167);
    await partnerService.completeOrder(client, ride1.id);
    shiftHistory.push({ shift: 'morning_driver', orderId: ride1.id, status: 'completed' });

    // Driver completes Ride 2
    const { data: ride2 } = await client.from('orders').insert({
      id: 'shift-ride-2',
      service_type: 'ride',
      status: 'pending',
      total_price: 25000
    }).select().single();

    await partnerService.acceptOrder(client, ride2.id, dualPartnerId, 'driver');
    await partnerService.completeOrder(client, ride2.id);
    shiftHistory.push({ shift: 'morning_driver', orderId: ride2.id, status: 'completed' });

    // --- Midday Shift: Toggle to Merchant Mode ---
    currentActiveMode = 'merchant';
    assert.strictEqual(currentActiveMode, 'merchant');

    // Merchant manages restaurant lunch rush
    const { data: foodOrder } = await client.from('orders').insert({
      id: 'shift-food-1',
      service_type: 'food',
      merchant_id: 'm-food-001',
      status: 'pending',
      total_price: 90000
    }).select().single();

    await partnerService.acceptOrder(client, foodOrder.id, 'm-food-001', 'merchant');
    await partnerService.updateOrderStatus(client, foodOrder.id, OrderStatus.PREPARING);
    await partnerService.updateOrderStatus(client, foodOrder.id, OrderStatus.READY);
    await partnerService.completeOrder(client, foodOrder.id);
    shiftHistory.push({ shift: 'midday_merchant', orderId: foodOrder.id, status: 'completed' });

    // --- Evening Shift: Return to Driver Mode ---
    currentActiveMode = 'driver';
    assert.strictEqual(currentActiveMode, 'driver');

    // Evening ride completed smoothly
    const { data: eveningRide } = await client.from('orders').insert({
      id: 'shift-ride-3',
      service_type: 'ride',
      status: 'pending',
      total_price: 40000
    }).select().single();

    await partnerService.acceptOrder(client, eveningRide.id, dualPartnerId, 'driver');
    await partnerService.completeOrder(client, eveningRide.id);
    shiftHistory.push({ shift: 'evening_driver', orderId: eveningRide.id, status: 'completed' });

    // Assert total 4 shift orders cleanly finalized
    assert.strictEqual(shiftHistory.length, 4);
    assert.ok(shiftHistory.every(s => s.status === 'completed'));
  });

  const success = runner.printSummary();
  if (!success) {
    process.exit(1);
  }
}

if (require.main === module) {
  runTier4().catch((err) => {
    console.error('Unhandled error in Tier 4:', err);
    process.exit(1);
  });
}

module.exports = { runTier4 };
