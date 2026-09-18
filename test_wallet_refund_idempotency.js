/*
 * Run this AFTER pasting migrations/0040_wallet_refund_rpc.sql into the
 * Supabase Dashboard SQL Editor (DDL can't be applied from a script - see
 * that migration's header and migrations/README.md).
 *
 * Proves the exact thing this fix is for: creates a real, throwaway test
 * order for a real (test) customer session, then calls wallet_refund()
 * TWICE IN A ROW against the SAME order id (simulating a double-click on
 * "Batalkan Pencarian" in RidePage.jsx), and checks the wallet_balance
 * DELTA - not just that no error was thrown - to confirm the customer was
 * credited exactly once, not twice.
 *
 * Usage:
 *   node test_wallet_refund_idempotency.js
 *
 * Cleans up the test user, order and transactions it creates when done.
 */
require('dotenv').config({ path: 'backend/.env' });
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const ANON_KEY = process.env.SUPABASE_ANON_KEY;

const admin = createClient(SUPABASE_URL, SERVICE_KEY);

const ORDER_PRICE = 12000;
const testEmail = `wira-refund-test-${Date.now()}@example.com`;
let testUserId = null;
let testOrderId = null;

async function cleanup() {
  if (testOrderId) await admin.from('orders').delete().eq('id', testOrderId);
  if (testUserId) {
    await admin.from('transactions').delete().eq('user_id', testUserId);
    await admin.from('users').delete().eq('id', testUserId);
    await admin.auth.admin.deleteUser(testUserId);
  }
  console.log('Cleanup done.');
}

(async () => {
  try {
    const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({
      type: 'magiclink',
      email: testEmail,
    });
    if (linkErr) throw linkErr;
    testUserId = linkData.user.id;

    const anon = createClient(SUPABASE_URL, ANON_KEY);
    const { data: otpData, error: otpErr } = await anon.auth.verifyOtp({
      email: testEmail,
      token: linkData.properties.email_otp,
      type: 'email',
    });
    if (otpErr) throw otpErr;

    const customerClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: `Bearer ${otpData.session.access_token}` } },
    });

    await admin.from('users').upsert({
      id: testUserId,
      name: 'Test Refund User',
      email: testEmail,
      phone: '080000000002',
      role: 'user',
      status: 'Aktif',
      wallet_balance: 0, // starts at 0 - order was already "paid" via pay() before cancel is ever clicked
    });

    // Simulate a real WiraRide order exactly as RidePage.jsx/handleStartBooking
    // creates one: status 'pending' (still searching), payment already taken
    // (payment_method 'wallet', payment_status 'paid').
    const { data: order, error: orderErr } = await admin
      .from('orders')
      .insert({
        user_id: testUserId,
        service_type: 'ride',
        title: 'Test order for refund idempotency',
        total_price: ORDER_PRICE,
        payment_method: 'wallet',
        payment_status: 'paid',
        status: 'pending',
      })
      .select()
      .single();
    if (orderErr) throw orderErr;
    testOrderId = order.id;

    console.log(`Created test order ${testOrderId}, total_price=${ORDER_PRICE}, wallet_balance starts at 0`);

    const before = await admin.from('users').select('wallet_balance').eq('id', testUserId).single();
    console.log('Balance BEFORE any refund call:', before.data.wallet_balance);

    // Call #1 - the "real" click
    const call1 = await customerClient.rpc('wallet_refund', {
      p_order_id: testOrderId,
      p_description: 'Refund Batal WiraRide (test call 1)',
    });
    console.log('Call 1 -> data:', call1.data, 'error:', call1.error?.message);

    const afterCall1 = await admin.from('users').select('wallet_balance').eq('id', testUserId).single();
    console.log('Balance AFTER call 1:', afterCall1.data.wallet_balance);

    // Call #2 - the "double-click" - same order id, right after
    const call2 = await customerClient.rpc('wallet_refund', {
      p_order_id: testOrderId,
      p_description: 'Refund Batal WiraRide (test call 2 - double-click)',
    });
    console.log('Call 2 -> data:', call2.data, 'error:', call2.error?.message);

    const afterCall2 = await admin.from('users').select('wallet_balance').eq('id', testUserId).single();
    console.log('Balance AFTER call 2:', afterCall2.data.wallet_balance);

    const delta = Number(afterCall2.data.wallet_balance) - Number(before.data.wallet_balance);
    console.log(`Total balance delta across both calls: ${delta} (expected: exactly ${ORDER_PRICE}, i.e. credited ONCE)`);

    if (delta === ORDER_PRICE && call2.error) {
      console.log('PASS: wallet was credited exactly once; the second call was correctly rejected.');
    } else {
      console.log('FAIL or UNEXPECTED - inspect manually.');
    }
  } catch (e) {
    console.error('Test error:', e);
  } finally {
    await cleanup();
  }
})();
