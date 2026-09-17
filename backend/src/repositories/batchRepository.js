const { pool } = require('../config/db');

/**
 * Creates a new batch for a medicine.
 * @param {Object} params
 * @param {number} params.medicineId
 * @param {string} params.batchNumber
 * @param {number} params.quantity
 * @param {string|Date} params.expiryDate - YYYY-MM-DD format or Date
 * @returns {Promise<Object>} Created batch record
 */
async function createBatch({ medicineId, batchNumber, quantity, expiryDate }) {
  if (!medicineId) {
    throw new Error('Medicine ID is required');
  }
  if (!batchNumber || !batchNumber.trim()) {
    throw new Error('Batch number is required');
  }
  if (quantity === undefined || quantity === null || Number(quantity) < 0) {
    throw new Error('Batch quantity must be a non-negative number');
  }
  if (!expiryDate) {
    throw new Error('Expiry date is required');
  }

  const query = `
    INSERT INTO batches (medicine_id, batch_number, quantity, expiry_date)
    VALUES (?, ?, ?, ?)
  `;
  const [result] = await pool.execute(query, [
    medicineId,
    batchNumber.trim(),
    Number(quantity),
    expiryDate,
  ]);

  return {
    id: result.insertId,
    medicineId,
    batchNumber: batchNumber.trim(),
    quantity: Number(quantity),
    expiryDate,
  };
}

/**
 * Retrieves all batches for a given medicine, ordered strictly by FEFO:
 * expiry_date ASC, followed by deterministic secondary ordering id ASC.
 * @param {number} medicineId
 * @returns {Promise<Array>}
 */
async function getBatchesByMedicineId(medicineId) {
  const query = `
    SELECT 
      id,
      medicine_id AS medicineId,
      batch_number AS batchNumber,
      quantity,
      DATE_FORMAT(expiry_date, '%Y-%m-%d') AS expiryDate,
      (expiry_date < CURDATE()) AS isExpired,
      created_at AS createdAt,
      updated_at AS updatedAt
    FROM batches
    WHERE medicine_id = ?
    ORDER BY expiry_date ASC, id ASC
  `;
  const [rows] = await pool.execute(query, [medicineId]);
  return rows;
}

/**
 * Calculates total sellable stock for a medicine.
 * Business rules:
 * - Excludes expired batches (expiry_date < CURDATE())
 * - Excludes zero-quantity batches (quantity <= 0)
 * - Sums remaining sellable quantities
 * @param {number} medicineId
 * @returns {Promise<number>} Total sellable stock quantity
 */
async function getSellableStock(medicineId) {
  const query = `
    SELECT COALESCE(SUM(quantity), 0) AS sellableStock
    FROM batches
    WHERE medicine_id = ?
      AND quantity > 0
      AND expiry_date >= CURDATE()
  `;
  const [rows] = await pool.execute(query, [medicineId]);
  return Number(rows[0].sellableStock);
}

module.exports = {
  createBatch,
  getBatchesByMedicineId,
  getSellableStock,
};
