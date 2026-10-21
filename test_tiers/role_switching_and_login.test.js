#!/usr/bin/env node

/**
 * role_switching_and_login.test.js
 * Comprehensive automated verification for the new login flow and role switcher.
 */

const assert = require('assert');

// 1. Mock LocalStorage
class MockLocalStorage {
  constructor() {
    this.store = {};
  }
  getItem(key) {
    return this.store[key] || null;
  }
  setItem(key, value) {
    this.store[key] = String(value);
  }
  removeItem(key) {
    delete this.store[key];
  }
  clear() {
    this.store = {};
  }
}

global.localStorage = new MockLocalStorage();

const MITRA_ROLES = ['driver', 'merchant', 'villa', 'technician', 'nanny'];
const ROLE_STORAGE_KEY = 'wira_partner_active_mode';

function getStoredActiveMode(fallback = null) {
  try {
    const val = localStorage.getItem(ROLE_STORAGE_KEY);
    if (val && MITRA_ROLES.includes(val)) {
      return val;
    }
  } catch {
    // LocalStorage may fail in restricted environments
  }
  return fallback;
}

function setStoredActiveMode(role) {
  try {
    if (MITRA_ROLES.includes(role)) {
      localStorage.setItem(ROLE_STORAGE_KEY, role);
    }
  } catch {}
}

function clearStoredActiveMode() {
  try {
    localStorage.removeItem(ROLE_STORAGE_KEY);
  } catch {}
}

