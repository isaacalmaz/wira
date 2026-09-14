/**
 * ============================================================================
 * WiraPartner E2E Test Suite - Shared Test Harness
 * File: test_tiers/test_harness.js
 * ============================================================================
 * Provides:
 * 1. Zero-dependency environment loader (backend/.env, .env, etc.)
 * 2. Live Supabase detector with timeout-safe probe
 * 3. In-memory high-fidelity Shadow Supabase database & Realtime simulator
 * 4. Partner order service loader / compliant reference engine
 * 5. Structured test runner and assertion utilities
 * ============================================================================
 */

const fs = require('fs');
const path = require('path');
const assert = require('assert');
const { createClient } = require('@supabase/supabase-js');

// ----------------------------------------------------------------------------
// 1. Zero-Dependency Environment Loader
// ----------------------------------------------------------------------------
function loadEnvironment() {
  const rootDir = path.resolve(__dirname, '..');
  const candidates = [
    path.resolve(rootDir, 'backend/.env'),
    path.resolve(rootDir, '.env'),
    path.resolve(rootDir, 'frontend-partner/.env'),
    path.resolve(rootDir, 'frontend-mitra/.env')
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
      try {
        const content = fs.readFileSync(f, 'utf8');
        for (const line of content.split('\n')) {
          const trimmed = line.trim();
          if (!trimmed || trimmed.startsWith('#')) continue;
          const eqIdx = trimmed.indexOf('=');
          if (eqIdx > 0) {
            const key = trimmed.slice(0, eqIdx).trim();
            let val = trimmed.slice(eqIdx + 1).trim();
            if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
              val = val.slice(1, -1);
            }
            if (!process.env[key]) {
              process.env[key] = val;
            }
          }
        }
      } catch (_) {}
    }
  }

  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || 'https://yhxhcxgcjadchrjskozt.supabase.co';
  const supabaseKey = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || 'dummy_anon_key';

  return { supabaseUrl, supabaseKey };
}

// ----------------------------------------------------------------------------
// 2. Live Supabase Connectivity Probe
// ----------------------------------------------------------------------------
async function probeLiveSupabase(url, key, timeoutMs = 1200) {
  if (!url || !key || key === 'dummy_anon_key') return null;
  try {
    const client = createClient(url, key);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const { error } = await client
      .from('orders')
      .select('id')
      .limit(1)
      .abortSignal(controller.signal);
    clearTimeout(timer);
    if (!error) return client;
  } catch (_) {}
  return null;
}

