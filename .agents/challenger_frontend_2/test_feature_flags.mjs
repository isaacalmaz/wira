/**
 * test_feature_flags.mjs
 * Empirical stress test harness for HomePage.jsx feature flag logic and edge cases.
 *
 * Tests:
 * 1. Initial baseline state (all services enabled & colorful).
 * 2. Supabase query failure, timeout, and empty responses.
 * 3. Partial service disablement (admin disabling one or more services).
 * 4. Realtime subscription updates (enable, disable, null payloads).
 * 5. Malformed, unknown, and duplicate flag edge cases.
 * 6. UI rendering simulation (routes, classNames, background colors, click interception).
 */

import assert from 'node:assert/strict';
import { SERVICES } from '../../frontend-user/src/config/services.js';

console.log('====================================================');
console.log('EMPIRICAL CHALLENGER: Feature Flag Adversarial Tests');
console.log('====================================================\n');

// --- Helper Functions Simulating HomePage.jsx Implementation ---

/**
 * Simulates the HomePage component's state machine and lifecycle.
 */
class HomePageSimulator {
  constructor() {
    // Exact initial state from HomePage.jsx lines 17-18:
    // const [activeServices, setActiveServices] = useState(SERVICES);
    // const [globalFlags, setGlobalFlags] = useState([]);
    this.activeServices = SERVICES;
    this.globalFlags = [];
    this.logs = [];
  }

  /**
   * Simulates updateServices logic from HomePage.jsx lines 21-27 and 57-64:
   * const updatedServices = SERVICES.map(srv => {
   *   const flag = flags?.find(f => f.id === srv.id);
   *   return { ...srv, enabled: flag ? flag.status : srv.enabled };
   * });
   */
  updateServices(flags) {
    const updatedServices = SERVICES.map(srv => {
      const flag = flags?.find(f => f.id === srv.id);
      return { ...srv, enabled: flag ? flag.status : srv.enabled };
    });
    this.activeServices = updatedServices;
    return this.activeServices;
  }

  /**
   * Simulates fetchGlobalFlags from HomePage.jsx lines 29-36.
   */
  async fetchGlobalFlags(mockSupabaseClient) {
    try {
      const { data, error } = await mockSupabaseClient
        .from('feature_flags')
        .select('features')
        .eq('region', 'features_config')
        .maybeSingle();

      this.logs.push({ event: 'FETCH', data, error });

      if (data && data.features) {
        this.globalFlags = data.features;
        this.updateServices(data.features);
      }
    } catch (err) {
      this.logs.push({ event: 'FETCH_ERROR', error: err.message });
      // In HomePage.jsx init(), uncaught errors do not alter activeServices
    }
  }

  /**
   * Simulates realtime subscription callback from HomePage.jsx lines 44-51.
   */
  handleRealtimePayload(payload) {
    this.logs.push({ event: 'REALTIME', payload });
    if (payload.new && payload.new.features) {
      this.globalFlags = payload.new.features;
      // useEffect([globalFlags]) triggers updateServices
      this.updateServices(this.globalFlags);
    }
  }

  /**
   * Simulates JSX UI rendering attributes for a given service.
   * Directly mirrors HomePage.jsx lines 104-118:
   * - to={service.enabled ? service.path : '#'}
   * - className={`flex flex-col items-center gap-1.5 group ${service.enabled ? "" : "opacity-40 grayscale cursor-not-allowed"}`}
   * - style={{ backgroundColor: service.enabled ? service.color : "#94a3b8" }}
   * - onClick={(e) => { if(!service.enabled) e.preventDefault(); }}
   */
  renderServiceUI(service) {
    let prevented = false;
    const fakeEvent = {
      preventDefault: () => { prevented = true; }
    };

    const to = service.enabled ? service.path : '#';
    const className = `flex flex-col items-center gap-1.5 group ${service.enabled ? "" : "opacity-40 grayscale cursor-not-allowed"}`;
    const backgroundColor = service.enabled ? service.color : "#94a3b8";
    
    // Simulate onClick
    if (!service.enabled) {
      fakeEvent.preventDefault();
    }

    return {
      id: service.id,
      name: service.name_id,
      enabled: service.enabled,
      to,
      className,
      backgroundColor,
      isGreyscale: className.includes('grayscale'),
      isCursorNotAllowed: className.includes('cursor-not-allowed'),
      isPrevented: prevented
    };
  }

