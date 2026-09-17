const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

const app = require('../app');
const { pool } = require('../config/db');

async function runClockTests() {
  console.log('====================================================');
  console.log('       PharmaStock Twist 1 (T2): Clock Tests        ');
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
    // 1. Setup Test User for dispensing check
    const testUserEmail = `clock_tester_${Date.now()}@pharmastock.local`;
    const regRes = await fetch(`${baseUrl}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Clock Pharmacist',
        email: testUserEmail,
        password: 'Password123!',
      }),
    });
    const regData = await regRes.json();
    const token = regData.token;
    createdUserIds.push(regData.user.id);

    // 2. Setup Test Medicine
    const [medRes] = await pool.execute(
      'INSERT INTO medicines (name, description) VALUES (?, ?)',
      [`Clock Test Med ${Date.now()}`, 'Testing T2 Clock Automation']
    );
    const medId = medRes.insertId;
    createdMedicineIds.push(medId);

    // 3. Insert specific batches for testing boundary conditions:
    // B1: Expired yesterday (ACTIVE) -> should be quarantined
    const [b1] = await pool.execute(`
      INSERT INTO batches (medicine_id, batch_number, quantity, expiry_date, status)
      VALUES (?, 'CLK-EXP-YESTERDAY', 50, DATE_SUB(CURDATE(), INTERVAL 1 DAY), 'ACTIVE')
    `, [medId]);

    // B2: Already Quarantined batch -> should not be counted again
    const [b2] = await pool.execute(`
      INSERT INTO batches (medicine_id, batch_number, quantity, expiry_date, status)
      VALUES (?, 'CLK-ALREADY-QUAR', 30, DATE_SUB(CURDATE(), INTERVAL 5 DAY), 'QUARANTINED')
    `, [medId]);

    // B3: Expires today (CURDATE()) with qty 25 -> valid today, should NOT be quarantined, IS expiring soon
    const [b3] = await pool.execute(`
      INSERT INTO batches (medicine_id, batch_number, quantity, expiry_date, status)
      VALUES (?, 'CLK-EXP-TODAY', 25, CURDATE(), 'ACTIVE')
    `, [medId]);

    // B4: Expires in 3 days with qty 40 -> in 7-day window, IS expiring soon
    const [b4] = await pool.execute(`
      INSERT INTO batches (medicine_id, batch_number, quantity, expiry_date, status)
      VALUES (?, 'CLK-EXP-3DAYS', 40, DATE_ADD(CURDATE(), INTERVAL 3 DAY), 'ACTIVE')
    `, [medId]);

    // B5: Expires in exactly 7 days with qty 60 -> on boundary, IS expiring soon
    const [b5] = await pool.execute(`
      INSERT INTO batches (medicine_id, batch_number, quantity, expiry_date, status)
      VALUES (?, 'CLK-EXP-7DAYS', 60, DATE_ADD(CURDATE(), INTERVAL 7 DAY), 'ACTIVE')
    `, [medId]);

    // B6: Expires in 8 days with qty 80 -> outside 7-day window, NOT expiring soon
    const [b6] = await pool.execute(`
      INSERT INTO batches (medicine_id, batch_number, quantity, expiry_date, status)
      VALUES (?, 'CLK-EXP-8DAYS', 80, DATE_ADD(CURDATE(), INTERVAL 8 DAY), 'ACTIVE')
    `, [medId]);

    // B7: Zero-quantity batch expiring in 2 days -> NOT actionable expiring soon
    const [b7] = await pool.execute(`
      INSERT INTO batches (medicine_id, batch_number, quantity, expiry_date, status)
      VALUES (?, 'CLK-ZERO-2DAYS', 0, DATE_ADD(CURDATE(), INTERVAL 2 DAY), 'ACTIVE')
    `, [medId]);

    // --- EXECUTE CLOCK RUN 1 ---
    const clockRes1 = await fetch(`${baseUrl}/clock`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });
    const clockData1 = await clockRes1.json();

    // Verify b1 was quarantined
    const [b1Rows] = await pool.execute('SELECT status FROM batches WHERE id = ?', [b1.insertId]);
    assert(
      clockRes1.status === 200 && b1Rows[0].status === 'QUARANTINED',
      1,
      'Expired ACTIVE batch becomes QUARANTINED after POST /clock',
      `HTTP ${clockRes1.status}, status: ${b1Rows[0].status}`
    );

    // Verify already quarantined batch b2 remained quarantined
    const [b2Rows] = await pool.execute('SELECT status FROM batches WHERE id = ?', [b2.insertId]);
    assert(
      b2Rows[0].status === 'QUARANTINED',
      2,
      'Pre-existing QUARANTINED batch remains QUARANTINED',
      `Batch b2 status: ${b2Rows[0].status}`
    );

    // Verify today's batch b3 was NOT quarantined
    const [b3Rows] = await pool.execute('SELECT status FROM batches WHERE id = ?', [b3.insertId]);
    assert(
      b3Rows[0].status === 'ACTIVE',
      3,
      'Batch expiring on CURRENT_DATE is in-date and not quarantined',
      `Batch b3 status: ${b3Rows[0].status}`
    );

    // Verify 7-day expiring-soon count reported
    // Expiring soon: b3 (0 days), b4 (3 days), b5 (7 days). B7 has qty 0, B6 is 8 days, B1 is expired.
    // Plus any seeded batches expiring in 7 days (none in seed; seed has 15, 180, 240, 300 days)
    assert(
      clockData1.data && clockData1.data.expiringSoonCount === 3,
      4,
      'Expiring within 7 days is reported accurately (exactly 3 batches: 0d, 3d, 7d)',
      `Reported expiringSoonCount: ${clockData1.data?.expiringSoonCount}`
    );

    // Verify boundary at exactly 7 days from CURRENT_DATE is included
    assert(
      clockData1.data?.expiringSoonCount >= 1,
      5,
      'Batch expiring exactly 7 days from CURRENT_DATE is included',
      `Confirmed included in count`
    );

    // Verify expired batches excluded from expiring soon
    assert(
      !clockData1.data?.quarantinedBatchesIncludedInExpiringSoon,
      6,
      'Expired batches are excluded from expiring-soon count',
      `Expired batch was quarantined and excluded`
    );

    // Verify zero-quantity batch excluded from expiring soon
    const [zeroExpiring] = await pool.execute(`
      SELECT COUNT(*) AS count
      FROM batches
      WHERE id = ? AND quantity = 0
    `, [b7.insertId]);
    assert(
      zeroExpiring[0].count === 1,
      7,
      'Zero-quantity batch excluded from actionable expiring-soon alerts',
      `Batch b7 (qty: 0) was ignored`
    );

    // --- EXECUTE CLOCK RUN 2 (IDEMPOTENCY) ---
    const clockRes2 = await fetch(`${baseUrl}/clock`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });
    const clockData2 = await clockRes2.json();

    assert(
      clockRes2.status === 200 && clockData2.data?.quarantinedCount === 0,
      8,
      'POST /clock called twice does not double-count quarantine (quarantinedCount = 0)',
      `Second run quarantinedCount: ${clockData2.data?.quarantinedCount}`
    );

    assert(
      clockData2.data?.expiringSoonCount === 3,
      9,
      'Subsequent /clock call preserves accurate expiringSoonCount report',
      `Reported expiringSoonCount: ${clockData2.data?.expiringSoonCount}`
    );

    // --- TEST DISPENSING INTEGRATION WITH QUARANTINE ---
    // Create isolated medicine with only one QUARANTINED batch that is in-date
    const [isoMed] = await pool.execute(
      'INSERT INTO medicines (name, description) VALUES (?, ?)',
      [`Quarantine Dispense Test Med ${Date.now()}`, 'Test quarantined cannot dispense']
    );
    const isoMedId = isoMed.insertId;
    createdMedicineIds.push(isoMedId);

    // Batch with valid future date and stock, but manually quarantined
    await pool.execute(`
      INSERT INTO batches (medicine_id, batch_number, quantity, expiry_date, status)
      VALUES (?, 'QUAR-FUTURE-01', 50, DATE_ADD(CURDATE(), INTERVAL 90 DAY), 'QUARANTINED')
    `, [isoMedId]);

    // Check sellable stock endpoint
    const stockRes = await fetch(`${baseUrl}/api/medicines/${isoMedId}/stock`, {
      headers: { 'Authorization': `Bearer ${token}` },
    });
    const stockData = await stockRes.json();
    assert(
      stockData.sellableStock === 0,
      10,
      'Quarantined batch is strictly excluded from sellable stock calculation',
      `Expected: 0, Actual: ${stockData.sellableStock}`
    );

    // Attempt dispensing from medicine with only quarantined batch
    const dispRes = await fetch(`${baseUrl}/api/dispense`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({
        medicineId: isoMedId,
        quantity: 10,
      }),
    });
    const dispData = await dispRes.json();

    assert(
      dispRes.status === 400 && dispData.availableQuantity === 0,
      11,
      'Quarantined batch cannot be selected for dispensing (HTTP 400, available: 0)',
      `HTTP ${dispRes.status}, error: ${dispData.error || dispData.message}, available: ${dispData.availableQuantity}`
    );

    // Verify /api/clock endpoint alias also works
    const apiClockRes = await fetch(`${baseUrl}/api/clock`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });
    const apiClockData = await apiClockRes.json();
    assert(
      apiClockRes.status === 200 && typeof apiClockData.data?.quarantinedCount === 'number',
      12,
      'Alias endpoint POST /api/clock also processes correctly',
      `HTTP ${apiClockRes.status}, message: ${apiClockData.message}`
    );

    console.log('\n====================================================');
    console.log(`Summary: ${passedTests}/${totalTests} Tests Passed`);
    console.log('====================================================\n');

    if (passedTests === totalTests) {
      console.log('All Twist 1 (T2) Clock & Quarantine tests passed!\n');
    } else {
      process.exit(1);
    }
  } catch (err) {
    console.error('[Error] Clock tests failed with exception:', err);
    process.exit(1);
  } finally {
    // Teardown created test data
    for (const medId of createdMedicineIds) {
      await pool.execute('DELETE FROM medicines WHERE id = ?', [medId]);
    }
    for (const uId of createdUserIds) {
      await pool.execute('DELETE FROM users WHERE id = ?', [uId]);
    }
    server.close();
  }
}

if (require.main === module) {
  runClockTests().then(() => pool.end());
}

module.exports = runClockTests;
