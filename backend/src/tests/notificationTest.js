const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

const app = require('../app');
const { pool } = require('../config/db');

async function runNotificationTests() {
  console.log('====================================================');
  console.log('  PharmaStock Level 3 (T1): Notification Outbox     ');
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
    const testUserEmail = `outbox_tester_${Date.now()}@pharmastock.local`;
    const regRes = await fetch(`${baseUrl}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Notification Pharmacist',
        email: testUserEmail,
        password: 'Password123!',
      }),
    });
    const regData = await regRes.json();
    const token = regData.token;
    createdUserIds.push(regData.user.id);

    const authHeaders = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    };

    // Helper to get outbox count for a medicine
    async function getOutboxForMed(medId) {
      const res = await fetch(`${baseUrl}/outbox?medicineId=${medId}`);
      const data = await res.json();
      const list = Array.isArray(data) ? data : (data.data || data.notifications || []);
      return list;
    }

    // =========================================================================
    // TEST GROUP 1: Threshold Boundary Evaluation (Above, Equal, Below)
    // =========================================================================

    // Create medicine with reorder_threshold = 30
    const [m1Res] = await pool.execute(
      'INSERT INTO medicines (name, description, reorder_threshold) VALUES (?, ?, ?)',
      [`Threshold Test Med ${Date.now()}`, 'Testing above/equal/below triggers', 30]
    );
    const m1Id = m1Res.insertId;
    createdMedicineIds.push(m1Id);

    // Add batch with 100 units
    await pool.execute(`
      INSERT INTO batches (medicine_id, batch_number, quantity, expiry_date, status)
      VALUES (?, 'M1-B1', 100, DATE_ADD(CURDATE(), INTERVAL 90 DAY), 'ACTIVE')
    `, [m1Id]);

    // Test 1: Stock above threshold => NO alert
    // Initial 100, dispense 20 => remaining = 80 (> 30)
    const disp1Res = await fetch(`${baseUrl}/api/dispense`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({ medicineId: m1Id, quantity: 20 }),
    });
    const disp1Data = await disp1Res.json();
    const m1AlertsAfterT1 = await getOutboxForMed(m1Id);

    assert(
      disp1Res.status === 200 && m1AlertsAfterT1.length === 0,
      1,
      'Stock above threshold (80 > 30) does NOT create notification alert',
      `Dispensed: 20, remaining sellable: 80, alerts count: ${m1AlertsAfterT1.length}`
    );

    // Test 2: Stock exactly equal to threshold => NO alert
    // Remaining 80, dispense 50 => remaining = 30 (=== 30)
    const disp2Res = await fetch(`${baseUrl}/api/dispense`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({ medicineId: m1Id, quantity: 50 }),
    });
    const m1AlertsAfterT2 = await getOutboxForMed(m1Id);

    assert(
      disp2Res.status === 200 && m1AlertsAfterT2.length === 0,
      2,
      'Stock exactly equal to threshold (30 === 30) does NOT create notification alert',
      `Dispensed: 50, remaining sellable: 30, alerts count: ${m1AlertsAfterT2.length}`
    );

    // Test 3: Stock strictly below threshold => alert created in outbox
    // Remaining 30, dispense 5 => remaining = 25 (< 30)
    const disp3Res = await fetch(`${baseUrl}/api/dispense`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({ medicineId: m1Id, quantity: 5 }),
    });
    const m1AlertsAfterT3 = await getOutboxForMed(m1Id);

    assert(
      disp3Res.status === 200 && m1AlertsAfterT3.length === 1 && m1AlertsAfterT3[0].status === 'PENDING',
      3,
      'Stock strictly below threshold (25 < 30) creates PENDING reorder alert in outbox',
      `Alert ID: ${m1AlertsAfterT3[0]?.id}, status: ${m1AlertsAfterT3[0]?.status}, message: ${m1AlertsAfterT3[0]?.message}`
    );

    // =========================================================================
    // TEST GROUP 2: Duplicate Prevention Policy
    // =========================================================================

    // Test 4: Dispensing again when pending alert exists => NO duplicate alert
    // Remaining 25, dispense 5 => remaining = 20 (< 30)
    const disp4Res = await fetch(`${baseUrl}/api/dispense`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({ medicineId: m1Id, quantity: 5 }),
    });
    const m1AlertsAfterT4 = await getOutboxForMed(m1Id);

    assert(
      disp4Res.status === 200 && m1AlertsAfterT4.length === 1,
      4,
      'Duplicate pending alert is suppressed when pending alert already exists',
      `Alert count remains exactly 1 (no duplicate spam)`
    );

    // =========================================================================
    // TEST GROUP 3: Expired & Quarantined Stock Exclusion
    // =========================================================================

    // Medicine with threshold = 50
    // Valid batch: 40 units (expires in 60 days)
    // Expired batch: 100 units (expired 30 days ago)
    // Quarantined batch: 80 units (in-date but status = QUARANTINED)
    // Total on paper = 220, but sellable stock = only 40 (< 50)!
    const [m2Res] = await pool.execute(
      'INSERT INTO medicines (name, description, reorder_threshold) VALUES (?, ?, ?)',
      [`Exclusion Test Med ${Date.now()}`, 'Testing expired and quarantined stock exclusion', 50]
    );
    const m2Id = m2Res.insertId;
    createdMedicineIds.push(m2Id);

    await pool.execute(`
      INSERT INTO batches (medicine_id, batch_number, quantity, expiry_date, status)
      VALUES 
        (?, 'M2-VALID', 40, DATE_ADD(CURDATE(), INTERVAL 60 DAY), 'ACTIVE'),
        (?, 'M2-EXPIRED', 100, DATE_SUB(CURDATE(), INTERVAL 30 DAY), 'ACTIVE'),
        (?, 'M2-QUARANTINED', 80, DATE_ADD(CURDATE(), INTERVAL 60 DAY), 'QUARANTINED')
    `, [m2Id, m2Id, m2Id]);

    // Test 5: Expired & Quarantined stock excluded => sellable stock is below threshold, triggers alert
    // Dispense 5 units from valid batch => remaining sellable = 35 (< 50)
    const disp5Res = await fetch(`${baseUrl}/api/dispense`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({ medicineId: m2Id, quantity: 5 }),
    });
    const m2Alerts = await getOutboxForMed(m2Id);

    assert(
      disp5Res.status === 200 && m2Alerts.length === 1 && m2Alerts[0].payload?.currentSellableStock === 35,
      5,
      'Expired and Quarantined batches are strictly excluded from threshold check',
      `Sellable stock evaluated to 35 (ignoring 100 expired and 80 quarantined), alert created`
    );

    // =========================================================================
    // TEST GROUP 4: Transactional Rollback (Failed dispensing => no alert)
    // =========================================================================

    const [m3Res] = await pool.execute(
      'INSERT INTO medicines (name, description, reorder_threshold) VALUES (?, ?, ?)',
      [`Rollback Test Med ${Date.now()}`, 'Testing failed dispense creates no alert', 50]
    );
    const m3Id = m3Res.insertId;
    createdMedicineIds.push(m3Id);

    await pool.execute(`
      INSERT INTO batches (medicine_id, batch_number, quantity, expiry_date, status)
      VALUES (?, 'M3-B1', 20, DATE_ADD(CURDATE(), INTERVAL 90 DAY), 'ACTIVE')
    `, [m3Id]);

    // Test 6: Failed dispensing (requesting 50 when only 20 available) => NO alert in outbox
    const disp6Res = await fetch(`${baseUrl}/api/dispense`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({ medicineId: m3Id, quantity: 50 }),
    });
    const m3Alerts = await getOutboxForMed(m3Id);

    assert(
      disp6Res.status === 400 && m3Alerts.length === 0,
      6,
      'Failed / insufficient dispensing atomically rolls back; NEVER creates an alert',
      `HTTP ${disp6Res.status}, outbox alert count: ${m3Alerts.length}`
    );

    // =========================================================================
    // TEST GROUP 5: Multi-batch FEFO Dispensing Integration
    // =========================================================================

    const [m4Res] = await pool.execute(
      'INSERT INTO medicines (name, description, reorder_threshold) VALUES (?, ?, ?)',
      [`MultiBatch FEFO Med ${Date.now()}`, 'Testing multi-batch FEFO stock trigger', 30]
    );
    const m4Id = m4Res.insertId;
    createdMedicineIds.push(m4Id);

    await pool.execute(`
      INSERT INTO batches (medicine_id, batch_number, quantity, expiry_date, status)
      VALUES 
        (?, 'MB-EARLY', 20, DATE_ADD(CURDATE(), INTERVAL 20 DAY), 'ACTIVE'),
        (?, 'MB-LATER', 30, DATE_ADD(CURDATE(), INTERVAL 60 DAY), 'ACTIVE')
    `, [m4Id, m4Id]);

    // Test 7: Multi-batch FEFO consumption (dispense 30 consumes 20 of MB-EARLY and 10 of MB-LATER)
    // Remaining sellable stock = 20 (< 30) => triggers alert
    const disp7Res = await fetch(`${baseUrl}/api/dispense`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({ medicineId: m4Id, quantity: 30 }),
    });
    const m4Alerts = await getOutboxForMed(m4Id);

    assert(
      disp7Res.status === 200 && m4Alerts.length === 1 && m4Alerts[0].payload?.currentSellableStock === 20,
      7,
      'Multi-batch FEFO dispensing accurately calculates remaining stock (20) and triggers alert',
      `Dispensed across 2 batches, remaining sellable stock: 20, alert triggered`
    );

    // =========================================================================
    // TEST GROUP 6: GET /outbox Endpoint Verification
    // =========================================================================

    // Test 8: GET /outbox returns list with snake_case and camelCase compatibility
    const outboxRes = await fetch(`${baseUrl}/outbox`);
    const outboxData = await outboxRes.json();
    const allNotifications = Array.isArray(outboxData) ? outboxData : (outboxData.data || outboxData.notifications || []);

    const sample = allNotifications[0];
    assert(
      outboxRes.status === 200 &&
      allNotifications.length >= 3 &&
      Boolean(sample.medicine_id && sample.medicineId && sample.event_type && sample.status),
      8,
      'GET /outbox returns persisted notification records with compatible field mappings',
      `HTTP ${outboxRes.status}, count: ${allNotifications.length}, sample event: ${sample?.event_type}`
    );

    // Test 9: Alias GET /api/outbox also functions
    const apiOutboxRes = await fetch(`${baseUrl}/api/outbox`);
    const apiOutboxData = await apiOutboxRes.json();
    const apiList = Array.isArray(apiOutboxData) ? apiOutboxData : (apiOutboxData.data || []);
    assert(
      apiOutboxRes.status === 200 && apiList.length === allNotifications.length,
      9,
      'Alias endpoint GET /api/outbox returns identical records',
      `HTTP ${apiOutboxRes.status}, count: ${apiList.length}`
    );

    // =========================================================================
    // TEST GROUP 7: Medicine API Reorder Threshold Integration
    // =========================================================================

    // Test 10: Create medicine with custom reorderThreshold via POST /api/medicines
    const medPostRes = await fetch(`${baseUrl}/api/medicines`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        name: `Threshold API Med ${Date.now()}`,
        description: 'Created with custom threshold',
        reorderThreshold: 75,
      }),
    });
    const medPostData = await medPostRes.json();
    createdMedicineIds.push(medPostData.id);

    assert(
      medPostRes.status === 201 &&
      (medPostData.reorderThreshold === 75 || medPostData.reorder_threshold === 75),
      10,
      'POST /api/medicines accepts and persists custom reorderThreshold (75)',
      `Created ID ${medPostData.id}, reorderThreshold: ${medPostData.reorderThreshold}`
    );

    // Test 11: Update medicine threshold via PUT /api/medicines/:id
    const medPutRes = await fetch(`${baseUrl}/api/medicines/${medPostData.id}`, {
      method: 'PUT',
      headers: authHeaders,
      body: JSON.stringify({
        name: medPostData.name,
        reorderThreshold: 120,
      }),
    });
    const medPutData = await medPutRes.json();

    assert(
      medPutRes.status === 200 &&
      (medPutData.reorderThreshold === 120 || medPutData.reorder_threshold === 120),
      11,
      'PUT /api/medicines/:id updates reorderThreshold to 120',
      `Updated ID ${medPutData.id}, new threshold: ${medPutData.reorderThreshold}`
    );

    console.log('\n====================================================');
    console.log(`Summary: ${passedTests}/${totalTests} Tests Passed`);
    console.log('====================================================\n');

    if (passedTests === totalTests) {
      console.log('All Level 3 (T1) Notification & Reorder Threshold tests passed!\n');
    } else {
      process.exit(1);
    }
  } catch (err) {
    console.error('[Error] Notification tests failed with exception:', err);
    process.exit(1);
  } finally {
    // Teardown created test data
    for (const medId of createdMedicineIds) {
      await pool.execute('DELETE FROM outbox WHERE medicine_id = ?', [medId]);
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
  runNotificationTests().then(() => pool.end());
}

module.exports = runNotificationTests;
