const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

const app = require('../app');
const { pool } = require('../config/db');

async function runApiTests() {
  console.log('====================================================');
  console.log('       PharmaStock Step 3: API Test Suite           ');
  console.log('====================================================\n');

  // Start ephemeral server for testing
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

  try {
    let authToken = null;
    let createdMedicineId = null;
    const testUserEmail = `pharmacist_${Date.now()}@pharmastock.local`;
    const testPassword = 'Password123!';

    // ==========================================
    // PART 1: AUTHENTICATION (Tests 1 - 6)
    // ==========================================
    console.log('--- Group 1: Authentication Tests ---');

    // 1. Register succeeds
    const regRes = await fetch(`${baseUrl}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Sarah Pharmacist',
        email: testUserEmail,
        password: testPassword,
      }),
    });
    const regData = await regRes.json();
    assert(regRes.status === 201 && Boolean(regData.token) && regData.user?.email === testUserEmail,
      1, 'Register succeeds and returns JWT and user', `HTTP ${regRes.status}, token received`);
    authToken = regData.token;

    // 2. Duplicate email rejected
    const dupRes = await fetch(`${baseUrl}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Duplicate User',
        email: testUserEmail,
        password: testPassword,
      }),
    });
    const dupData = await dupRes.json();
    assert(dupRes.status === 409 && Boolean(dupData.error),
      2, 'Duplicate email registration rejected with 409 Conflict', `HTTP ${dupRes.status}: ${dupData.error}`);

    // 3. Login succeeds
    const loginRes = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: testUserEmail,
        password: testPassword,
      }),
    });
    const loginData = await loginRes.json();
    assert(loginRes.status === 200 && Boolean(loginData.token),
      3, 'Login succeeds with valid credentials', `HTTP ${loginRes.status}, token re-issued`);

    // 4. Wrong password rejected
    const wrongPassRes = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: testUserEmail,
        password: 'wrong_password_xyz',
      }),
    });
    const wrongPassData = await wrongPassRes.json();
    assert(wrongPassRes.status === 401 && Boolean(wrongPassData.error),
      4, 'Login with wrong password rejected with 401 Unauthorized', `HTTP ${wrongPassRes.status}: ${wrongPassData.error}`);

    // 5. Protected endpoint without token returns 401
    const noAuthRes = await fetch(`${baseUrl}/api/medicines`);
    const noAuthData = await noAuthRes.json();
    assert(noAuthRes.status === 401 && Boolean(noAuthData.error),
      5, 'Protected endpoint without token rejected with 401', `HTTP ${noAuthRes.status}: ${noAuthData.error}`);

    // 6. Protected endpoint with valid token works
    const authHeaders = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${authToken}`,
    };
    const validAuthRes = await fetch(`${baseUrl}/api/medicines`, { headers: authHeaders });
    assert(validAuthRes.status === 200,
      6, 'Protected endpoint with valid token succeeds', `HTTP ${validAuthRes.status}`);

    // ==========================================
    // PART 2: MEDICINES (Tests 7 - 13)
    // ==========================================
    console.log('\n--- Group 2: Medicine Management Tests ---');

    // 7. Create medicine
    const createMedRes = await fetch(`${baseUrl}/api/medicines`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        name: `  Azithromycin 500mg  `,
        description: 'Macrolide antibiotic',
      }),
    });
    const createMedData = await createMedRes.json();
    createdMedicineId = createMedData.id;
    assert(createMedRes.status === 201 && createMedData.name === 'Azithromycin 500mg',
      7, 'Create medicine trims whitespace and returns 201 Created', `Created ID ${createdMedicineId}, name: "${createMedData.name}"`);

    // 8. Retrieve medicine with batches and stock
    const getMedRes = await fetch(`${baseUrl}/api/medicines/1`, { headers: authHeaders });
    const getMedData = await getMedRes.json();
    assert(getMedRes.status === 200 && getMedData.id === 1 && Array.isArray(getMedData.batches) && getMedData.sellableStock === 250,
      8, 'Retrieve medicine returns batches and sellable stock', `Found: ${getMedData.name}, sellableStock: ${getMedData.sellableStock}, batches: ${getMedData.batches.length}`);

    // 9. Update medicine
    const updateMedRes = await fetch(`${baseUrl}/api/medicines/${createdMedicineId}`, {
      method: 'PUT',
      headers: authHeaders,
      body: JSON.stringify({
        name: 'Azithromycin 500mg Updated',
        description: 'Updated description',
      }),
    });
    const updateMedData = await updateMedRes.json();
    assert(updateMedRes.status === 200 && updateMedData.name === 'Azithromycin 500mg Updated',
      9, 'Update medicine updates name/description with 200 OK', `Updated name: "${updateMedData.name}"`);

    // 10. Search medicine (partial match case-insensitive)
    const searchRes = await fetch(`${baseUrl}/api/medicines?search=para`, { headers: authHeaders });
    const searchData = await searchRes.json();
    const hasParacetamol = searchData.data.some(m => m.name.toLowerCase().includes('paracetamol'));
    assert(searchRes.status === 200 && hasParacetamol,
      10, 'Search medicine supports case-insensitive partial match', `Found ${searchData.data.length} match(es) for 'para'`);

    // 11. Pagination works
    const pageRes = await fetch(`${baseUrl}/api/medicines?page=1&limit=2`, { headers: authHeaders });
    const pageData = await pageRes.json();
    assert(pageRes.status === 200 && pageData.data.length === 2 && pageData.pagination.limit === 2 && pageData.pagination.page === 1,
      11, 'Pagination returns correct slice and pagination metadata', `Limit: ${pageData.pagination.limit}, Total: ${pageData.pagination.total}, Pages: ${pageData.pagination.totalPages}`);

    // 12. Sorting works
    const sortRes = await fetch(`${baseUrl}/api/medicines?sortBy=name&order=desc`, { headers: authHeaders });
    const sortData = await sortRes.json();
    const isSortedDesc = sortData.data.length >= 2 && sortData.data[0].name.localeCompare(sortData.data[1].name) >= 0;
    assert(sortRes.status === 200 && isSortedDesc,
      12, 'Sorting by name DESC works', `First: "${sortData.data[0]?.name}", Second: "${sortData.data[1]?.name}"`);

    // 13. Invalid sort field is rejected with 400
    const badSortRes = await fetch(`${baseUrl}/api/medicines?sortBy=invalid_injection_attempt`, { headers: authHeaders });
    const badSortData = await badSortRes.json();
    assert(badSortRes.status === 400 && Boolean(badSortData.error),
      13, 'Invalid sort field rejected with 400 Bad Request', `HTTP ${badSortRes.status}: ${badSortData.error}`);

    // ==========================================
    // PART 3: BATCHES (Tests 14 - 18)
    // ==========================================
    console.log('\n--- Group 3: Batch Management Tests ---');

    // 14. Create batch
    const createBatchRes = await fetch(`${baseUrl}/api/medicines/${createdMedicineId}/batches`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        batchNumber: 'AZI-BATCH-01',
        quantity: 80,
        expiryDate: '2027-05-15',
      }),
    });
    const createBatchData = await createBatchRes.json();
    assert(createBatchRes.status === 201 && createBatchData.batchNumber === 'AZI-BATCH-01',
      14, 'Create batch creates new batch record with 201 Created', `Created batch ID: ${createBatchData.id}`);

    // 15. Duplicate batch rejected
    const dupBatchRes = await fetch(`${baseUrl}/api/medicines/${createdMedicineId}/batches`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        batchNumber: 'AZI-BATCH-01',
        quantity: 50,
        expiryDate: '2027-08-20',
      }),
    });
    const dupBatchData = await dupBatchRes.json();
    assert(dupBatchRes.status === 409 && Boolean(dupBatchData.error),
      15, 'Duplicate batch number for same medicine rejected with 409 Conflict', `HTTP ${dupBatchRes.status}: ${dupBatchData.error}`);

    // 16. Invalid negative quantity rejected
    const negQtyRes = await fetch(`${baseUrl}/api/medicines/${createdMedicineId}/batches`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        batchNumber: 'AZI-BATCH-NEG',
        quantity: -15,
        expiryDate: '2027-05-15',
      }),
    });
    const negQtyData = await negQtyRes.json();
    assert(negQtyRes.status === 400 && Boolean(negQtyData.error),
      16, 'Invalid negative quantity rejected with 400 Bad Request', `HTTP ${negQtyRes.status}: ${negQtyData.error}`);

    // 17. Invalid medicine rejected
    const badMedBatchRes = await fetch(`${baseUrl}/api/medicines/999999/batches`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        batchNumber: 'NON-EXISTENT',
        quantity: 10,
        expiryDate: '2027-05-15',
      }),
    });
    const badMedBatchData = await badMedBatchRes.json();
    assert(badMedBatchRes.status === 404 && Boolean(badMedBatchData.error),
      17, 'Batch creation for non-existent medicine rejected with 404 Not Found', `HTTP ${badMedBatchRes.status}: ${badMedBatchData.error}`);

    // 18. FEFO ordering remains expiry_date ASC then id ASC
    const fefoRes = await fetch(`${baseUrl}/api/medicines/1/batches`, { headers: authHeaders });
    const fefoBatches = await fefoRes.json();
    let isFefo = true;
    for (let i = 0; i < fefoBatches.length - 1; i++) {
      if (new Date(fefoBatches[i].expiryDate) > new Date(fefoBatches[i + 1].expiryDate)) {
        isFefo = false;
        break;
      }
    }
    assert(fefoRes.status === 200 && isFefo && fefoBatches.length === 3,
      18, 'Batches returned in strict FEFO order (expiry_date ASC, id ASC)',
      fefoBatches.map(b => `${b.batchNumber}: ${b.expiryDate}`).join(' -> '));

    // ==========================================
    // PART 4: STOCK CALCULATION (Tests 19 - 21)
    // ==========================================
    console.log('\n--- Group 4: Sellable Stock Logic Tests ---');

    // 19. Expired quantity excluded (Paracetamol ID 1 has 100 expired, 50 soon, 200 norm => 250)
    const stock1Res = await fetch(`${baseUrl}/api/medicines/1/stock`, { headers: authHeaders });
    const stock1Data = await stock1Res.json();
    assert(stock1Res.status === 200 && stock1Data.sellableStock === 250,
      19, 'Expired batch quantity is excluded from sellable stock', `Paracetamol sellableStock: ${stock1Data.sellableStock} (expected: 250)`);

    // 20. Zero quantity excluded (Cetirizine ID 3 has 100 + 75 + 0 => 175)
    const stock3Res = await fetch(`${baseUrl}/api/medicines/3/stock`, { headers: authHeaders });
    const stock3Data = await stock3Res.json();
    assert(stock3Res.status === 200 && stock3Data.sellableStock === 175,
      20, 'Zero-quantity batch is excluded from sellable stock', `Cetirizine sellableStock: ${stock3Data.sellableStock} (expected: 175)`);

    // 21. Medicine with only expired batches returns stock 0 (Amoxicillin ID 2)
    const stock2Res = await fetch(`${baseUrl}/api/medicines/2/stock`, { headers: authHeaders });
    const stock2Data = await stock2Res.json();
    assert(stock2Res.status === 200 && stock2Data.sellableStock === 0,
      21, 'Medicine with ONLY expired batches returns sellableStock = 0', `Amoxicillin sellableStock: ${stock2Data.sellableStock} (expected: 0)`);

    // ==========================================
    // PART 5: EXPIRY ALERTS (Tests 22 - 24)
    // ==========================================
    console.log('\n--- Group 5: Expiry Alerts Tests ---');

    // 22. Valid expiring batch appears (PARA-SOON-02 expires in 15 days)
    const alert30Res = await fetch(`${baseUrl}/api/alerts/expiring?days=30`, { headers: authHeaders });
    const alert30Data = await alert30Res.json();
    const hasSoonBatch = alert30Data.some(a => a.batchNumber === 'PARA-SOON-02');
    assert(alert30Res.status === 200 && hasSoonBatch,
      22, 'Valid batch expiring within 30 days appears in alerts',
      `Alerts found: ${alert30Data.length}, includes PARA-SOON-02`);

    // 23. Expired batch does not appear in alerts
    const hasExpiredBatch = alert30Data.some(a => a.batchNumber === 'PARA-EXP-01');
    assert(!hasExpiredBatch,
      23, 'Expired batches do NOT appear in expiring-soon alerts', `PARA-EXP-01 excluded: ${!hasExpiredBatch}`);

    // 24. Zero-quantity batch does not appear in alerts
    const alert300Res = await fetch(`${baseUrl}/api/alerts/expiring?days=300`, { headers: authHeaders });
    const alert300Data = await alert300Res.json();
    const hasZeroQtyBatch = alert300Data.some(a => a.batchNumber === 'CET-ZERO-01');
    assert(!hasZeroQtyBatch,
      24, 'Zero-quantity batches do NOT appear in expiring alerts', `CET-ZERO-01 excluded: ${!hasZeroQtyBatch}`);

    // Cleanup created test records
    await pool.execute('DELETE FROM batches WHERE medicine_id = ?', [createdMedicineId]);
    await pool.execute('DELETE FROM medicines WHERE id = ?', [createdMedicineId]);
    await pool.execute('DELETE FROM users WHERE email = ?', [testUserEmail]);

    console.log('\n====================================================');
    console.log(`Summary: ${passedTests}/${totalTests} Tests Passed`);
    console.log('====================================================\n');

    if (passedTests === totalTests) {
      console.log('All 24 Step 3 REST API requirements verified successfully!\n');
    } else {
      process.exit(1);
    }
  } catch (err) {
    console.error('[Error] Test suite failed with exception:', err);
    process.exit(1);
  } finally {
    server.close();
    await pool.end();
  }
}

if (require.main === module) {
  runApiTests();
}

module.exports = runApiTests;