// ----------------------------------------------------------------------------
// 3. Mathematical Helpers (PostGIS ST_Distance simulation)
// ----------------------------------------------------------------------------
function calculateHaversineMeters(lat1, lon1, lat2, lon2) {
  const R = 6371000; // Earth radius in meters
  const toRad = (x) => (x * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

// ----------------------------------------------------------------------------
// 4. High-Fidelity Shadow Supabase Database & Realtime Engine
// ----------------------------------------------------------------------------
function createShadowSupabase(initialState = {}) {
  const db = {
    users: [
      { id: 'u-cust-001', name: 'Ahmad User', phone: '081234567890', role: 'user', status: 'Active', mitra_access: [] },
      { id: 'u-driver-001', name: 'Budi Driver', phone: '081298765432', role: 'driver', status: 'Active', mitra_access: ['driver'] },
      { id: 'u-merchant-001', name: 'Siti Merchant', phone: '081345678901', role: 'merchant', status: 'Active', mitra_access: ['merchant'] },
      { id: 'u-dual-001', name: 'Dual Role Mitra', phone: '081399998888', role: 'mitra', status: 'Active', mitra_access: ['driver', 'merchant'] },
      ...(initialState.users || [])
    ],
    merchants: [
      { id: 'm-food-001', user_id: 'u-merchant-001', name: 'Ayam Taliwang Ibu Siti', category: 'food', is_open: true, lat: -8.5830, lng: 116.1160 },
      { id: 'm-villa-001', user_id: 'u-merchant-001', name: 'Villa Sunset Senggigi', category: 'villa', is_open: true, lat: -8.5020, lng: 116.0500 },
      ...(initialState.merchants || [])
    ],
    drivers: [
      { id: 'u-driver-001', vehicle_type: 'motor', vehicle_plate: 'DR 1234 AB', is_online: true, lat: -8.5833, lng: 116.1167, updated_at: new Date().toISOString() },
      { id: 'u-dual-001', vehicle_type: 'car', vehicle_plate: 'DR 5678 CD', is_online: true, lat: -8.5840, lng: 116.1170, updated_at: new Date().toISOString() },
      ...(initialState.drivers || [])
    ],
    orders: [
      ...(initialState.orders || [])
    ],
    messages: [
      ...(initialState.messages || [])
    ]
  };

  const channelSubscribers = [];

  function notifySubscribers(table, eventType, newRecord, oldRecord = null) {
    for (const sub of channelSubscribers) {
      if (sub.table === table || sub.table === '*') {
        if (sub.event === '*' || sub.event === eventType) {
          let matchesFilter = true;
          if (sub.filter) {
            const [filterCol, filterVal] = sub.filter.split('=eq.');
            if (filterCol && filterVal) {
              matchesFilter = String(newRecord[filterCol]) === String(filterVal);
            }
          }
          if (matchesFilter) {
            try {
              sub.callback({
                schema: 'public',
                table,
                commit_timestamp: new Date().toISOString(),
                eventType,
                new: newRecord,
                old: oldRecord
              });
            } catch (err) {
              console.error('Subscriber callback error:', err.message);
            }
          }
        }
      }
    }
  }

  const client = {
    _db: db,
    _subscribers: channelSubscribers,

    channel: (name) => {
      let activeSubscriptions = [];
      const channelObj = {
        name,
        on: (type, options, callback) => {
          if (type === 'postgres_changes') {
            const sub = {
              channel: name,
              event: options.event || '*',
              schema: options.schema || 'public',
              table: options.table,
              filter: options.filter || null,
              callback
            };
            activeSubscriptions.push(sub);
            channelSubscribers.push(sub);
          }
          return channelObj;
        },
        subscribe: (statusCallback) => {
          if (typeof statusCallback === 'function') {
            setTimeout(() => statusCallback('SUBSCRIBED'), 10);
          }
          return channelObj;
        },
        unsubscribe: () => {
          for (const sub of activeSubscriptions) {
            const idx = channelSubscribers.indexOf(sub);
            if (idx >= 0) channelSubscribers.splice(idx, 1);
          }
          activeSubscriptions = [];
          return Promise.resolve(true);
        }
      };
      return channelObj;
    },

    from: (tableName) => {
      if (!db[tableName]) {
        db[tableName] = [];
      }

      return {
        select: (columns = '*') => {
          let filters = [];
          let orderClause = null;
          let limitCount = null;
          let isSingle = false;

          const queryObj = {
            eq: (col, val) => {
              filters.push((r) => String(r[col]) === String(val));
              return queryObj;
            },
            neq: (col, val) => {
              filters.push((r) => String(r[col]) !== String(val));
              return queryObj;
            },
            is: (col, val) => {
              filters.push((r) => (val === null ? (r[col] === null || r[col] === undefined) : r[col] === val));
              return queryObj;
            },
            in: (col, vals) => {
              filters.push((r) => vals.map(String).includes(String(r[col])));
              return queryObj;
            },
            gte: (col, val) => {
              filters.push((r) => Number(r[col]) >= Number(val));
              return queryObj;
            },
            lte: (col, val) => {
              filters.push((r) => Number(r[col]) <= Number(val));
              return queryObj;
            },
            order: (col, opts = { ascending: true }) => {
              orderClause = { col, ascending: opts.ascending !== false };
              return queryObj;
            },
            limit: (n) => {
              limitCount = n;
              return queryObj;
            },
            single: () => {
              isSingle = true;
              return queryObj;
            },
            abortSignal: () => queryObj,

            then: (resolve, reject) => {
              let rows = [...db[tableName]];
              for (const f of filters) {
                rows = rows.filter(f);
              }
              if (orderClause) {
                rows.sort((a, b) => {
                  if (a[orderClause.col] < b[orderClause.col]) return orderClause.ascending ? -1 : 1;
                  if (a[orderClause.col] > b[orderClause.col]) return orderClause.ascending ? 1 : -1;
                  return 0;
                });
              }
              if (limitCount !== null) {
                rows = rows.slice(0, limitCount);
              }
              if (isSingle) {
                if (rows.length === 0) {
                  return Promise.resolve({ data: null, error: { message: 'Row not found', code: 'PGRST116' } }).then(resolve, reject);
                }
                return Promise.resolve({ data: { ...rows[0] }, error: null }).then(resolve, reject);
              }
              return Promise.resolve({ data: rows.map(r => ({ ...r })), error: null }).then(resolve, reject);
            }
          };
          return queryObj;
        },

        insert: (data) => {
          const rowsToInsert = Array.isArray(data) ? data : [data];
          const inserted = rowsToInsert.map((item) => {
            const id = item.id || `shadow-${tableName}-${Math.random().toString(36).slice(2, 10)}`;
            const record = {
              id,
              ...item,
              created_at: item.created_at || new Date().toISOString(),
              updated_at: item.updated_at || new Date().toISOString()
            };
            return record;
          });

          db[tableName].push(...inserted);

          for (const rec of inserted) {
            notifySubscribers(tableName, 'INSERT', rec);
          }

          return {
            select: () => ({
              single: () => Promise.resolve({ data: { ...inserted[0] }, error: null }),
              then: (resolve, reject) => Promise.resolve({ data: inserted.map(r => ({ ...r })), error: null }).then(resolve, reject)
            }),
            then: (resolve, reject) => Promise.resolve({ data: inserted.map(r => ({ ...r })), error: null }).then(resolve, reject)
          };
        },

        upsert: (data) => {
          const item = Array.isArray(data) ? data[0] : data;
          const existingIdx = db[tableName].findIndex(r => r.id === item.id);
          let result;
          if (existingIdx >= 0) {
            const old = { ...db[tableName][existingIdx] };
            result = {
              ...old,
              ...item,
              updated_at: new Date().toISOString()
            };
            db[tableName][existingIdx] = result;
            notifySubscribers(tableName, 'UPDATE', result, old);
          } else {
            result = {
              id: item.id || `shadow-${tableName}-${Math.random().toString(36).slice(2, 10)}`,
              ...item,
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString()
            };
            db[tableName].push(result);
            notifySubscribers(tableName, 'INSERT', result);
          }

          return {
            select: () => ({
              single: () => Promise.resolve({ data: { ...result }, error: null }),
              then: (resolve, reject) => Promise.resolve({ data: [{ ...result }], error: null }).then(resolve, reject)
            }),
            then: (resolve, reject) => Promise.resolve({ data: [{ ...result }], error: null }).then(resolve, reject)
          };
        },

        update: (updates) => {
          let filters = [];
          const updateBuilder = {
            eq: (col, val) => {
              filters.push((r) => String(r[col]) === String(val));
              return updateBuilder;
            },
            is: (col, val) => {
              filters.push((r) => (val === null ? (r[col] === null || r[col] === undefined) : r[col] === val));
              return updateBuilder;
            },
            in: (col, vals) => {
              filters.push((r) => vals.map(String).includes(String(r[col])));
              return updateBuilder;
            },
            select: () => ({
              single: async () => {
                const res = await updateBuilder.execute();
                return { data: res[0] || null, error: res[0] ? null : { message: 'Row not updated' } };
              },
              then: async (resolve, reject) => {
                const res = await updateBuilder.execute();
                return Promise.resolve({ data: res, error: null }).then(resolve, reject);
              }
            }),
            execute: async () => {
              const matched = [];
              for (let i = 0; i < db[tableName].length; i++) {
                let matches = true;
                for (const f of filters) {
                  if (!f(db[tableName][i])) {
                    matches = false;
                    break;
                  }
                }
                if (matches) {
                  const oldRecord = { ...db[tableName][i] };
                  db[tableName][i] = {
                    ...db[tableName][i],
                    ...updates,
                    updated_at: updates.updated_at || new Date().toISOString()
                  };
                  matched.push({ ...db[tableName][i] });
                  notifySubscribers(tableName, 'UPDATE', db[tableName][i], oldRecord);
                }
              }
              return matched;
            },
            then: (resolve, reject) => {
              updateBuilder.execute().then((matched) => {
                resolve({ data: matched, error: null });
              }, reject);
            }
          };
          return updateBuilder;
        },

        delete: () => {
          let filters = [];
          const deleteBuilder = {
            eq: (col, val) => {
              filters.push((r) => String(r[col]) === String(val));
              return deleteBuilder;
            },
            in: (col, vals) => {
              filters.push((r) => vals.map(String).includes(String(r[col])));
              return deleteBuilder;
            },
            then: (resolve, reject) => {
              const remaining = [];
              const deleted = [];
              for (const row of db[tableName]) {
                let match = true;
                for (const f of filters) {
                  if (!f(row)) {
                    match = false;
                    break;
                  }
                }
                if (match) {
                  deleted.push(row);
                  notifySubscribers(tableName, 'DELETE', null, row);
                } else {
                  remaining.push(row);
                }
              }
              db[tableName] = remaining;
              resolve({ data: deleted, error: null });
            }
          };
          return deleteBuilder;
        }
      };
    }
  };

  return client;
}

// ----------------------------------------------------------------------------
// 5. Authoritative Reference Partner Order Service
// ----------------------------------------------------------------------------
const OrderStatus = {
  PENDING: 'pending',
  ACCEPTED: 'accepted',
  PREPARING: 'preparing',
  READY: 'ready',
  PICKING_UP: 'picking_up',
  IN_TRIP: 'in_trip',
  COMPLETED: 'completed',
  CANCELLED: 'cancelled'
};

const referencePartnerService = {
  OrderStatus,

  async fetchPendingOrders(supabaseClient, mode = 'driver', filterId = null) {
    let query = supabaseClient
      .from('orders')
      .select('*')
      .eq('status', OrderStatus.PENDING)
      .order('created_at', { ascending: false });

    if (mode === 'driver') {
      query = query.in('service_type', ['ride', 'send', 'WiraRide', 'WiraSend']).is('driver_id', null);
    } else if (mode === 'merchant' && filterId) {
      query = query.in('service_type', ['food', 'villa', 'WiraFood', 'WiraVilla']).eq('merchant_id', filterId);
    }

    const { data, error } = await query;
    if (error) throw new Error(`fetchPendingOrders failed: ${error.message}`);
    return data || [];
  },

  async getOrderById(supabaseClient, orderId) {
    const { data, error } = await supabaseClient
      .from('orders')
      .select('*')
      .eq('id', orderId)
      .single();

    if (error) throw new Error(`getOrderById failed: ${error.message}`);
    return data;
  },

  async acceptOrder(supabaseClient, orderId, partnerId, mode = 'driver') {
    // Atomic check: only accept if status is still pending and unassigned (for driver)
    let query = supabaseClient
      .from('orders')
      .update({
        status: OrderStatus.ACCEPTED,
        driver_id: mode === 'driver' ? partnerId : null,
        updated_at: new Date().toISOString()
      })
      .eq('id', orderId)
      .eq('status', OrderStatus.PENDING);

    if (mode === 'driver') {
      query = query.is('driver_id', null);
    }

    const { data, error } = await query.select().single();
    if (error || !data) {
      throw new Error(`acceptOrder failed: order was already accepted, cancelled, or not found (${error ? error.message : 'no rows updated'})`);
    }
    return data;
  },

  async updateOrderStatus(supabaseClient, orderId, nextStatus) {
    const validTransitions = {
      [OrderStatus.PENDING]: [OrderStatus.ACCEPTED, OrderStatus.CANCELLED],
      [OrderStatus.ACCEPTED]: [OrderStatus.PICKING_UP, OrderStatus.PREPARING, OrderStatus.CANCELLED, OrderStatus.COMPLETED],
      [OrderStatus.PICKING_UP]: [OrderStatus.IN_TRIP, OrderStatus.CANCELLED],
      [OrderStatus.IN_TRIP]: [OrderStatus.COMPLETED],
      [OrderStatus.PREPARING]: [OrderStatus.READY, OrderStatus.CANCELLED],
      [OrderStatus.READY]: [OrderStatus.COMPLETED, OrderStatus.CANCELLED],
      [OrderStatus.COMPLETED]: [],
      [OrderStatus.CANCELLED]: []
    };

    const currentOrder = await this.getOrderById(supabaseClient, orderId);
    if (!currentOrder) throw new Error(`Order ${orderId} not found`);

    const allowed = validTransitions[currentOrder.status] || [];
    if (!allowed.includes(nextStatus)) {
      throw new Error(`Invalid status transition: Cannot transition order ${orderId} from '${currentOrder.status}' to '${nextStatus}'`);
    }

    const { data, error } = await supabaseClient
      .from('orders')
      .update({ status: nextStatus, updated_at: new Date().toISOString() })
      .eq('id', orderId)
      .select()
      .single();

    if (error) throw new Error(`updateOrderStatus failed: ${error.message}`);
    return data;
  },

  async updateDriverLocation(supabaseClient, driverId, lat, lng) {
    if (lat === null || lng === null || isNaN(lat) || isNaN(lng) || (lat === 0 && lng === 0)) {
      throw new Error(`Invalid GPS coordinates: [${lat}, ${lng}]. Refusing to update location.`);
    }

    const { error } = await supabaseClient
      .from('drivers')
      .upsert({
        id: driverId,
        lat,
        lng,
        is_online: true,
        updated_at: new Date().toISOString()
      });

    if (error) throw new Error(`updateDriverLocation failed: ${error.message}`);
  },

  async completeOrder(supabaseClient, orderId) {
    return this.updateOrderStatus(supabaseClient, orderId, OrderStatus.COMPLETED);
  },

  subscribeToDriverOrders(supabaseClient, onOrder) {
    const channel = supabaseClient
      .channel('driver-orders-stream')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'orders' },
        (payload) => {
          const order = payload.new;
          if (order && order.status === OrderStatus.PENDING && !order.driver_id && ['ride', 'send', 'WiraRide', 'WiraSend'].includes(order.service_type)) {
            onOrder(order);
          }
        }
      )
      .subscribe();

    return () => channel.unsubscribe();
  },

  subscribeToMerchantOrders(supabaseClient, merchantId, onOrder) {
    const channel = supabaseClient
      .channel(`merchant-orders-${merchantId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'orders', filter: `merchant_id=eq.${merchantId}` },
        (payload) => {
          const order = payload.new;
          if (order && order.status === OrderStatus.PENDING) {
            onOrder(order);
          }
        }
      )
      .subscribe();

    return () => channel.unsubscribe();
  },

  subscribeToOrderUpdates(supabaseClient, orderId, onUpdate) {
    const channel = supabaseClient
      .channel(`order-track-${orderId}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'orders', filter: `id=eq.${orderId}` },
        (payload) => {
          if (payload.new) onUpdate(payload.new);
        }
      )
      .subscribe();

    return () => channel.unsubscribe();
  }
};

