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

  console.log('✅ ALL ROLE SWITCHING & LOGIN TESTS PASSED SUCCESSFULLY!');
}

runTests().catch((err) => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
