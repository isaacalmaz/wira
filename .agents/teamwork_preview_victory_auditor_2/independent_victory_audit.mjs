import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '../../');

console.log('================================================================');
console.log('🕵️‍♂️ INDEPENDENT VICTORY AUDITOR VERIFICATION SUITE');
console.log(`Root: ${projectRoot}`);
console.log('================================================================\n');

let passCount = 0;
let failCount = 0;

function auditAssert(description, fn) {
  try {
    fn();
    console.log(`[AUDIT PASS] ${description}`);
    passCount++;
  } catch (err) {
    console.error(`[AUDIT FAIL] ${description}: ${err.message}`);
    failCount++;
  }
}

async function auditAssertAsync(description, fn) {
  try {
    await fn();
    console.log(`[AUDIT PASS] ${description}`);
    passCount++;
  } catch (err) {
    console.error(`[AUDIT FAIL] ${description}: ${err.message}`);
    failCount++;
  }
}

// 1. Import implementation module
const servicePath = path.resolve(projectRoot, 'frontend-user/src/services/topupService.js');
assert.ok(fs.existsSync(servicePath), `Service file missing: ${servicePath}`);
const topupService = await import(`file://${servicePath}`);

const {
  parseNominal,
  generateUniqueCode,
  getAvailableUniqueCode,
  calculateUniqueTopUpAmount,
  createTopUpRequest,
  cancelTopUpRequest,
  fetchUserTopUpRequests,
  formatAmountWithUniqueHighlight,
} = topupService;

console.log('--- SECTION 1: STRESS TESTING MATHEMATICAL & GENERATION LOGIC ---');

auditAssert('generateUniqueCode: 50,000 iterations strictly within [101, 999] and modulo 1000 > 0', () => {
  const codes = new Set();
  for (let i = 0; i < 50000; i++) {
    const c = generateUniqueCode();
    assert.strictEqual(typeof c, 'number');
    assert.ok(Number.isInteger(c), 'Must be an integer');
    assert.ok(c >= 101 && c <= 999, `Code ${c} out of range [101, 999]`);
    assert.ok(c % 1000 > 0, `Code ${c} % 1000 is zero`);
    codes.add(c);
  }
  // Check distribution covers a substantial majority of the 899 possible values
  assert.ok(codes.size > 800, `Expected high coverage of 899 range, got ${codes.size}`);
});

auditAssert('parseNominal: extreme edge cases and malformed string handling', () => {
  assert.strictEqual(parseNominal('Rp 50.000'), 50000);
  assert.strictEqual(parseNominal('  IDR 1.250.000  '), 1250000);
  assert.strictEqual(parseNominal('100.000,00'), 100000);
  assert.strictEqual(parseNominal('50000.75'), 50001);
  assert.strictEqual(parseNominal(20000), 20000);
  assert.ok(Number.isNaN(parseNominal('')));
  assert.strictEqual(parseNominal('   '), 0); // In JS Number('') is 0, rejected by calculateUniqueTopUpAmount
  assert.throws(() => calculateUniqueTopUpAmount('   '), /tidak valid/);
  assert.ok(Number.isNaN(parseNominal(null)));
  assert.ok(Number.isNaN(parseNominal(undefined)));
  assert.ok(Number.isNaN(parseNominal({})));
  assert.ok(Number.isNaN(parseNominal('Rp ABC')));
});

auditAssert('calculateUniqueTopUpAmount: strict boundaries and invariants', () => {
  // Boundary 10,000 (minimum)
  const minRes = calculateUniqueTopUpAmount(10000);
  assert.strictEqual(minRes.baseAmount, 10000);
  assert.ok(minRes.totalAmount >= 10101 && minRes.totalAmount <= 10999);
  assert.strictEqual(minRes.totalAmount % 1000 > 0, true);
  assert.strictEqual(minRes.totalAmount, minRes.baseAmount + minRes.uniqueCode);

  // Boundary 9,999 (sub-minimum)
  assert.throws(() => calculateUniqueTopUpAmount(9999), /Minimal Rp 10\.000/);

  // Explicit code testing
  const expRes = calculateUniqueTopUpAmount(50000, 777);
  assert.strictEqual(expRes.baseAmount, 50000);
  assert.strictEqual(expRes.uniqueCode, 777);
  assert.strictEqual(expRes.totalAmount, 50777);
  assert.strictEqual(expRes.totalAmount % 1000 > 0, true);

  // Explicit invalid code (e.g. 0 or >999) falls back safely to random valid code
  const fbRes = calculateUniqueTopUpAmount(50000, 0);
  assert.ok(fbRes.uniqueCode >= 101 && fbRes.uniqueCode <= 999);
  assert.strictEqual(fbRes.totalAmount % 1000 > 0, true);
});

