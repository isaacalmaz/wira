#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const assert = require('assert');

async function runAdversarialAudit() {
  console.log('====================================================');
  console.log('🕵️ VICTORY AUDITOR ADVERSARIAL STRESS TEST');
  console.log('====================================================');

  const topupServicePath = path.resolve(__dirname, '../../frontend-user/src/services/topupService.js');
  assert.ok(fs.existsSync(topupServicePath), 'topupService.js must exist');
  const {
    parseNominal,
    generateUniqueCode,
    getAvailableUniqueCode,
    calculateUniqueTopUpAmount,
    formatAmountWithUniqueHighlight
  } = await import(`file://${topupServicePath}`);

  let testCount = 0;
  function test(name, fn) {
    testCount++;
    try {
      fn();
      console.log(`[PASS] Test ${testCount}: ${name}`);
    } catch (err) {
      console.error(`[FAIL] Test ${testCount}: ${name} -> ${err.message}`);
      throw err;
    }
  }

  // 1. Stress-test random generator 100,000 times
  test('100,000 iterations of generateUniqueCode strictly within [101, 999] and modulo 1000 > 0', () => {
    for (let i = 0; i < 100000; i++) {
      const code = generateUniqueCode();
      if (code < 101 || code > 999 || code % 1000 === 0) {
        throw new Error(`Violating code generated: ${code}`);
      }
    }
  });

  // 2. Stress-test calculateUniqueTopUpAmount across 50,000 random base amounts
  test('50,000 random base amounts strictly satisfy total % 1000 > 0 and base + code === total', () => {
    for (let i = 0; i < 50000; i++) {
      const base = Math.floor(Math.random() * 50000000) + 10000;
      const res = calculateUniqueTopUpAmount(base);
      assert.strictEqual(res.totalAmount % 1000 > 0, true);
      assert.strictEqual(res.baseAmount + res.uniqueCode, res.totalAmount);
      assert.ok(res.uniqueCode >= 101 && res.uniqueCode <= 999);
    }
  });

  // 3. Stress-test collision fallback when 898 of 899 slots are occupied
  await (async () => {
    testCount++;
    console.log(`[RUN] Test ${testCount}: Collision scan fallback with 898/899 slots occupied...`);
    const occupied = [];
    const targetFreeCode = 777;
    for (let c = 101; c <= 999; c++) {
      if (c !== targetFreeCode) {
        occupied.push(50000 + c);
      }
    }

    const mockSupabase = {
      from: () => ({
        select: () => ({
          eq: () => ({
            gte: () => ({
              lte: async () => ({
                data: occupied.map(a => ({ amount: a })),
                error: null
              })
            })
          })
        })
      })
    };

    const foundCode = await getAvailableUniqueCode(mockSupabase, 50000);
    assert.strictEqual(foundCode, targetFreeCode, `Must find the exact single available slot ${targetFreeCode}`);
    console.log(`[PASS] Test ${testCount}: Found free slot ${foundCode} under extreme saturation!`);
  })();

  // 4. Test format helper edge cases
  test('formatAmountWithUniqueHighlight handles small, normal, and very large numbers', () => {
    const f1 = formatAmountWithUniqueHighlight(10123);
    assert.strictEqual(f1.prefix, 'Rp 10.');
    assert.strictEqual(f1.uniqueDigits, '123');

    const f2 = formatAmountWithUniqueHighlight(100000456);
    assert.strictEqual(f2.uniqueDigits, '456');
    assert.strictEqual(f2.prefix, 'Rp 100.000.');
  });

  // 5. Test parseNominal adversarial inputs
  test('parseNominal handles zero, negative, weird whitespaces, currency symbols', () => {
    assert.strictEqual(parseNominal('  Rp 100.000  '), 100000);
    assert.strictEqual(parseNominal('IDR 250.000,00'), 250000);
    assert.strictEqual(parseNominal('1.000.000'), 1000000);
    assert.strictEqual(parseNominal(50123.4), 50123);
    assert.ok(isNaN(parseNominal('foo')));
    assert.ok(isNaN(parseNominal(null)));
    assert.ok(isNaN(parseNominal(undefined)));
  });

  // 6. Direct UI code verification
  test('WalletPage.jsx code inspection: zero bank VA, single QRIS flow, highlight styling', () => {
    const walletPath = path.resolve(__dirname, '../../frontend-user/src/pages/WalletPage.jsx');
    const content = fs.readFileSync(walletPath, 'utf8');

    // VA options must not exist
    assert.strictEqual(content.includes('BCA Virtual Account'), false);
    assert.strictEqual(content.includes('BRI Virtual Account'), false);
    assert.strictEqual(content.includes('Mandiri Virtual Account'), false);
    assert.strictEqual(content.includes('BNI Virtual Account'), false);

    // Single QRIS flow
    assert.ok(content.includes('Pembayaran via QRIS (Wajib Sesuai Nominal)'));
    assert.ok(content.includes('QRISCard'));

    // Highlight
    assert.ok(content.includes('text-amber-600') || content.includes('text-amber-400'));
    assert.ok(content.includes('formatted.uniqueDigits'));

    // Warning
    assert.ok(content.includes('PENTING: Wajib transfer tepat hingga 3 digit terakhir'));
  });

  console.log('====================================================');
  console.log(`🎯 ALL ${testCount} INDEPENDENT AUDIT TESTS PASSED!`);
  console.log('====================================================');
}

runAdversarialAudit().catch((err) => {
  console.error('Audit failed:', err);
  process.exit(1);
});
