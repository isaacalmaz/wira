/**
 * Test Suite: In-Chat Direct Draft & Booking Confirmation Coverage
 * Verifies that all 8 Wira services (Ride, Food, Send, Villa, Bersih, Pool, Service, Asuh)
 * immediately synthesize and render interactive booking_draft cards in the chat window,
 * with complete details, fare estimates, and 1-tap confirmation capability.
 */

import { createRequire } from 'module';
const require = createRequire(import.meta.url);

const express = require('../backend/node_modules/express');
const router = require('../backend/routes/assistant.routes.js');

async function runTestSuite() {
  console.log('============================================================');
  console.log('🛒 RUNNING IN-CHAT DIRECT DRAFTING INTEGRATION TESTS');
  console.log('============================================================');

  const app = express();
  app.use(express.json());
  app.use('/api/assistant', router);

  const server = app.listen(0);
  const port = server.address().port;
  const baseUrl = `http://127.0.0.1:${port}/api/assistant`;

  let passed = 0;
  let failed = 0;

  const testCases = [
    {
      name: 'WiraRide: Direct booking draft with destination',
      query: 'pesen ojek ke pantai kuta',
      expectedService: 'ride',
      checkDetails: (d) => d.origin && d.destination && d.vehicleType,
    },
    {
      name: 'WiraRide: Broad request drafts immediately with sensible defaults',
      query: 'mau naik ojek dong',
      expectedService: 'ride',
      checkDetails: (d) => d.origin && d.destination,
    },
    {
      name: 'WiraFood: Broad culinary request drafts top restaurant order',
      query: 'mau makan dong',
      expectedService: 'food',
      checkDetails: (d) => d.merchantName && d.items && d.destination,
    },
    {
      name: 'WiraFood: Specific dish inquiry drafts immediate food order',
      query: 'laper nih mau pesen ayam taliwang',
      expectedService: 'food',
      checkDetails: (d) => d.items.toLowerCase().includes('taliwang'),
    },
    {
      name: 'WiraSend: Package delivery inquiry drafts courier booking',
      query: 'kirim paket kilat ke mataram',
      expectedService: 'send',
      checkDetails: (d) => d.origin && d.destination && d.packageSize,
    },
    {
      name: 'WiraVilla: Specific villa rental inquiry drafts reservation',
      query: 'sewa villa di kuta 2 malam',
      expectedService: 'villa',
      checkDetails: (d) => d.villaName && d.nights === 2,
    },
    {
      name: 'WiraVilla: Broad lodging request drafts top villa stay',
      query: 'mau nginep di villa lombok',
      expectedService: 'villa',
      checkDetails: (d) => d.villaName && d.nights >= 1,
    },
    {
      name: 'WiraBersih: Waste management request drafts Sampun Bersih service',
      query: 'angkut sampah villa kuta',
      expectedService: 'bersih',
      checkDetails: (d) => d.subType && d.address,
    },
    {
      name: 'WiraPool: Swimming pool cleaning request drafts WiraPool visit',
      query: 'kuras kolam renang villa',
      expectedService: 'pool',
      checkDetails: (d) => d.serviceCategory && d.address,
    },
    {
      name: 'WiraService: AC repair technician request drafts WiraService visit',
      query: 'panggil teknisi servis ac',
      expectedService: 'service',
      checkDetails: (d) => d.serviceCategory === 'ac' && d.address,
    },
    {
      name: 'WiraService: Mini excavator rental request drafts heavy equipment booking',
      query: 'sewa excavator mini di praya',
      expectedService: 'service',
      checkDetails: (d) => d.serviceCategory === 'excavator' && d.address,
    },
    {
      name: 'WiraAsuh: Babysitter childcare request drafts WiraAsuh booking',
      query: 'cari babysitter jaga anak 4 jam',
      expectedService: 'babysit',
      checkDetails: (d) => d.durationHours === 4 && d.address,
    },
    {
      name: 'WiraRide: User GPS in Pengembur to Bandara calculates faithful ~7 km (NOT 15 km)',
      query: 'pesankan saya ride sekarang, jemput di tempat saya menuju bandara',
      userLocation: {
        address: 'gang pengmbur Bencot, Dusun Batu Samban, Pengembur',
        lat: -8.8212,
        lng: 116.2594,
      },
      expectedService: 'ride',
      checkDetails: (d) => {
        const isNearAirport = d.distanceKm >= 5 && d.distanceKm <= 9;
        const hasBandaraDest = d.destination.toLowerCase().includes('bandara') || d.destination.toLowerCase().includes('lop');
        const hasUserOrigin = d.origin.toLowerCase().includes('pengmbur') || d.origin.toLowerCase().includes('pengembur') || d.origin.toLowerCase().includes('lokasi anda');
        const hasRouteUrl = typeof d.routeUrl === 'string' && d.routeUrl.includes('/ride');
        const hasRoadPricing = d.motorPrice === 30000 && d.carPrice === 54500;
        return isNearAirport && hasBandaraDest && hasUserOrigin && hasRouteUrl && hasRoadPricing;
      },
    },
    {
      name: 'WiraRide: User in Pengembur to Soma House Kuta drafts faithful ~11-12 km (NOT Bandara)',
      query: 'pesankan ride dari tempat saya ke soma house kuta',
      userLocation: {
        address: 'gang pengmbur Bencot, Dusun Batu Samban, Pengembur',
        lat: -8.8212,
        lng: 116.2594,
      },
      expectedService: 'ride',
      checkDetails: (d) => {
        const hasSoma = d.destination.toLowerCase().includes('soma');
        const notBandara = !d.origin.toLowerCase().includes('bandara') && !d.destination.toLowerCase().includes('bandara');
        const distanceOk = d.distanceKm >= 10 && d.distanceKm <= 14;
        return hasSoma && notBandara && distanceOk;
      },
    },
    {
      name: 'WiraRide: Intra-Kuta ride preserves destination and does not force Bandara',
      query: 'pesan ojek dari kuta ke pantai kuta',
      expectedService: 'ride',
      checkDetails: (d) => {
        const notBandara = !d.destination.toLowerCase().includes('bandara');
        return notBandara;
      },
    },
  ];

  try {
    for (const tc of testCases) {
      const res = await fetch(`${baseUrl}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: tc.query,
          userLocation: tc.userLocation || null,
        }),
      });

      if (!res.ok) {
        console.error(`❌ [FAIL] ${tc.name}: HTTP ${res.status}`);
        failed++;
        continue;
      }

      const data = await res.json();
      const draft = data.widgets?.find((w) => w.type === 'booking_draft');

      if (!draft) {
        console.error(`❌ [FAIL] ${tc.name}: No booking_draft widget returned`);
        failed++;
        continue;
      }

      if (draft.serviceType !== tc.expectedService) {
        console.error(`❌ [FAIL] ${tc.name}: Expected serviceType '${tc.expectedService}', got '${draft.serviceType}'`);
        failed++;
        continue;
      }

      if (tc.checkDetails && !tc.checkDetails(draft.details || {})) {
        console.error(`❌ [FAIL] ${tc.name}: Draft details validation failed`, draft.details);
        failed++;
        continue;
      }

      if (!draft.priceEstimate || draft.priceEstimate <= 0) {
        console.error(`❌ [FAIL] ${tc.name}: Invalid priceEstimate: ${draft.priceEstimate}`);
        failed++;
        continue;
      }

      console.log(`✅ [PASS] ${tc.name}`);
      passed++;
    }
  } finally {
    server.close();
  }

  console.log('============================================================');
  console.log(`📊 RESULTS: ${passed} / ${passed + failed} tests passed`);
  console.log('============================================================');

  if (failed > 0) {
    process.exit(1);
  }
}

runTestSuite().catch((err) => {
  console.error('Test suite failed:', err);
  process.exit(1);
});
