#!/usr/bin/env node

/**
 * ============================================================================
 * WIRAPARTNER: END-TO-END FLOW VERIFICATION SUITE (verify_partner_flow.js)
 * ============================================================================
 * Verifies Acceptance Criteria:
 * 1. Successfully creates mock customer order in Supabase.
 * 2. Utilizes Partner App service logic to fetch, accept, and complete the order.
 * 3. Queries Supabase independently to verify status === 'completed'.
 * 4. Deterministic teardown in finally block.
 * ============================================================================
 */

'use strict';

const fs = require('fs');
const path = require('path');
const assert = require('assert');
const { createClient } = require('@supabase/supabase-js');

// 1. Zero-Dependency Environment Loader
function loadEnvironment() {
  const candidates = [
    path.resolve(__dirname, 'backend/.env'),
    path.resolve(__dirname, '.env'),
    path.resolve(__dirname, 'frontend-partner/.env'),
    path.resolve(__dirname, 'frontend-mitra/.env')
  ];

  if (typeof process.loadEnvFile === 'function') {
    for (const f of candidates) {
      if (fs.existsSync(f)) {
        try { process.loadEnvFile(f); } catch (_) {}
      }
    }
  }

  for (const f of candidates) {
    if (fs.existsSync(f)) {
      const text = fs.readFileSync(f, 'utf8');
      for (const line of text.split('\n')) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        const eqIdx = trimmed.indexOf('=');
        if (eqIdx > 0) {
          const key = trimmed.slice(0, eqIdx).trim();
          let val = trimmed.slice(eqIdx + 1).trim();
          if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
            val = val.slice(1, -1);
          }
          if (!process.env[key]) process.env[key] = val;
        }
      }
    }
  }
}

loadEnvironment();

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('❌ Missing Supabase credentials in environment.');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function runSimulation() {
  console.log('🚀 [WiraPartner E2E] Starting End-to-End Simulation...');
  console.log('   Supabase URL:', SUPABASE_URL);

  // Dynamically import Partner App service logic
  const servicePath = path.resolve(__dirname, 'frontend-partner/src/services/partnerOrderService.js');
  let partnerService;
  try {
    partnerService = await import(`file://${servicePath}`);
  } catch (err) {
    console.error(`❌ Could not load Partner App service logic from ${servicePath}:`, err.message);
    process.exit(1);
  }

  let testOrderId = null;

  try {
    // ------------------------------------------------------------------------
    // STAGE 1: Discover Existing Mock Customer & Driver
    // ------------------------------------------------------------------------
    console.log('\n🔍 [Stage 1] Querying existing customer & partner accounts...');
    const { data: users, error: uErr } = await supabase
      .from('users')
      .select('id, name, role')
      .limit(5);

    assert(!uErr && users && users.length > 0, `Must have at least one user in public.users. Error: ${uErr?.message}`);
    const customer = users[0];
    const partner = users.find(u => u.role === 'mitra' || u.role === 'driver') || users[users.length - 1];
    console.log(`   Customer: ${customer.name} (${customer.id})`);
    console.log(`   Partner : ${partner.name} (${partner.id})`);

    // ------------------------------------------------------------------------
    // STAGE 2: Create Mock Customer Order in Supabase
    // ------------------------------------------------------------------------
    console.log('\n📦 [Stage 2] Creating mock customer order directly in Supabase...');
    const mockOrderPayload = {
      user_id: customer.id,
      service_type: 'ride',
      title: 'E2E Simulation Ride to Mataram Mall',
      details: JSON.stringify({
        pickup: { lat: -8.5833, lng: 116.1167, address: 'Mataram Square' },
        dropoff: { lat: -8.5900, lng: 116.1250, address: 'Mataram Mall' },
        passenger_name: customer.name
      }),
      status: 'pending',
      total_price: 25000,
      payment_method: 'cash',
      payment_status: 'unpaid'
    };

    const { data: orderCreated, error: createErr } = await supabase
      .from('orders')
      .insert(mockOrderPayload)
      .select()
      .single();

    assert(!createErr && orderCreated, `Failed to create mock order: ${createErr?.message}`);
    testOrderId = orderCreated.id;
    console.log(`✅ Order created successfully: ID ${testOrderId}, status = '${orderCreated.status}'`);

    // ------------------------------------------------------------------------
    // STAGE 3: Partner App Service Logic - Fetch Order
    // ------------------------------------------------------------------------
    console.log('\n📥 [Stage 3] Fetching order via Partner App Service Logic...');
    const fetchedOrder = await partnerService.getOrderById(supabase, testOrderId);
    assert.strictEqual(fetchedOrder.id, testOrderId, 'Fetched order ID must match');
    assert.strictEqual(fetchedOrder.status, 'pending', 'Initial fetched status must be pending');
    console.log(`✅ Partner service fetched order: status is '${fetchedOrder.status}'`);

    // ------------------------------------------------------------------------
    // STAGE 4: Partner App Service Logic - Accept Order
    // ------------------------------------------------------------------------
    console.log('\n🤝 [Stage 4] Accepting order via Partner App Service Logic...');
    const acceptedOrder = await partnerService.acceptOrder(supabase, testOrderId, partner.id, 'driver');
    assert.strictEqual(acceptedOrder.status, 'accepted', 'Order status must transition to accepted');
    assert.strictEqual(acceptedOrder.driver_id, partner.id, 'Driver ID must be set to partner ID');
    console.log(`✅ Partner service accepted order: status is '${acceptedOrder.status}'`);

    // ------------------------------------------------------------------------
    // STAGE 5: Partner App Service Logic - Complete Order
    // ------------------------------------------------------------------------
    console.log('\n🏁 [Stage 5] Completing order via Partner App Service Logic...');
    const completedOrder = await partnerService.completeOrder(supabase, testOrderId);
    assert.strictEqual(completedOrder.status, 'completed', 'Order status must transition to completed');
    console.log(`✅ Partner service completed order: status is '${completedOrder.status}'`);

    // ------------------------------------------------------------------------
    // STAGE 6: Independent Database Query Verification
    // ------------------------------------------------------------------------
    console.log('\n🔎 [Stage 6] Querying Supabase directly for final ground-truth status...');
    const { data: finalRecord, error: fetchFinalErr } = await supabase
      .from('orders')
      .select('id, status, driver_id, total_price')
      .eq('id', testOrderId)
      .single();

    assert(!fetchFinalErr, `Failed to fetch final record: ${fetchFinalErr?.message}`);
    assert.strictEqual(finalRecord.status, 'completed', "Database status MUST be 'completed'");
    console.log(`✅ Ground Truth Verified: Order ${finalRecord.id} status is strictly '${finalRecord.status}'!`);

    console.log('\n🎉 ============================================================');
    console.log('🎉 ALL ACCEPTANCE CRITERIA VERIFIED SUCCESSFULLY!');
    console.log('🎉 ============================================================');
    process.exitCode = 0;
  } catch (err) {
    console.error('\n❌ [E2E Simulation Failed]:', err);
    process.exitCode = 1;
  } finally {
    // ------------------------------------------------------------------------
    // STAGE 7: Guaranteed Clean Teardown
    // ------------------------------------------------------------------------
    if (testOrderId) {
      console.log(`\n🧹 [Cleanup] Deleting mock test order ${testOrderId}...`);
      await supabase.from('orders').delete().eq('id', testOrderId);
      console.log('🧹 Cleanup complete. Database is clean.');
    }
  }
}

runSimulation();