auditAssert('formatAmountWithUniqueHighlight: precision formatting & 3-digit isolation', () => {
  const f1 = formatAmountWithUniqueHighlight(50123);
  assert.strictEqual(f1.prefix, 'Rp 50.');
  assert.strictEqual(f1.uniqueDigits, '123');
  assert.strictEqual(f1.fullFormatted, 'Rp 50.123');
  assert.strictEqual(f1.rawAmount, 50123);

  const f2 = formatAmountWithUniqueHighlight(1500987);
  assert.strictEqual(f2.prefix, 'Rp 1.500.');
  assert.strictEqual(f2.uniqueDigits, '987');
  assert.strictEqual(f2.fullFormatted, 'Rp 1.500.987');

  const fSmall = formatAmountWithUniqueHighlight(105);
  assert.strictEqual(fSmall.uniqueDigits, '105');
});

console.log('\n--- SECTION 2: ADVERSARIAL STRESS-TESTING COLLISION & SATURATION ---');

await auditAssertAsync('getAvailableUniqueCode: handles saturated pool (898 codes occupied, only 1 left)', async () => {
  // Populate an occupied pool with 898 codes (all except 555)
  const occupiedAmounts = [];
  for (let c = 101; c <= 999; c++) {
    if (c !== 555) {
      occupiedAmounts.push({ amount: 50000 + c });
    }
  }

  const saturatedDb = {
    rpc: async (fn, params) => {
      if (fn === 'get_pending_topup_codes') {
        return { data: occupiedAmounts, error: null };
      }
      return { data: null, error: new Error('Unknown RPC') };
    }
  };

  // Must find the exact remaining code: 555
  const allocated = await getAvailableUniqueCode(saturatedDb, 50000);
  assert.strictEqual(allocated, 555, `Expected 555 from saturated pool, got ${allocated}`);
});

await auditAssertAsync('createTopUpRequest: concurrency retry recovers from duplicate key (error 23505)', async () => {
  let attempt = 0;
  const mockDb = {
    from: () => ({
      select: () => ({
        eq: () => ({
          eq: async () => ({ data: [], error: null })
        })
      }),
      insert: () => ({
        select: async () => {
          attempt++;
          if (attempt === 1) {
            return { data: null, error: { code: '23505', message: 'duplicate key value violates unique constraint' } };
          }
          return { data: [{ id: 'req-success', amount: 50888, status: 'pending' }], error: null };
        }
      })
    }),
    rpc: async () => ({ data: [], error: null })
  };

  const created = await createTopUpRequest(mockDb, { userId: 'u1', amount: 50123 });
  assert.strictEqual(attempt, 2, 'Should have retried once on 23505');
  assert.strictEqual(created.id, 'req-success');
  assert.strictEqual(created.amount, 50888);
});

await auditAssertAsync('cancelTopUpRequest: safely cancels pending request and rejects non-pending', async () => {
  const store = [
    { id: 'p1', user_id: 'u1', status: 'pending', amount: 50123 },
    { id: 'p2', user_id: 'u1', status: 'approved', amount: 50124 },
  ];

  const cancelDb = {
    rpc: async (fn, params) => {
      if (fn === 'cancel_topup_request') {
        const row = store.find((r) => r.id === params.request_id);
        if (!row || row.status !== 'pending') return { data: false, error: null };
        row.status = 'cancelled';
        return { data: true, error: null };
      }
      return { data: null, error: new Error('Unknown RPC') };
    }
  };

  const cancelSuccess = await cancelTopUpRequest(cancelDb, 'p1', 'u1');
  assert.strictEqual(cancelSuccess, true);
  assert.strictEqual(store[0].status, 'cancelled');

  const cancelFail = await cancelTopUpRequest(cancelDb, 'p2', 'u1');
  assert.strictEqual(cancelFail, false);
});

