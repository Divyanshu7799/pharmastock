const { pool } = require('../config/db');
const {
  normalizeQuantity,
  normalizeExpiryDate,
  normalizeBatchNumber,
  normalizeMedicineName,
} = require('../utils/importNormalizer');

/**
 * Imports messy batch records with normalization, deduplication, and atomic insertion.
 * 
 * Rules:
 * - Reject row if quantity, expiry date, medicine, or batch number is invalid.
 * - Unknown medicine: reject row (never silently create a medicine).
 * - Duplicate in same import: import first valid occurrence, count duplicates as deduped.
 * - Duplicate with existing DB batch: count as deduped without double-adding or inflating inventory.
 * - Valid rows are atomically committed to the database inside a transaction.
 * 
 * @param {Array<Object>} rows
 * @returns {Promise<Object>} { message, imported, deduped, rejected, details }
 */
async function importBatches(rows) {
  if (!Array.isArray(rows)) {
    const error = new Error("'rows' field must be an array of batch objects");
    error.status = 400;
    throw error;
  }

  if (rows.length === 0) {
    return {
      message: 'Batch import completed',
      imported: 0,
      deduped: 0,
      rejected: 0,
      details: [],
    };
  }

  // 1. Fetch existing medicines to build lookup map (case-insensitive)
  const [medicines] = await pool.execute('SELECT id, name FROM medicines');
  const medicineMap = new Map();
  for (const m of medicines) {
    medicineMap.set(m.name.trim().toLowerCase(), m);
  }

  // 2. Fetch existing batches to check against database duplicates
  const [existingBatches] = await pool.execute('SELECT medicine_id, batch_number FROM batches');
  const existingBatchSet = new Set();
  for (const b of existingBatches) {
    existingBatchSet.add(`${b.medicine_id}::${b.batch_number.trim().toLowerCase()}`);
  }

  const seenInPayload = new Set();
  const toInsert = [];
  const details = [];

  let imported = 0;
  let deduped = 0;
  let rejected = 0;

  // 3. Normalize and validate each row
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const rowNumber = i + 1;

    if (!row || typeof row !== 'object') {
      rejected++;
      details.push({
        row: rowNumber,
        status: 'rejected',
        reason: 'Row must be a valid object',
      });
      continue;
    }

    // Medicine validation
    const medNorm = normalizeMedicineName(row.medicine || row.medicineName);
    if (!medNorm.valid) {
      rejected++;
      details.push({
        row: rowNumber,
        status: 'rejected',
        reason: medNorm.reason,
      });
      continue;
    }

    const matchedMedicine = medicineMap.get(medNorm.value.toLowerCase());
    if (!matchedMedicine) {
      rejected++;
      details.push({
        row: rowNumber,
        status: 'rejected',
        reason: `Medicine '${medNorm.value}' not found in catalog`,
      });
      continue;
    }

    // Batch number validation
    const batchNorm = normalizeBatchNumber(row.batchNumber || row.batch_number);
    if (!batchNorm.valid) {
      rejected++;
      details.push({
        row: rowNumber,
        status: 'rejected',
        reason: batchNorm.reason,
      });
      continue;
    }

    // Quantity validation
    const qtyNorm = normalizeQuantity(row.quantity);
    if (!qtyNorm.valid) {
      rejected++;
      details.push({
        row: rowNumber,
        status: 'rejected',
        reason: qtyNorm.reason,
      });
      continue;
    }

    // Expiry date validation
    const dateNorm = normalizeExpiryDate(row.expiryDate || row.expiry_date);
    if (!dateNorm.valid) {
      rejected++;
      details.push({
        row: rowNumber,
        status: 'rejected',
        reason: dateNorm.reason,
      });
      continue;
    }

    // Duplicate check: check within this import payload
    const batchKey = `${matchedMedicine.id}::${batchNorm.value.toLowerCase()}`;
    if (seenInPayload.has(batchKey)) {
      deduped++;
      details.push({
        row: rowNumber,
        status: 'deduped',
        batchNumber: batchNorm.value,
        medicine: matchedMedicine.name,
        reason: 'Duplicate batch number for this medicine in same import payload',
      });
      continue;
    }
    seenInPayload.add(batchKey);

    // Duplicate check: check against existing database batches
    if (existingBatchSet.has(batchKey)) {
      deduped++;
      details.push({
        row: rowNumber,
        status: 'deduped',
        batchNumber: batchNorm.value,
        medicine: matchedMedicine.name,
        reason: 'Batch already exists in inventory database',
      });
      continue;
    }

    // Candidate for insertion
    toInsert.push({
      rowNumber,
      medicineId: matchedMedicine.id,
      medicineName: matchedMedicine.name,
      batchNumber: batchNorm.value,
      quantity: qtyNorm.value,
      expiryDate: dateNorm.value,
    });
  }

  // 4. Atomically insert accepted records inside a database transaction
  if (toInsert.length > 0) {
    const connection = await pool.getConnection();
    await connection.beginTransaction();

    try {
      const insertQuery = `
        INSERT INTO batches (medicine_id, batch_number, quantity, expiry_date, status)
        VALUES (?, ?, ?, ?, 'ACTIVE')
      `;

      for (const item of toInsert) {
        await connection.execute(insertQuery, [
          item.medicineId,
          item.batchNumber,
          item.quantity,
          item.expiryDate,
        ]);

        imported++;
        details.push({
          row: item.rowNumber,
          status: 'imported',
          medicine: item.medicineName,
          batchNumber: item.batchNumber,
          quantity: item.quantity,
          expiryDate: item.expiryDate,
        });
      }

      await connection.commit();
    } catch (err) {
      await connection.rollback();
      throw err;
    } finally {
      connection.release();
    }
  }

  // Sort details by row number for consistent ordering
  details.sort((a, b) => a.row - b.row);

  return {
    message: 'Batch import completed',
    imported,
    deduped,
    rejected,
    details,
  };
}

module.exports = {
  importBatches,
};
