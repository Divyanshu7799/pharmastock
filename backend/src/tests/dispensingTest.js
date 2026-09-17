const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

const app = require('../app');
const { pool } = require('../config/db');

async function runDispensingTests() {
  console.log('====================================================');
  console.log('    PharmaStock Step 4: Dispensing Test Suite       ');
  console.log('====================================================\n');

  const server = app.listen(0);
  const port = server.address().port;
  const baseUrl = `http://localhost:${port}`;

  let passedTests = 0;
  let totalTests = 0;

  function assert(condition, testNumber, testName, details = '') {
    totalTests++;
    if (condition) {
      console.log(`[PASS] Test #${testNumber}: ${testName}`);
      if (details) console.log(`       ↳ ${details}`);
      passedTests++;
    } else {
      console.error(`[FAIL] Test #${testNumber}: ${testName}`);
      if (details) console.error(`       ↳ ${details}`);
    }
  }

  // Tracking created IDs for teardown
  const createdMedicineIds = [];
  const createdUserIds = [];

  try {
    // 1. Setup Test User
    const testUserEmail = `dispenser_${Date.now()}@pharmastock.local`;
    const regRes = await fetch(`${baseUrl}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Chief Dispenser',
        email: testUserEmail,
        password: 'Password123!',
      }),
    });
    const regData = await regRes.json();
    const authToken = regData.token;
    const testUserId = regData.user.id;
    createdUserIds.push(testUserId);

    const authHeaders = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${authToken}`,
    };

    // Helper to create test medicine
    async function createTestMed(name) {
      const [res] = await pool.execute('INSERT INTO medicines (name, description) VALUES (?, ?)', [
        `${name} ${Date.now()}_${Math.random().toString(36).substring(7)}`,
        'Test medicine fixture for dispensing edge cases',
      ]);
      createdMedicineIds.push(res.insertId);
      return res.insertId;
    }

    // Helper to create test batch
    async function createTestBatch(medId, batchNumber, qty, expiryDateExpr) {
      const query = `
        INSERT INTO batches (medicine_id, batch_number, quantity, expiry_date)
        VALUES (?, ?, ?, ${expiryDateExpr})
      `;
      const [res] = await pool.execute(query, [medId, batchNumber, qty]);
      return res.insertId;
    }

    // Helper to query batch qty
    async function getBatchQty(batchId) {
      const [rows] = await pool.execute('SELECT quantity FROM batches WHERE id = ?', [batchId]);
      return Number(rows[0].quantity);
    }

    // Helper to query sellable stock via API
    async function getApiStock(medId) {
      const res = await fetch(`${baseUrl}/api/medicines/${medId}/stock`, { headers: authHeaders });
      const data = await res.json();
      return data.sellableStock;
    }

    // ----------------------------------------------------
    // TEST 1: Single valid batch with sufficient quantity
    // batch = 100, request = 40 => batch = 60, dispensed = 40
    // ----------------------------------------------------
    const med1 = await createTestMed('T1_Med');
    const b1 = await createTestBatch(med1, 'T1_B1', 100, 'DATE_ADD(CURDATE(), INTERVAL 60 DAY)');

    const t1Res = await fetch(`${baseUrl}/api/dispense`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({ medicineId: med1, quantity: 40 }),
    });
    const t1Data = await t1Res.json();
    const b1Remaining = await getBatchQty(b1);

    assert(
      t1Res.status === 200 &&
      t1Data.data?.dispensedQuantity === 40 &&
      b1Remaining === 60,
      1,
      'Single valid batch with sufficient quantity (100 - 40 = 60)',
      `Dispensed: ${t1Data.data?.dispensedQuantity}, Batch remaining: ${b1Remaining}`
    );

    // ----------------------------------------------------
    // TEST 2: Exact quantity
    // batch = 100, request = 100 => batch = 0
    // ----------------------------------------------------
    const med2 = await createTestMed('T2_Med');
    const b2 = await createTestBatch(med2, 'T2_B1', 100, 'DATE_ADD(CURDATE(), INTERVAL 60 DAY)');

    const t2Res = await fetch(`${baseUrl}/api/dispense`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({ medicineId: med2, quantity: 100 }),
    });
    const t2Data = await t2Res.json();
    const b2Remaining = await getBatchQty(b2);

    assert(
      t2Res.status === 200 &&
      t2Data.data?.dispensedQuantity === 100 &&
      b2Remaining === 0,
      2,
      'Exact quantity dispensing reduces batch to exactly 0',
      `Dispensed: ${t2Data.data?.dispensedQuantity}, Batch remaining: ${b2Remaining}`
    );

    // ----------------------------------------------------
    // TEST 3: Multiple batches
    // P001 = 100 (expires earlier), P002 = 50 (expires later), request = 120
    // Expected: P001 -> 100 consumed (0 left), P002 -> 20 consumed (30 left)
    // ----------------------------------------------------
    const med3 = await createTestMed('T3_Med');
    const b3_1 = await createTestBatch(med3, 'T3_P001', 100, 'DATE_ADD(CURDATE(), INTERVAL 30 DAY)');
    const b3_2 = await createTestBatch(med3, 'T3_P002', 50, 'DATE_ADD(CURDATE(), INTERVAL 90 DAY)');

    const t3Res = await fetch(`${baseUrl}/api/dispense`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({ medicineId: med3, quantity: 120 }),
    });
    const t3Data = await t3Res.json();
    const b3_1_rem = await getBatchQty(b3_1);
    const b3_2_rem = await getBatchQty(b3_2);

    assert(
      t3Res.status === 200 &&
      t3Data.data?.dispensedQuantity === 120 &&
      b3_1_rem === 0 &&
      b3_2_rem === 30 &&
      t3Data.data.items.length === 2 &&
      t3Data.data.items[0].quantityDispensed === 100 &&
      t3Data.data.items[1].quantityDispensed === 20,
      3,
      'Multiple batches consumed sequentially across expiry dates',
      `P001 left: ${b3_1_rem}, P002 left: ${b3_2_rem}`
    );

    // ----------------------------------------------------
    // TEST 4: Expired batch comes first chronologically (MANDATORY)
    // P000 = 100 (EXPIRED), P001 = 100 (VALID), request = 50
    // Expected: P000 remains 100 unchanged, P001 -> 50 consumed (50 left)
    // ----------------------------------------------------
    const med4 = await createTestMed('T4_Med');
    const b4_exp = await createTestBatch(med4, 'T4_P000', 100, 'DATE_SUB(CURDATE(), INTERVAL 30 DAY)');
    const b4_val = await createTestBatch(med4, 'T4_P001', 100, 'DATE_ADD(CURDATE(), INTERVAL 60 DAY)');

    const t4Res = await fetch(`${baseUrl}/api/dispense`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({ medicineId: med4, quantity: 50 }),
    });
    const t4Data = await t4Res.json();
    const b4_exp_rem = await getBatchQty(b4_exp);
    const b4_val_rem = await getBatchQty(b4_val);

    assert(
      t4Res.status === 200 &&
      b4_exp_rem === 100 &&
      b4_val_rem === 50 &&
      t4Data.data.items.length === 1 &&
      t4Data.data.items[0].batchNumber === 'T4_P001',
      4,
      'Expired batch comes first chronologically; skipped and remains unchanged',
      `P000 (expired) remained: ${b4_exp_rem}, P001 (valid) remaining: ${b4_val_rem}`
    );

    // ----------------------------------------------------
    // TEST 5: Only expired stock
    // P000 = 100 (expired), request = 20
    // Expected: rejected with 400, available = 0, P000 unchanged
    // ----------------------------------------------------
    const med5 = await createTestMed('T5_Med');
    const b5_exp = await createTestBatch(med5, 'T5_P000', 100, 'DATE_SUB(CURDATE(), INTERVAL 45 DAY)');

    const t5Res = await fetch(`${baseUrl}/api/dispense`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({ medicineId: med5, quantity: 20 }),
    });
    const t5Data = await t5Res.json();
    const b5_exp_rem = await getBatchQty(b5_exp);

    assert(
      t5Res.status === 400 &&
      t5Data.availableQuantity === 0 &&
      t5Data.requestedQuantity === 20 &&
      b5_exp_rem === 100,
      5,
      'Medicine with only expired stock rejected; available = 0, stock unchanged',
      `HTTP ${t5Res.status}, availableQuantity: ${t5Data.availableQuantity}, stock untouched: ${b5_exp_rem}`
    );

    // ----------------------------------------------------
    // TEST 6: Zero-quantity batch before valid batch
    // P000 = 0 (valid expiry), P001 = 100 (valid expiry), request = 20
    // Expected: P000 unchanged (0), P001 -> 80
    // ----------------------------------------------------
    const med6 = await createTestMed('T6_Med');
    const b6_zero = await createTestBatch(med6, 'T6_P000', 0, 'DATE_ADD(CURDATE(), INTERVAL 15 DAY)');
    const b6_val = await createTestBatch(med6, 'T6_P001', 100, 'DATE_ADD(CURDATE(), INTERVAL 45 DAY)');

    const t6Res = await fetch(`${baseUrl}/api/dispense`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({ medicineId: med6, quantity: 20 }),
    });
    const t6Data = await t6Res.json();
    const b6_zero_rem = await getBatchQty(b6_zero);
    const b6_val_rem = await getBatchQty(b6_val);

    assert(
      t6Res.status === 200 &&
      b6_zero_rem === 0 &&
      b6_val_rem === 80 &&
      t6Data.data.items[0].batchNumber === 'T6_P001',
      6,
      'Zero-quantity batch ignored, consumption begins at next valid batch',
      `Zero-batch: ${b6_zero_rem}, Valid batch left: ${b6_val_rem}`
    );

    // ----------------------------------------------------
    // TEST 7: Insufficient total stock (Atomicity check)
    // P001 = 20, P002 = 30, request = 100
    // Expected: rejected with 400, P001 remains 20, P002 remains 30, NO record created
    // ----------------------------------------------------
    const med7 = await createTestMed('T7_Med');
    const b7_1 = await createTestBatch(med7, 'T7_P001', 20, 'DATE_ADD(CURDATE(), INTERVAL 30 DAY)');
    const b7_2 = await createTestBatch(med7, 'T7_P002', 30, 'DATE_ADD(CURDATE(), INTERVAL 60 DAY)');

    const [recsBefore] = await pool.execute('SELECT COUNT(*) AS c FROM dispensing_records WHERE medicine_id = ?', [med7]);
    const t7Res = await fetch(`${baseUrl}/api/dispense`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({ medicineId: med7, quantity: 100 }),
    });
    const t7Data = await t7Res.json();
    const [recsAfter] = await pool.execute('SELECT COUNT(*) AS c FROM dispensing_records WHERE medicine_id = ?', [med7]);
    const b7_1_rem = await getBatchQty(b7_1);
    const b7_2_rem = await getBatchQty(b7_2);

    assert(
      t7Res.status === 400 &&
      t7Data.availableQuantity === 50 &&
      t7Data.requestedQuantity === 100 &&
      b7_1_rem === 20 &&
      b7_2_rem === 30 &&
      recsBefore[0].c === recsAfter[0].c,
      7,
      'Insufficient total stock rolls back atomically; inventory and records untouched',
      `P001: ${b7_1_rem}, P002: ${b7_2_rem}, new records: ${recsAfter[0].c - recsBefore[0].c}`
    );

    // ----------------------------------------------------
    // TEST 8: Invalid quantity = 0 -> 400
    // ----------------------------------------------------
    const t8Res = await fetch(`${baseUrl}/api/dispense`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({ medicineId: med1, quantity: 0 }),
    });
    assert(t8Res.status === 400, 8, 'Quantity = 0 rejected with 400 Bad Request', `HTTP ${t8Res.status}`);

    // ----------------------------------------------------
    // TEST 9: Negative quantity -> 400
    // ----------------------------------------------------
    const t9Res = await fetch(`${baseUrl}/api/dispense`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({ medicineId: med1, quantity: -10 }),
    });
    assert(t9Res.status === 400, 9, 'Negative quantity rejected with 400 Bad Request', `HTTP ${t9Res.status}`);

    // ----------------------------------------------------
    // TEST 10: Non-integer quantity -> 400
    // ----------------------------------------------------
    const t10Res = await fetch(`${baseUrl}/api/dispense`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({ medicineId: med1, quantity: 12.5 }),
    });
    assert(t10Res.status === 400, 10, 'Non-integer quantity rejected with 400 Bad Request', `HTTP ${t10Res.status}`);

    // ----------------------------------------------------
    // TEST 11: Non-existent medicine -> 404
    // ----------------------------------------------------
    const t11Res = await fetch(`${baseUrl}/api/dispense`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({ medicineId: 9999999, quantity: 10 }),
    });
    assert(t11Res.status === 404, 11, 'Non-existent medicine returns 404 Not Found', `HTTP ${t11Res.status}`);

    // ----------------------------------------------------
    // TEST 12: Unauthenticated request -> 401
    // ----------------------------------------------------
    const t12Res = await fetch(`${baseUrl}/api/dispense`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ medicineId: med1, quantity: 10 }),
    });
    assert(t12Res.status === 401, 12, 'Unauthenticated dispense request returns 401 Unauthorized', `HTTP ${t12Res.status}`);

    // ----------------------------------------------------
    // TEST 13: Same expiry date -> lower batch ID consumed first
    // P001 = 50, P002 = 50 (same expiry date), request = 30
    // Expected: lower ID (P001) is consumed first
    // ----------------------------------------------------
    const med13 = await createTestMed('T13_Med');
    const b13_1 = await createTestBatch(med13, 'T13_P001', 50, 'DATE_ADD(CURDATE(), INTERVAL 120 DAY)');
    const b13_2 = await createTestBatch(med13, 'T13_P002', 50, 'DATE_ADD(CURDATE(), INTERVAL 120 DAY)');

    const t13Res = await fetch(`${baseUrl}/api/dispense`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({ medicineId: med13, quantity: 30 }),
    });
    const t13Data = await t13Res.json();
    const b13_1_rem = await getBatchQty(b13_1);
    const b13_2_rem = await getBatchQty(b13_2);

    assert(
      t13Res.status === 200 &&
      t13Data.data.items[0].batchId === b13_1 &&
      b13_1_rem === 20 &&
      b13_2_rem === 50,
      13,
      'Same expiry date resolves deterministically by lower id ASC',
      `Lower ID ${b13_1} consumed 30 (left ${b13_1_rem}), higher ID ${b13_2} untouched (${b13_2_rem})`
    );

    // ----------------------------------------------------
    // TEST 14: Successful transaction creates correct dispensing history
    // Verify dispensing_records & dispensing_items and GET /api/dispensing/:id
    // ----------------------------------------------------
    const lastDispensingId = t13Data.data.dispensingId;
    const historyItemRes = await fetch(`${baseUrl}/api/dispensing/${lastDispensingId}`, { headers: authHeaders });
    const historyItemData = await historyItemRes.json();

    const historyListRes = await fetch(`${baseUrl}/api/dispensing?page=1&limit=10`, { headers: authHeaders });
    const historyListData = await historyListRes.json();

    assert(
      historyItemRes.status === 200 &&
      historyItemData.id === lastDispensingId &&
      historyItemData.requestedQuantity === 30 &&
      historyItemData.items.length === 1 &&
      historyItemData.items[0].batchId === b13_1 &&
      historyListData.data.some(d => d.id === lastDispensingId),
      14,
      'Dispensing record and items correctly created and queried via history API',
      `Dispensing ID #${lastDispensingId} retrieved with ${historyItemData.items.length} item(s)`
    );

    // ----------------------------------------------------
    // TEST 15: Stock endpoint after dispensing
    // Verify sellable stock decreases exactly by dispensed quantity
    // ----------------------------------------------------
    const stockBefore = await getApiStock(med1);
    const t15Res = await fetch(`${baseUrl}/api/dispense`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({ medicineId: med1, quantity: 15 }),
    });
    const stockAfter = await getApiStock(med1);

    assert(
      t15Res.status === 200 &&
      stockAfter === stockBefore - 15,
      15,
      'Stock endpoint reflects exact decrement after dispensing',
      `Stock before: ${stockBefore}, Stock after: ${stockAfter} (delta = -15)`
    );

    // ----------------------------------------------------
    // TEST 16: Expired stock remains excluded after dispensing
    // In med4: we had 100 expired + 50 valid remaining.
    // Stock endpoint must show exactly 50 (ignoring the 100 expired).
    // Dispense 10 more valid -> stock must become 40.
    // ----------------------------------------------------
    const med4StockBefore = await getApiStock(med4);
    await fetch(`${baseUrl}/api/dispense`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({ medicineId: med4, quantity: 10 }),
    });
    const med4StockAfter = await getApiStock(med4);
    const b4_exp_final = await getBatchQty(b4_exp);

    assert(
      med4StockBefore === 50 &&
      med4StockAfter === 40 &&
      b4_exp_final === 100,
      16,
      'Expired stock remains strictly excluded before and after dispensing',
      `Stock before: ${med4StockBefore}, after: ${med4StockAfter}, expired batch qty untouched: ${b4_exp_final}`
    );

    // ==========================================
    // CLEANUP
    // ==========================================
    for (const mId of createdMedicineIds) {
      await pool.execute('DELETE di FROM dispensing_items di JOIN dispensing_records dr ON di.dispensing_record_id = dr.id WHERE dr.medicine_id = ?', [mId]);
      await pool.execute('DELETE FROM dispensing_records WHERE medicine_id = ?', [mId]);
      await pool.execute('DELETE FROM batches WHERE medicine_id = ?', [mId]);
      await pool.execute('DELETE FROM medicines WHERE id = ?', [mId]);
    }
    for (const uId of createdUserIds) {
      await pool.execute('DELETE di FROM dispensing_items di JOIN dispensing_records dr ON di.dispensing_record_id = dr.id WHERE dr.user_id = ?', [uId]);
      await pool.execute('DELETE FROM dispensing_records WHERE user_id = ?', [uId]);
      await pool.execute('DELETE FROM users WHERE id = ?', [uId]);
    }

    console.log('\n====================================================');
    console.log(`Summary: ${passedTests}/${totalTests} Tests Passed`);
    console.log('====================================================\n');

    if (passedTests === totalTests) {
      console.log('All 16 Step 4 transactional FEFO dispensing tests passed!\n');
    } else {
      process.exit(1);
    }
  } catch (err) {
    console.error('[Error] Dispensing test suite failed:', err);
    process.exit(1);
  } finally {
    server.close();
    await pool.end();
  }
}

if (require.main === module) {
  runDispensingTests();
}

module.exports = runDispensingTests;