console.log('\n--- SECTION 3: SOURCE CODE FORENSIC & CHEAT DETECTION ---');

const walletPagePath = path.resolve(projectRoot, 'frontend-user/src/pages/WalletPage.jsx');
const walletSource = fs.readFileSync(walletPagePath, 'utf8');

auditAssert('WalletPage.jsx: ZERO presence of Virtual Account options', () => {
  const forbidden = [
    'BCA Virtual Account',
    'BRI Virtual Account',
    'BNI Virtual Account',
    'Mandiri Virtual Account',
    'Permata Virtual Account',
    'CIMB Virtual Account',
    'VA Number',
    'Nomor VA',
  ];
  for (const item of forbidden) {
    assert.strictEqual(
      walletSource.includes(item),
      false,
      `Forbidden string found in WalletPage.jsx: "${item}"`
    );
  }
});

auditAssert('WalletPage.jsx: Contains single QRIS Statis option and explicit 3-digit warning', () => {
  assert.ok(
    walletSource.includes('Pembayaran via QRIS (Wajib Sesuai Nominal)'),
    'Single QRIS option string not found'
  );
  assert.ok(
    walletSource.includes('PENTING: Wajib transfer tepat hingga 3 digit terakhir'),
    'Warning box for 3 digit exact transfer not found'
  );
  assert.ok(
    walletSource.includes('formatAmountWithUniqueHighlight'),
    'Unique highlight formatter not integrated'
  );
});

auditAssert('QRISCard.jsx: Standardized national QRIS component exists and renders SVG', () => {
  const qrisCardPath = path.resolve(projectRoot, 'frontend-user/src/components/common/QRISCard.jsx');
  assert.ok(fs.existsSync(qrisCardPath), 'QRISCard.jsx missing');
  const qrisSource = fs.readFileSync(qrisCardPath, 'utf8');
  assert.ok(qrisSource.includes('QRIS'), 'QRIS text missing');
  assert.ok(qrisSource.includes('<svg'), 'Vector barcode missing');
  assert.ok(qrisSource.includes('DANA Bisnis'), 'DANA footer missing');
});

auditAssert('FinancePage.jsx: Admin manual verification displays highlighted unique code', () => {
  const financePath = path.resolve(projectRoot, 'frontend-admin/src/pages/FinancePage.jsx');
  assert.ok(fs.existsSync(financePath), 'FinancePage.jsx missing');
  const financeSource = fs.readFileSync(financePath, 'utf8');
  assert.ok(financeSource.includes('Kode Unik'), 'Admin unique code label missing');
  assert.ok(financeSource.includes('text-amber-600'), 'Admin amber highlight missing');
  assert.ok(financeSource.includes('reject_topup_request'), 'reject_topup_request RPC missing');
});

auditAssert('setup_wallet.sql: Database trigger and uniqueness constraint definitions', () => {
  const sqlPath = path.resolve(projectRoot, 'setup_wallet.sql');
  assert.ok(fs.existsSync(sqlPath), 'setup_wallet.sql missing');
  const sql = fs.readFileSync(sqlPath, 'utf8');
  assert.ok(sql.includes('trg_ensure_unique_amount'), 'Trigger trg_ensure_unique_amount missing');
  assert.ok(sql.includes('idx_topup_requests_pending_unique_amount'), 'Partial unique index missing');
  assert.ok(sql.includes('cancel_topup_request'), 'cancel_topup_request RPC missing');
  assert.ok(sql.includes('approve_topup_request'), 'approve_topup_request RPC missing');
  assert.ok(sql.includes('reject_topup_request'), 'reject_topup_request RPC missing');
  assert.ok(sql.includes('get_pending_topup_codes'), 'get_pending_topup_codes RPC missing');
});

console.log('\n================================================================');
console.log(`AUDIT EXECUTION SUMMARY: ${passCount} PASSED, ${failCount} FAILED`);
console.log('================================================================\n');

if (failCount > 0) {
  process.exit(1);
} else {
  process.exit(0);
}