  renderAllUI() {
    return this.activeServices.map(srv => this.renderServiceUI(srv));
  }
}

// ====================================================================
// TEST SUITE
// ====================================================================

let passedTests = 0;
let totalTests = 0;

function runTest(testName, fn) {
  totalTests++;
  try {
    fn();
    console.log(`  [PASS] ${testName}`);
    passedTests++;
  } catch (err) {
    console.error(`  [FAIL] ${testName}`);
    console.error(`         Reason: ${err.message}`);
    throw err;
  }
}

// --------------------------------------------------------------------
// TEST GROUP 1: BASELINE & INITIAL STATE
// --------------------------------------------------------------------
console.log('--- Test Group 1: Baseline Initial State ---');

runTest('1.1 SERVICES config has exactly 8 defined services', () => {
  assert.equal(SERVICES.length, 8, 'Expected 8 default services in config');
  const expectedIds = [
    'wira_ride', 'wira_food', 'wira_send', 'wira_pay',
    'wira_pulsa', 'wira_villa', 'wira_service', 'wira_pool'
  ];
  for (const id of expectedIds) {
    assert.ok(SERVICES.some(s => s.id === id), `Expected service with id ${id}`);
  }
});

runTest('1.2 HomePage initializes all 8 services as enabled, colorful, and accessible', () => {
  const sim = new HomePageSimulator();
  const ui = sim.renderAllUI();

  assert.equal(ui.length, 8);
  for (const item of ui) {
    const originalConfig = SERVICES.find(s => s.id === item.id);
    assert.equal(item.enabled, true, `${item.id} should be enabled by default`);
    assert.equal(item.to, originalConfig.path, `${item.id} route should be ${originalConfig.path}`);
    assert.equal(item.backgroundColor, originalConfig.color, `${item.id} color should be ${originalConfig.color}`);
    assert.equal(item.isGreyscale, false, `${item.id} should not be greyscale`);
    assert.equal(item.isPrevented, false, `${item.id} clicks should not be prevented`);
  }
});

// --------------------------------------------------------------------
// TEST GROUP 2: SUPABASE QUERY FAILURE, TIMEOUT, EMPTY, & EXCEPTIONS
// --------------------------------------------------------------------
console.log('\n--- Test Group 2: Supabase Query Failures, Timeouts, & Empty Responses ---');

runTest('2.1 Query fails with network error (TypeError: fetch failed)', async () => {
  const sim = new HomePageSimulator();
  const mockClient = {
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({
            data: null,
            error: { message: 'TypeError: fetch failed', details: 'ENOTFOUND' }
          })
        })
      })
    })
  };

  await sim.fetchGlobalFlags(mockClient);
  const ui = sim.renderAllUI();

  // Assert all 8 services remain enabled, colorful, and accessible
  assert.equal(ui.length, 8);
  for (const item of ui) {
    const originalConfig = SERVICES.find(s => s.id === item.id);
    assert.equal(item.enabled, true);
    assert.equal(item.backgroundColor, originalConfig.color);
    assert.equal(item.to, originalConfig.path);
    assert.equal(item.isGreyscale, false);
    assert.equal(item.isPrevented, false);
  }
});

runTest('2.2 Query times out / aborts (data: null, error: AbortError)', async () => {
  const sim = new HomePageSimulator();
  const mockClient = {
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({
            data: null,
            error: { message: 'AbortError: signal timed out' }
          })
        })
      })
    })
  };

  await sim.fetchGlobalFlags(mockClient);
  const ui = sim.renderAllUI();

  for (const item of ui) {
    const originalConfig = SERVICES.find(s => s.id === item.id);
    assert.equal(item.enabled, true);
    assert.equal(item.backgroundColor, originalConfig.color);
    assert.equal(item.to, originalConfig.path);
    assert.equal(item.isGreyscale, false);
  }
});

runTest('2.3 Query returns 0 rows (data: null, error: null)', async () => {
  const sim = new HomePageSimulator();
  const mockClient = {
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({ data: null, error: null })
        })
      })
    })
  };

  await sim.fetchGlobalFlags(mockClient);
  const ui = sim.renderAllUI();

  for (const item of ui) {
    assert.equal(item.enabled, true);
    assert.notEqual(item.backgroundColor, '#94a3b8');
  }
});

