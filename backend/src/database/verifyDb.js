const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

const { pool, testConnection } = require('../config/db');
const medicineRepo = require('../repositories/medicineRepository');
const batchRepo = require('../repositories/batchRepository');

async function runVerification() {
  console.log('====================================================');
  console.log('       PharmaStock Step 2 Verification Suite        ');
  console.log('====================================================\n');

  let passedTests = 0;
  let totalTests = 0;

  function assert(condition, testName, details = '') {
    totalTests++;
    if (condition) {
      console.log(`[PASS] ${testName}`);
      if (details) console.log(`       ↳ ${details}`);
      passedTests++;
    } else {
      console.error(`[FAIL] ${testName}`);
      if (details) console.error(`       ↳ ${details}`);
    }
  }

  try {
    // Test 1: Verify Connection Pool
    console.log('--- Test Group 1: Database Connectivity ---');
    const isConnected = await testConnection();
    assert(isConnected, 'Backend connects successfully to MySQL database via connection pool');

    // Test 2: Read medicines
    console.log('\n--- Test Group 2: Medicine Repository ---');
    const medResult = await medicineRepo.getMedicines();
    const medicines = Array.isArray(medResult) ? medResult : medResult.data;
    assert(Array.isArray(medicines) && medicines.length >= 4, 'Retrieve list of all medicines', `Found ${medicines.length} medicines`);

    const paracetamol = medicines.find(m => m.name.includes('Paracetamol'));
    const amoxicillin = medicines.find(m => m.name.includes('Amoxicillin'));
    const cetirizine = medicines.find(m => m.name.includes('Cetirizine'));

    assert(Boolean(paracetamol), 'Paracetamol exists in seeded medicines', `ID: ${paracetamol?.id}`);
    assert(Boolean(amoxicillin), 'Amoxicillin exists in seeded medicines', `ID: ${amoxicillin?.id}`);
    assert(Boolean(cetirizine), 'Cetirizine exists in seeded medicines', `ID: ${cetirizine?.id}`);

    // Test 3: Medicine by ID
    const medById = await medicineRepo.getMedicineById(paracetamol.id);
    assert(medById && medById.id === paracetamol.id, 'Retrieve medicine by ID', `Found: ${medById?.name}`);

    // Test 4: Create new medicine
    const newMedName = `Test Drug ${Date.now()}`;
    const createdMed = await medicineRepo.createMedicine({
      name: newMedName,
      description: 'Temporary medicine for unit testing',
    });
    assert(createdMed && createdMed.id > 0, 'Create new medicine record', `Created ID: ${createdMed.id}`);

    // Test 5: Batches and FEFO ordering (expiry_date ASC, id ASC)
    console.log('\n--- Test Group 3: Batch Repository & FEFO Ordering ---');
    const paraBatches = await batchRepo.getBatchesByMedicineId(paracetamol.id);
    assert(paraBatches.length === 3, 'Paracetamol has 3 batches', `Found: ${paraBatches.length} batches`);

    // Verify ordering by expiry_date ASC
    let isFefoOrdered = true;
    for (let i = 0; i < paraBatches.length - 1; i++) {
      if (new Date(paraBatches[i].expiryDate) > new Date(paraBatches[i + 1].expiryDate)) {
        isFefoOrdered = false;
        break;
      }
    }
    assert(isFefoOrdered, 'Batches are returned in strict FEFO order (expiry_date ASC, id ASC)', 
      paraBatches.map(b => `${b.batchNumber}: ${b.expiryDate} (qty: ${b.quantity})`).join(' -> '));

    // Test 6: Deterministic secondary sort on same expiry date
    const cetBatches = await batchRepo.getBatchesByMedicineId(cetirizine.id);
    const sameExpiryBatches = cetBatches.filter(b => b.expiryDate === cetBatches[0].expiryDate);
    const isIdSorted = sameExpiryBatches.length >= 2 && sameExpiryBatches[0].id < sameExpiryBatches[1].id;
    assert(isIdSorted, 'Batches with identical expiry dates order deterministically by id ASC',
      sameExpiryBatches.map(b => `ID ${b.id} (${b.batchNumber})`).join(', '));

    // Test 7: Sellable stock calculation with mixed valid + expired batches
    console.log('\n--- Test Group 4: Sellable Stock Business Logic ---');
    // Paracetamol: Batch 1 is expired (qty 100), Batch 2 is soon (qty 50), Batch 3 is normal (qty 200).
    // Expected sellable stock = 50 + 200 = 250
    const paraStock = await batchRepo.getSellableStock(paracetamol.id);
    assert(paraStock === 250, 'Sellable stock for Paracetamol excludes expired batches (only 50 + 200 counted)',
      `Expected: 250, Actual: ${paraStock}`);

    // Test 8: Sellable stock for medicine with ONLY expired batches
    // Amoxicillin: All batches are expired (qty 40 + qty 60).
    // Expected sellable stock = 0
    const amxStock = await batchRepo.getSellableStock(amoxicillin.id);
    assert(amxStock === 0, 'Sellable stock for Amoxicillin with only expired batches evaluates to exactly 0',
      `Expected: 0, Actual: ${amxStock}`);

    // Test 9: Sellable stock excludes 0-quantity batches
    // Cetirizine: Batch A (qty 100), Batch B (qty 75), Batch ZERO (qty 0).
    // Expected sellable stock = 100 + 75 = 175
    const cetStock = await batchRepo.getSellableStock(cetirizine.id);
    assert(cetStock === 175, 'Sellable stock for Cetirizine excludes zero-quantity batch',
      `Expected: 175, Actual: ${cetStock}`);

    // Test 10: Create batch with validation
    const newBatch = await batchRepo.createBatch({
      medicineId: createdMed.id,
      batchNumber: `BATCH-TEST-${Date.now()}`,
      quantity: 50,
      expiryDate: '2027-12-31',
    });
    assert(newBatch && newBatch.id > 0, 'Create new batch record for medicine', `Created batch ID: ${newBatch.id}`);

    // Clean up temporary test medicine
    await pool.execute('DELETE FROM medicines WHERE id = ?', [createdMed.id]);

    console.log('\n====================================================');
    console.log(`Summary: ${passedTests}/${totalTests} Tests Passed`);
    console.log('====================================================\n');

    if (passedTests === totalTests) {
      console.log('All Step 2 database & inventory data model verifications succeeded!\n');
    } else {
      process.exit(1);
    }
  } catch (err) {
    console.error('[Error] Verification failed with exception:', err);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

if (require.main === module) {
  runVerification();
}

module.exports = runVerification;