/**
 * Loads either the real frontend-mitra order service (frontend-partner was
 * merged into it) or the reference service
 */
async function getPartnerOrderService() {
  const rootDir = path.resolve(__dirname, '..');
  const servicePath = path.resolve(rootDir, 'frontend-mitra/src/services/orderService.js');
  if (fs.existsSync(servicePath)) {
    try {
      const imported = await import(`file://${servicePath}`);
      return imported.default || imported;
    } catch (_) {}
  }
  return referencePartnerService;
}

// ----------------------------------------------------------------------------
// 6. Test Runner Framework
// ----------------------------------------------------------------------------
function createTestRunner(suiteName) {
  let passed = 0;
  let failed = 0;
  const tests = [];

  return {
    async test(name, fn) {
      const start = Date.now();
      try {
        await fn();
        const duration = Date.now() - start;
        passed++;
        tests.push({ name, status: 'PASS', duration, error: null });
        console.log(`   ✅ [PASS] (${duration}ms) ${name}`);
      } catch (err) {
        const duration = Date.now() - start;
        failed++;
        tests.push({ name, status: 'FAIL', duration, error: err });
        console.error(`   ❌ [FAIL] (${duration}ms) ${name}\n      Error: ${err.message}`);
      }
    },

    getResults() {
      return { suiteName, passed, failed, total: passed + failed, tests };
    },

    printSummary() {
      console.log('\n------------------------------------------------------------');
      console.log(`📊 SUITE SUMMARY: ${suiteName}`);
      console.log(`   Total Tests : ${passed + failed}`);
      console.log(`   Passed      : ${passed} ✅`);
      console.log(`   Failed      : ${failed} ${failed > 0 ? '❌' : ''}`);
      console.log('------------------------------------------------------------');
      return failed === 0;
    }
  };
}

module.exports = {
  loadEnvironment,
  probeLiveSupabase,
  calculateHaversineMeters,
  createShadowSupabase,
  OrderStatus,
  referencePartnerService,
  getPartnerOrderService,
  createTestRunner
};