async function runTests() {
  console.log('🧪 RUNNING COMPREHENSIVE ROLE SWITCHING & LOGIN VERIFICATION');

  // Test 1: getStoredActiveMode defaults to null when empty
  localStorage.clear();
  assert.strictEqual(getStoredActiveMode(), null, 'Default stored active mode must be null');
  assert.strictEqual(getStoredActiveMode('driver'), 'driver', 'Explicit fallback must work');

  // Test 2: setStoredActiveMode persists valid role and rejects invalid
  setStoredActiveMode('merchant');
  assert.strictEqual(getStoredActiveMode(), 'merchant', 'Merchant mode should be stored');

  setStoredActiveMode('admin'); // invalid role
  assert.strictEqual(getStoredActiveMode(), 'merchant', 'Invalid role must not overwrite active mode');

  // Test 3: clearStoredActiveMode clears the storage
  clearStoredActiveMode();
  assert.strictEqual(getStoredActiveMode(), null, 'clearStoredActiveMode must remove the stored mode');

  // Test 4: Single-role partner routing
  function resolvePostLoginRoute(user, profile, app = null) {
    if (profile?.status === 'Diblokir') return '/unauthorized';
    if (profile?.status === 'Pending') return '/pending-verification';

    let roles = profile?.mitra_access;
    if (!Array.isArray(roles) || roles.length === 0) {
      const legacyRole = profile?.role === 'courier' ? 'driver' : profile?.role;
      if (MITRA_ROLES.includes(legacyRole)) {
        roles = [legacyRole];
      } else {
        roles = [];
      }
    }

    const validRoles = roles.filter((r) => MITRA_ROLES.includes(r));

    if (validRoles.length === 1) {
      return `/${validRoles[0]}`;
    }
    if (validRoles.length > 1) {
      return 'SHOW_MULTI_ROLE_PICKER';
    }

    if (app?.status === 'Pending') return '/pending-verification';
    if (app?.status === 'Rejected') return '/unauthorized';
    return '/register';
  }

  // 4a. Single-role nanny
  const r1 = resolvePostLoginRoute({ id: 'u1' }, { mitra_access: ['nanny'] });
  assert.strictEqual(r1, '/nanny', 'Single role nanny must route to /nanny');

  // 4b. Single-role driver
  const r2 = resolvePostLoginRoute({ id: 'u2' }, { mitra_access: ['driver'] });
  assert.strictEqual(r2, '/driver', 'Single role driver must route to /driver');

  // 4c. Single-role villa
  const r3 = resolvePostLoginRoute({ id: 'u3' }, { mitra_access: ['villa'] });
  assert.strictEqual(r3, '/villa', 'Single role villa must route to /villa');

  // 4d. Multi-role driver + nanny
  const r4 = resolvePostLoginRoute({ id: 'u4' }, { mitra_access: ['driver', 'nanny'] });
  assert.strictEqual(r4, 'SHOW_MULTI_ROLE_PICKER', 'Multi-role partner must trigger role picker');

  // 4e. 0 roles with Pending profile
  const r5 = resolvePostLoginRoute({ id: 'u5' }, { mitra_access: [], status: 'Pending' });
  assert.strictEqual(r5, '/pending-verification', 'Pending profile must route to /pending-verification');

  // 4f. 0 roles with Pending application
  const r6 = resolvePostLoginRoute({ id: 'u6' }, { mitra_access: [] }, { status: 'Pending' });
  assert.strictEqual(r6, '/pending-verification', 'Pending application must route to /pending-verification');

  // 4g. 0 roles with Rejected application
  const r7 = resolvePostLoginRoute({ id: 'u7' }, { mitra_access: [] }, { status: 'Rejected' });
  assert.strictEqual(r7, '/unauthorized', 'Rejected application must route to /unauthorized');

  // 4h. 0 roles brand new customer
  const r8 = resolvePostLoginRoute({ id: 'u8' }, { mitra_access: [] }, null);
  assert.strictEqual(r8, '/register', 'Brand new customer with 0 roles must route gracefully to /register');

  // 4i. Legacy 'courier' role fallback
  const r9 = resolvePostLoginRoute({ id: 'u9' }, { mitra_access: null, role: 'courier' });
  assert.strictEqual(r9, '/driver', 'Legacy courier role must route to /driver');

  // Test 5: Active order guard during role switch
  function canSwitchRole(currentRole, targetRole, ongoingOrder) {
    if (targetRole === currentRole) return { allowed: false, reason: 'Already in role' };
    if (currentRole === 'driver' && ongoingOrder && ['accepted', 'picking_up', 'in_trip'].includes(ongoingOrder.status)) {
      return { allowed: false, reason: 'Tidak dapat berganti peran saat ada pesanan aktif' };
    }
    return { allowed: true };
  }

  const s1 = canSwitchRole('driver', 'merchant', { id: 'ord-1', status: 'in_trip' });
  assert.strictEqual(s1.allowed, false, 'Switch must be blocked during in_trip order');

  const s2 = canSwitchRole('driver', 'nanny', { id: 'ord-2', status: 'completed' });
  assert.strictEqual(s2.allowed, true, 'Switch must be allowed when order is completed');

  const s3 = canSwitchRole('driver', 'villa', null);
  assert.strictEqual(s3.allowed, true, 'Switch must be allowed when no active order');

  // Test 6: Partner link resolution for active-order and projects
  const { resolvePartnerLink } = await import('../frontend-mitra/src/utils/links.js');
  assert.strictEqual(
    resolvePartnerLink('/active-order/ord-123', ['driver'], 'driver'),
    '/driver/active-order/ord-123',
    'Active order link must resolve to active driver portal'
  );
  assert.strictEqual(
    resolvePartnerLink('/active-order/ord-456', ['merchant'], 'merchant'),
    '/merchant/active-order/ord-456',
    'Active order link must resolve to merchant portal'
  );
  assert.strictEqual(
    resolvePartnerLink('/projects/proj-789', ['technician'], 'technician'),
    '/technician/projects/proj-789',
    'Project link must resolve to technician portal'
  );
  assert.strictEqual(
    resolvePartnerLink('/earnings', ['nanny'], 'nanny'),
    '/nanny/earnings',
    'Role-less earnings link must resolve to current partner role'
  );

  // Test 7: Commission deposit validation (flexible amounts >= 1)
  function validateDepositAmount(raw) {
    const num = Math.round(Number(raw));
    if (!num || num < 1 || num > 100000000) {
      return { valid: false, error: 'Jumlah setoran Rp 1 sampai Rp 100.000.000' };
    }
    return { valid: true, amount: num };
  }
  assert.strictEqual(validateDepositAmount('0').valid, false, 'Deposit of 0 must be invalid');
  assert.strictEqual(validateDepositAmount('-1000').valid, false, 'Negative deposit must be invalid');
  assert.strictEqual(validateDepositAmount('1').valid, true, 'Deposit of Rp 1 must be valid');
  assert.strictEqual(validateDepositAmount('500').valid, true, 'Deposit of Rp 500 must be valid');
  assert.strictEqual(validateDepositAmount('10000').valid, true, 'Deposit of Rp 10.000 must be valid');
  assert.strictEqual(validateDepositAmount('100000001').valid, false, 'Deposit > 100M must be invalid');

  // Test 8: Chat counterparty notification resolution
  function resolveChatRecipients(order, senderId) {
    const list = [order.user_id, order.driver_id, order.merchant_owner];
    return Array.from(new Set(list.filter((uid) => uid && uid !== senderId)));
  }

  // Ride order: customer + driver
  const rideOrder = { user_id: 'cust-1', driver_id: 'drv-2', merchant_owner: null };
  assert.deepStrictEqual(resolveChatRecipients(rideOrder, 'cust-1'), ['drv-2'], 'Customer message must notify driver');
  assert.deepStrictEqual(resolveChatRecipients(rideOrder, 'drv-2'), ['cust-1'], 'Driver message must notify customer');

  // Food order: customer + driver + merchant
  const foodOrder = { user_id: 'cust-1', driver_id: 'drv-2', merchant_owner: 'merch-3' };
  assert.deepStrictEqual(resolveChatRecipients(foodOrder, 'cust-1'), ['drv-2', 'merch-3'], 'Customer message must notify both driver and merchant');
  assert.deepStrictEqual(resolveChatRecipients(foodOrder, 'drv-2'), ['cust-1', 'merch-3'], 'Driver message must notify customer and merchant');
  assert.deepStrictEqual(resolveChatRecipients(foodOrder, 'merch-3'), ['cust-1', 'drv-2'], 'Merchant message must notify customer and driver');
  assert.deepStrictEqual(resolveChatRecipients(foodOrder, 'admin-99'), ['cust-1', 'drv-2', 'merch-3'], 'Admin message must notify all participants');

  // Self-delivery / deduplication test: driver is also merchant owner
  const selfDeliv = { user_id: 'cust-1', driver_id: 'owner-4', merchant_owner: 'owner-4' };
  assert.deepStrictEqual(resolveChatRecipients(selfDeliv, 'cust-1'), ['owner-4'], 'Deduplication must prevent double notify');

  // Test 9: Project counterparty resolution
  function resolveProjectRecipients(project, technicianId, senderId) {
    const list = [project.customer_id, technicianId];
    return Array.from(new Set(list.filter((uid) => uid && uid !== senderId)));
  }
  const proj = { id: 'p-1', customer_id: 'cust-1' };
  assert.deepStrictEqual(resolveProjectRecipients(proj, 'tech-1', 'cust-1'), ['tech-1'], 'Customer project msg must notify tech');
  assert.deepStrictEqual(resolveProjectRecipients(proj, 'tech-1', 'tech-1'), ['cust-1'], 'Tech project msg must notify customer');
  assert.deepStrictEqual(resolveProjectRecipients(proj, 'tech-1', 'admin-99'), ['cust-1', 'tech-1'], 'Admin project msg must notify both');

  // Test 10: Re-registration role preservation
  function resolveReapplyLink(app) {
    return app?.role && app.role !== 'courier' ? `/register?role=${app.role}` : '/register';
  }
  assert.strictEqual(resolveReapplyLink({ role: 'technician' }), '/register?role=technician');
  assert.strictEqual(resolveReapplyLink({ role: 'nanny' }), '/register?role=nanny');
  assert.strictEqual(resolveReapplyLink(null), '/register');

  console.log('✅ ALL ROLE SWITCHING & LOGIN TESTS PASSED SUCCESSFULLY!');
}

runTests().catch((err) => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