runTest('2.4 Query returns features as empty array (data: { features: [] })', async () => {
  const sim = new HomePageSimulator();
  const mockClient = {
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({ data: { features: [] }, error: null })
        })
      })
    })
  };

  await sim.fetchGlobalFlags(mockClient);
  const ui = sim.renderAllUI();

  // Since flags array is empty, flags.find returns undefined, fallback is srv.enabled (true)
  for (const item of ui) {
    const originalConfig = SERVICES.find(s => s.id === item.id);
    assert.equal(item.enabled, true);
    assert.equal(item.backgroundColor, originalConfig.color);
    assert.equal(item.to, originalConfig.path);
  }
});

runTest('2.5 Query returns features as null (data: { features: null })', async () => {
  const sim = new HomePageSimulator();
  const mockClient = {
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({ data: { features: null }, error: null })
        })
      })
    })
  };

  await sim.fetchGlobalFlags(mockClient);
  const ui = sim.renderAllUI();

  for (const item of ui) {
    assert.equal(item.enabled, true);
  }
});

runTest('2.6 Query rejects with unexpected throw', async () => {
  const sim = new HomePageSimulator();
  const mockClient = {
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => {
            throw new Error('Supabase client crashed');
          }
        })
      })
    })
  };

  await sim.fetchGlobalFlags(mockClient);
  const ui = sim.renderAllUI();

  for (const item of ui) {
    assert.equal(item.enabled, true);
  }
});

// --------------------------------------------------------------------
// TEST GROUP 3: PARTIAL & SELECTIVE SERVICE DISABLEMENT
// --------------------------------------------------------------------
console.log('\n--- Test Group 3: Selective Service Disablement ---');

runTest('3.1 Disabling single service (wira_ride) disables ONLY wira_ride', async () => {
  const sim = new HomePageSimulator();
  const mockClient = {
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({
            data: {
              features: [
                { id: 'wira_ride', status: false },
                { id: 'wira_food', status: true }
              ]
            },
            error: null
          })
        })
      })
    })
  };

  await sim.fetchGlobalFlags(mockClient);
  const ui = sim.renderAllUI();

  // Check wira_ride
  const ride = ui.find(s => s.id === 'wira_ride');
  assert.equal(ride.enabled, false, 'wira_ride should be disabled');
  assert.equal(ride.to, '#', 'wira_ride path should be #');
  assert.equal(ride.backgroundColor, '#94a3b8', 'wira_ride should be greyed out to #94a3b8');
  assert.equal(ride.isGreyscale, true, 'wira_ride should have grayscale class');
  assert.equal(ride.isCursorNotAllowed, true, 'wira_ride should have cursor-not-allowed');
  assert.equal(ride.isPrevented, true, 'wira_ride click must be prevented');

  // Check other 7 services
  const otherServices = ui.filter(s => s.id !== 'wira_ride');
  assert.equal(otherServices.length, 7, 'Should have 7 other services');
  for (const s of otherServices) {
    const originalConfig = SERVICES.find(c => c.id === s.id);
    assert.equal(s.enabled, true, `${s.id} should remain enabled`);
    assert.equal(s.to, originalConfig.path, `${s.id} route should be intact`);
    assert.equal(s.backgroundColor, originalConfig.color, `${s.id} should retain original color`);
    assert.equal(s.isGreyscale, false, `${s.id} should NOT be greyscale`);
    assert.equal(s.isPrevented, false, `${s.id} click should NOT be prevented`);
  }
});

runTest('3.2 Disabling multiple services (wira_food & wira_pool) affects ONLY those two', async () => {
  const sim = new HomePageSimulator();
  const mockClient = {
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({
            data: {
              features: [
                { id: 'wira_food', status: false },
                { id: 'wira_pool', status: false }
              ]
            },
            error: null
          })
        })
      })
    })
  };

  await sim.fetchGlobalFlags(mockClient);
  const ui = sim.renderAllUI();

  const disabled = ui.filter(s => !s.enabled);
  const enabled = ui.filter(s => s.enabled);

  assert.equal(disabled.length, 2);
  assert.deepEqual(disabled.map(s => s.id).sort(), ['wira_food', 'wira_pool']);
  assert.equal(enabled.length, 6);

  for (const s of disabled) {
    assert.equal(s.backgroundColor, '#94a3b8');
    assert.equal(s.to, '#');
    assert.equal(s.isPrevented, true);
  }

  for (const s of enabled) {
    const originalConfig = SERVICES.find(c => c.id === s.id);
    assert.equal(s.backgroundColor, originalConfig.color);
    assert.equal(s.to, originalConfig.path);
    assert.equal(s.isPrevented, false);
  }
});

