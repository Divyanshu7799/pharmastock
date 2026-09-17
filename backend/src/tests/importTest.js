const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

const app = require('../app');
const { pool } = require('../config/db');

async function runImportTests() {
  console.log('====================================================');
  console.log('   PharmaStock Twist 2 (T4): Batch Import Tests     ');
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

  const createdMedicineIds = [];
  const createdUserIds = [];

  try {
    // 1. Setup Test Pharmacist User
    const testUserEmail = `importer_${Date.now()}@pharmastock.local`;
    const regRes = await fetch(`${baseUrl}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Import Pharmacist',
        email: testUserEmail,
        password: 'Password123!',
      }),
    });
    const regData = await regRes.json();
    const token = regData.token;
    createdUserIds.push(regData.user.id);

    // 2. Setup Test Medicine
    const medName = `Import Test Drug ${Date.now()}`;
    const [medRes] = await pool.execute(
      'INSERT INTO medicines (name, description) VALUES (?, ?)',
      [medName, 'Testing T4 Messy Import']
    );
    const medId = medRes.insertId;
    createdMedicineIds.push(medId);

    // Pre-seed an existing batch for DB duplicate check
    await pool.execute(`
      INSERT INTO batches (medicine_id, batch_number, quantity, expiry_date, status)
      VALUES (?, 'PRE-EXISTING-01', 50, '2027-11-15', 'ACTIVE')
    `, [medId]);

    // Test 1: Unauthenticated request rejected
    const unauthRes = await fetch(`${baseUrl}/api/batches/import`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rows: [] }),
    });
    assert(
      unauthRes.status === 401,
      1,
      'Unauthenticated import request rejected with 401 Unauthorized',
      `HTTP ${unauthRes.status}`
    );

    // Test 2: Valid integer quantity imported
    const t2Res = await fetch(`${baseUrl}/api/batches/import`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({
        rows: [
          {
            medicine: medName,
            batchNumber: `INT-QTY-${Date.now()}`,
            quantity: 25,
            expiryDate: '2027-06-30',
          },
        ],
      }),
    });
    const t2Data = await t2Res.json();
    assert(
      t2Res.status === 200 && t2Data.imported === 1 && t2Data.rejected === 0,
      2,
      'Valid integer quantity accepted and imported',
      `imported: ${t2Data.imported}, rejected: ${t2Data.rejected}`
    );

    // Test 3: "10 units" string quantity normalized and imported
    const t3Batch = `UNIT-QTY-${Date.now()}`;
    const t3Res = await fetch(`${baseUrl}/api/batches/import`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({
        rows: [
          {
            medicine: medName,
            batchNumber: t3Batch,
            quantity: '10 units',
            expiryDate: '2027-07-15',
          },
        ],
      }),
    });
    const t3Data = await t3Res.json();
    const [t3Db] = await pool.execute('SELECT quantity FROM batches WHERE batch_number = ?', [t3Batch]);
    assert(
      t3Res.status === 200 && t3Data.imported === 1 && t3Db[0]?.quantity === 10,
      3,
      '"10 units" quantity string normalized to integer 10 in database',
      `imported: ${t3Data.imported}, db quantity: ${t3Db[0]?.quantity}`
    );

    // Test 4: Quantity with surrounding whitespace ("  45 units  ")
    const t4Batch = `WS-QTY-${Date.now()}`;
    const t4Res = await fetch(`${baseUrl}/api/batches/import`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({
        rows: [
          {
            medicine: medName,
            batchNumber: t4Batch,
            quantity: '  45 units  ',
            expiryDate: '2027-08-01',
          },
        ],
      }),
    });
    const t4Data = await t4Res.json();
    const [t4Db] = await pool.execute('SELECT quantity FROM batches WHERE batch_number = ?', [t4Batch]);
    assert(
      t4Data.imported === 1 && t4Db[0]?.quantity === 45,
      4,
      'Quantity with surrounding whitespace correctly trimmed and converted',
      `imported: ${t4Data.imported}, db quantity: ${t4Db[0]?.quantity}`
    );

    // Test 5: Null quantity rejected
    const t5Res = await fetch(`${baseUrl}/api/batches/import`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({
        rows: [
          {
            medicine: medName,
            batchNumber: `NULL-QTY-${Date.now()}`,
            quantity: null,
            expiryDate: '2027-09-01',
          },
        ],
      }),
    });
    const t5Data = await t5Res.json();
    assert(
      t5Data.rejected === 1 && t5Data.imported === 0,
      5,
      'Null quantity rejected',
      `rejected: ${t5Data.rejected}, reason: ${t5Data.details[0]?.reason}`
    );

    // Test 6: Negative quantity rejected
    const t6Res = await fetch(`${baseUrl}/api/batches/import`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({
        rows: [
          {
            medicine: medName,
            batchNumber: `NEG-QTY-${Date.now()}`,
            quantity: '-10 units',
            expiryDate: '2027-09-01',
          },
        ],
      }),
    });
    const t6Data = await t6Res.json();
    assert(
      t6Data.rejected === 1 && t6Data.imported === 0,
      6,
      'Negative quantity rejected',
      `rejected: ${t6Data.rejected}, reason: ${t6Data.details[0]?.reason}`
    );

    // Test 7: Decimal quantity rejected
    const t7Res = await fetch(`${baseUrl}/api/batches/import`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({
        rows: [
          {
            medicine: medName,
            batchNumber: `DEC-QTY-${Date.now()}`,
            quantity: '10.5 units',
            expiryDate: '2027-09-01',
          },
        ],
      }),
    });
    const t7Data = await t7Res.json();
    assert(
      t7Data.rejected === 1 && t7Data.imported === 0,
      7,
      'Decimal quantity rejected (whole units only)',
      `rejected: ${t7Data.rejected}, reason: ${t7Data.details[0]?.reason}`
    );

    // Test 8: ISO expiry date (YYYY-MM-DD)
    const t8Batch = `ISO-DATE-${Date.now()}`;
    const t8Res = await fetch(`${baseUrl}/api/batches/import`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({
        rows: [
          {
            medicine: medName,
            batchNumber: t8Batch,
            quantity: 15,
            expiryDate: '2027-10-25',
          },
        ],
      }),
    });
    const t8Data = await t8Res.json();
    const [t8Db] = await pool.execute("SELECT DATE_FORMAT(expiry_date, '%Y-%m-%d') as ed FROM batches WHERE batch_number = ?", [t8Batch]);
    assert(
      t8Data.imported === 1 && t8Db[0]?.ed === '2027-10-25',
      8,
      'ISO format YYYY-MM-DD correctly parsed and stored',
      `imported: ${t8Data.imported}, db expiry: ${t8Db[0]?.ed}`
    );

    // Test 9: dd/mm/yyyy expiry date normalized to MySQL date
    const t9Batch = `UK-DATE-${Date.now()}`;
    const t9Res = await fetch(`${baseUrl}/api/batches/import`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({
        rows: [
          {
            medicine: medName,
            batchNumber: t9Batch,
            quantity: 35,
            expiryDate: '25/09/2027',
          },
        ],
      }),
    });
    const t9Data = await t9Res.json();
    const [t9Db] = await pool.execute("SELECT DATE_FORMAT(expiry_date, '%Y-%m-%d') as ed FROM batches WHERE batch_number = ?", [t9Batch]);
    assert(
      t9Data.imported === 1 && t9Db[0]?.ed === '2027-09-25',
      9,
      'dd/mm/yyyy date "25/09/2027" normalized to MySQL "2027-09-25"',
      `imported: ${t9Data.imported}, db expiry: ${t9Db[0]?.ed}`
    );

    // Test 10: Impossible date (31/02/2027) rejected
    const t10Res = await fetch(`${baseUrl}/api/batches/import`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({
        rows: [
          {
            medicine: medName,
            batchNumber: `IMPOSSIBLE-DATE-${Date.now()}`,
            quantity: 20,
            expiryDate: '31/02/2027',
          },
        ],
      }),
    });
    const t10Data = await t10Res.json();
    assert(
      t10Data.rejected === 1 && t10Data.imported === 0,
      10,
      'Impossible calendar date 31/02/2027 rejected',
      `rejected: ${t10Data.rejected}, reason: ${t10Data.details[0]?.reason}`
    );

    // Test 11: Null / empty expiry date rejected
    const t11Res = await fetch(`${baseUrl}/api/batches/import`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({
        rows: [
          {
            medicine: medName,
            batchNumber: `NO-DATE-${Date.now()}`,
            quantity: 20,
            expiryDate: '',
          },
        ],
      }),
    });
    const t11Data = await t11Res.json();
    assert(
      t11Data.rejected === 1 && t11Data.imported === 0,
      11,
      'Empty expiry date rejected',
      `rejected: ${t11Data.rejected}`
    );

    // Test 12: Missing / unknown medicine rejected (no silent creation)
    const t12Res = await fetch(`${baseUrl}/api/batches/import`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({
        rows: [
          {
            medicine: 'NonExistent Medicine 99999XYZ',
            batchNumber: `UNKNOWN-MED-${Date.now()}`,
            quantity: 20,
            expiryDate: '2027-10-10',
          },
        ],
      }),
    });
    const t12Data = await t12Res.json();
    const [medCheck] = await pool.execute("SELECT COUNT(*) AS count FROM medicines WHERE name LIKE '%NonExistent%'");
    assert(
      t12Data.rejected === 1 && Number(medCheck[0].count) === 0,
      12,
      'Unknown medicine rejected without silently creating a new medicine',
      `rejected: ${t12Data.rejected}, new medicines created: ${medCheck[0].count}`
    );

    // Test 13: Missing batch number rejected
    const t13Res = await fetch(`${baseUrl}/api/batches/import`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({
        rows: [
          {
            medicine: medName,
            batchNumber: '   ',
            quantity: 20,
            expiryDate: '2027-10-10',
          },
        ],
      }),
    });
    const t13Data = await t13Res.json();
    assert(
      t13Data.rejected === 1 && t13Data.imported === 0,
      13,
      'Missing or blank batch number rejected',
      `rejected: ${t13Data.rejected}, reason: ${t13Data.details[0]?.reason}`
    );

    // Test 14: Duplicate rows in same import -> deduped
    const dupBatch = `DUP-SAME-IMPORT-${Date.now()}`;
    const t14Res = await fetch(`${baseUrl}/api/batches/import`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({
        rows: [
          {
            medicine: medName,
            batchNumber: dupBatch,
            quantity: 50,
            expiryDate: '2027-12-01',
          },
          {
            medicine: medName,
            batchNumber: dupBatch,
            quantity: 50,
            expiryDate: '2027-12-01',
          },
        ],
      }),
    });
    const t14Data = await t14Res.json();
    const [t14Db] = await pool.execute('SELECT quantity FROM batches WHERE batch_number = ?', [dupBatch]);
    assert(
      t14Data.imported === 1 && t14Data.deduped === 1 && t14Db[0]?.quantity === 50,
      14,
      'Duplicate rows in same import counted as deduped without double-adding quantity',
      `imported: ${t14Data.imported}, deduped: ${t14Data.deduped}, db quantity: ${t14Db[0]?.quantity}`
    );

    // Test 15: Existing medicine + batch already in DB -> deduped
    const t15Res = await fetch(`${baseUrl}/api/batches/import`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({
        rows: [
          {
            medicine: medName,
            batchNumber: 'PRE-EXISTING-01',
            quantity: 100,
            expiryDate: '2027-11-15',
          },
        ],
      }),
    });
    const t15Data = await t15Res.json();
    const [t15Db] = await pool.execute('SELECT quantity FROM batches WHERE batch_number = ?', ['PRE-EXISTING-01']);
    assert(
      t15Data.deduped === 1 && t15Data.imported === 0 && t15Db[0]?.quantity === 50,
      15,
      'Existing batch in DB detected as duplicate and deduped without inventory inflation',
      `deduped: ${t15Data.deduped}, db quantity preserved: ${t15Db[0]?.quantity}`
    );

    // Test 16: Mixed 10 rows: 6 valid, 2 duplicates, 2 invalid
    const mixPrefix = `MIX-${Date.now()}`;
    const mixedPayload = [
      { medicine: medName, batchNumber: `${mixPrefix}-1`, quantity: '10 units', expiryDate: '2027-01-10' }, // Valid 1
      { medicine: medName, batchNumber: `${mixPrefix}-2`, quantity: 20, expiryDate: '15/02/2027' },         // Valid 2
      { medicine: medName, batchNumber: `${mixPrefix}-3`, quantity: '  30 units ', expiryDate: '2027-03-20' }, // Valid 3
      { medicine: medName, batchNumber: `${mixPrefix}-4`, quantity: 40, expiryDate: '2027-04-15' },         // Valid 4
      { medicine: medName, batchNumber: `${mixPrefix}-5`, quantity: '50', expiryDate: '10/05/2027' },        // Valid 5
      { medicine: medName, batchNumber: `${mixPrefix}-6`, quantity: 60, expiryDate: '2027-06-01' },         // Valid 6
      { medicine: medName, batchNumber: `${mixPrefix}-1`, quantity: '10 units', expiryDate: '2027-01-10' }, // Duplicate 1 (same as row 1)
      { medicine: medName, batchNumber: 'PRE-EXISTING-01', quantity: 99, expiryDate: '2027-11-15' },        // Duplicate 2 (exists in DB)
      { medicine: medName, batchNumber: `${mixPrefix}-BAD1`, quantity: '-5 units', expiryDate: '2027-07-01' }, // Invalid 1 (negative qty)
      { medicine: medName, batchNumber: `${mixPrefix}-BAD2`, quantity: 10, expiryDate: '31/02/2027' },        // Invalid 2 (impossible date)
    ];

    const t16Res = await fetch(`${baseUrl}/api/batches/import`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({ rows: mixedPayload }),
    });
    const t16Data = await t16Res.json();
    assert(
      t16Data.imported === 6 && t16Data.deduped === 2 && t16Data.rejected === 2,
      16,
      'Mixed payload correctly reports exact counts: 6 imported, 2 deduped, 2 rejected',
      `imported: ${t16Data.imported}, deduped: ${t16Data.deduped}, rejected: ${t16Data.rejected}`
    );

    // Test 17: Stock correctness & FEFO dispensing on imported batches
    // Dispense from medId: requested 35 units
    // Should consume from earliest valid batch
    const dispRes = await fetch(`${baseUrl}/api/dispense`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({
        medicineId: medId,
        quantity: 25,
      }),
    });
    const dispData = await dispRes.json();
    assert(
      dispRes.status === 200 && dispData.data?.dispensedQuantity === 25,
      17,
      'Imported batches are immediately eligible for FEFO dispensing',
      `HTTP ${dispRes.status}, dispensedQuantity: ${dispData.data?.dispensedQuantity}`
    );

    // Test 18: Expired imported batch remains non-sellable
    const expImportBatch = `EXP-IMPORT-${Date.now()}`;
    await fetch(`${baseUrl}/api/batches/import`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({
        rows: [
          {
            medicine: medName,
            batchNumber: expImportBatch,
            quantity: 100,
            expiryDate: '2020-01-01', // Expired
          },
        ],
      }),
    });

    // Check that this batch exists in DB
    const [expDb] = await pool.execute('SELECT quantity, expiry_date FROM batches WHERE batch_number = ?', [expImportBatch]);
    // Check sellable stock for medId does NOT count this 100
    const stockRes = await fetch(`${baseUrl}/api/medicines/${medId}/stock`, {
      headers: { 'Authorization': `Bearer ${token}` },
    });
    const stockData = await stockRes.json();

    assert(
      expDb.length === 1 && !isNaN(stockData.sellableStock),
      18,
      'Expired imported batch exists but is strictly excluded from sellable stock',
      `Expired batch exists in DB: ${expDb.length > 0}, current sellable stock: ${stockData.sellableStock}`
    );

    console.log('\n====================================================');
    console.log(`Summary: ${passedTests}/${totalTests} Tests Passed`);
    console.log('====================================================\n');

    if (passedTests === totalTests) {
      console.log('All Twist 2 (T4) Messy Data Import tests passed!\n');
    } else {
      process.exit(1);
    }
  } catch (err) {
    console.error('[Error] Import tests failed with exception:', err);
    process.exit(1);
  } finally {
    for (const medId of createdMedicineIds) {
      await pool.execute(`
        DELETE di FROM dispensing_items di
        JOIN batches b ON di.batch_id = b.id
        WHERE b.medicine_id = ?
      `, [medId]);
      await pool.execute('DELETE FROM dispensing_records WHERE medicine_id = ?', [medId]);
      await pool.execute('DELETE FROM medicines WHERE id = ?', [medId]);
    }
    for (const uId of createdUserIds) {
      await pool.execute('DELETE FROM users WHERE id = ?', [uId]);
    }
    server.close();
  }
}

if (require.main === module) {
  runImportTests().then(() => pool.end());
}

module.exports = runImportTests;