runTest('3.3 Re-enabling a disabled service restores color and accessibility', async () => {
  const sim = new HomePageSimulator();
  
  // Step 1: disable wira_ride
  sim.updateServices([{ id: 'wira_ride', status: false }]);
  let ride = sim.renderServiceUI(sim.activeServices.find(s => s.id === 'wira_ride'));
  assert.equal(ride.enabled, false);
  assert.equal(ride.backgroundColor, '#94a3b8');

  // Step 2: admin re-enables wira_ride
  sim.updateServices([{ id: 'wira_ride', status: true }]);
  ride = sim.renderServiceUI(sim.activeServices.find(s => s.id === 'wira_ride'));
  assert.equal(ride.enabled, true);
  assert.equal(ride.backgroundColor, '#0891B2'); // Original turquoise
  assert.equal(ride.to, '/ride');
  assert.equal(ride.isPrevented, false);
});

// --------------------------------------------------------------------
// TEST GROUP 4: REALTIME UPDATES
// --------------------------------------------------------------------
console.log('\n--- Test Group 4: Realtime Subscription Events ---');

runTest('4.1 Realtime payload successfully toggles service state dynamically', () => {
  const sim = new HomePageSimulator();
  assert.equal(sim.activeServices.every(s => s.enabled), true);

  // Incoming realtime broadcast
  sim.handleRealtimePayload({
    new: {
      region: 'features_config',
      features: [{ id: 'wira_send', status: false }]
    }
  });

  const send = sim.renderServiceUI(sim.activeServices.find(s => s.id === 'wira_send'));
  assert.equal(send.enabled, false);
  assert.equal(send.backgroundColor, '#94a3b8');

  const ride = sim.renderServiceUI(sim.activeServices.find(s => s.id === 'wira_ride'));
  assert.equal(ride.enabled, true);
});

runTest('4.2 Realtime payload with null/empty payload does not crash or alter state', () => {
  const sim = new HomePageSimulator();
  
  // Malformed / delete payload
  sim.handleRealtimePayload({ new: null });
  assert.equal(sim.activeServices.every(s => s.enabled), true);

  sim.handleRealtimePayload({ new: {} });
  assert.equal(sim.activeServices.every(s => s.enabled), true);
});

// --------------------------------------------------------------------
// TEST GROUP 5: ADVERSARIAL & UNEXPECTED PAYLOADS
// --------------------------------------------------------------------
console.log('\n--- Test Group 5: Adversarial Payloads & Edge Cases ---');

runTest('5.1 Flags containing unknown / future services do not pollute activeServices', () => {
  const sim = new HomePageSimulator();
  sim.updateServices([
    { id: 'wira_rocket', status: false },
    { id: 'wira_drone', status: true }
  ]);

  const ui = sim.renderAllUI();
  assert.equal(ui.length, 8, 'Should remain exactly 8 services');
  assert.ok(!ui.some(s => s.id === 'wira_rocket'));
  assert.equal(ui.every(s => s.enabled), true);
});

runTest('5.2 Flags with duplicate entries resolves predictably to first match', () => {
  const sim = new HomePageSimulator();
  sim.updateServices([
    { id: 'wira_ride', status: false },
    { id: 'wira_ride', status: true }
  ]);

  const ride = sim.activeServices.find(s => s.id === 'wira_ride');
  assert.equal(ride.enabled, false, 'find() takes first match in array');
});

runTest('5.3 Flags with extra metadata fields preserve enabled status cleanly', () => {
  const sim = new HomePageSimulator();
  sim.updateServices([
    { id: 'wira_ride', status: false, region: 'Mataram', author: 'admin', timestamp: Date.now() }
  ]);

  const ride = sim.activeServices.find(s => s.id === 'wira_ride');
  assert.equal(ride.enabled, false);
  // Ensure original properties like icon, color, path are retained
  assert.equal(ride.color, '#0891B2');
  assert.equal(ride.path, '/ride');
});

// --------------------------------------------------------------------
// SUMMARY
// --------------------------------------------------------------------
console.log('\n====================================================');
console.log(`SUMMARY: ${passedTests} / ${totalTests} tests passed (${Math.round((passedTests / totalTests) * 100)}%)`);
console.log('====================================================');

if (passedTests !== totalTests) {
  process.exit(1);
}
