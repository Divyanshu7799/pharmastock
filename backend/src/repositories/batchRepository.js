const { pool } = require('../config/db');

/**
 * Derives batch status string based on dates and quantity.
 * @param {Object} batch
 * @returns {string} 'expired' | 'expiring_soon' | 'out_of_stock' | 'valid'
 */
function deriveBatchStatus(batch) {
  const isExpired = Boolean(batch.isExpired);
  const qty = Number(batch.quantity);
  const isExpiringSoon = Boolean(batch.isExpiringSoon);

  if (isExpired) return 'expired';
  if (qty === 0) return 'out_of_stock';
  if (isExpiringSoon) return 'expiring_soon';
  return 'valid';
}

/**
 * Creates a new batch record.
 * @param {Object} params
 * @param {number} params.medicineId
 * @param {string} params.batchNumber
 * @param {number} params.quantity
 * @param {string|Date} params.expiryDate
 * @returns {Promise<Object>}
 */
async function createBatch({ medicineId, batchNumber, quantity, expiryDate }) {
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
 * Retrieves all batches for a medicine in FEFO order:
 * expiry_date ASC, id ASC.
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
      (expiry_date >= CURDATE() AND expiry_date <= DATE_ADD(CURDATE(), INTERVAL 30 DAY) AND quantity > 0) AS isExpiringSoon,
      created_at AS createdAt,
      updated_at AS updatedAt
    FROM batches
    WHERE medicine_id = ?
    ORDER BY expiry_date ASC, id ASC
  `;
  const [rows] = await pool.execute(query, [medicineId]);

  return rows.map(row => ({
    id: row.id,
    medicineId: row.medicineId,
    batchNumber: row.batchNumber,
    quantity: row.quantity,
    expiryDate: row.expiryDate,
    isExpired: Boolean(row.isExpired),
    status: deriveBatchStatus(row),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }));
}

/**
 * Calculates sellable stock for a medicine:
 * Excludes expired batches (expiry_date < CURDATE())
 * Excludes zero-quantity batches (quantity <= 0)
 * @param {number} medicineId
 * @returns {Promise<number>}
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

/**
 * Retrieves a batch by ID.
 * @param {number} id
 * @returns {Promise<Object|null>}
 */
async function getBatchById(id) {
  const query = `
    SELECT 
      id,
      medicine_id AS medicineId,
      batch_number AS batchNumber,
      quantity,
      DATE_FORMAT(expiry_date, '%Y-%m-%d') AS expiryDate,
      (expiry_date < CURDATE()) AS isExpired,
      (expiry_date >= CURDATE() AND expiry_date <= DATE_ADD(CURDATE(), INTERVAL 30 DAY) AND quantity > 0) AS isExpiringSoon,
      created_at AS createdAt,
      updated_at AS updatedAt
    FROM batches
    WHERE id = ?
  `;
  const [rows] = await pool.execute(query, [id]);
  if (rows.length === 0) return null;
  const row = rows[0];
  return {
    id: row.id,
    medicineId: row.medicineId,
    batchNumber: row.batchNumber,
    quantity: row.quantity,
    expiryDate: row.expiryDate,
    isExpired: Boolean(row.isExpired),
    status: deriveBatchStatus(row),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

/**
 * Updates a batch record.
 * @param {number} id
 * @param {Object} params
 * @param {number} params.quantity
 * @param {string} params.expiryDate
 * @returns {Promise<Object|null>}
 */
async function updateBatch(id, { quantity, expiryDate }) {
  const query = `
    UPDATE batches
    SET quantity = ?, expiry_date = ?
    WHERE id = ?
  `;
  const [result] = await pool.execute(query, [Number(quantity), expiryDate, id]);
  if (result.affectedRows === 0) return null;
  return getBatchById(id);
}

/**
 * Checks whether a batch has been referenced in dispensing history.
 * @param {number} batchId
 * @returns {Promise<boolean>}
 */
async function isBatchDispensed(batchId) {
  const query = `
    SELECT COUNT(*) AS count
    FROM dispensing_items
    WHERE batch_id = ?
  `;
  const [rows] = await pool.execute(query, [batchId]);
  return Number(rows[0].count) > 0;
}

/**
 * Deletes a batch by ID.
 * @param {number} id
 * @returns {Promise<boolean>}
 */
async function deleteBatch(id) {
  const query = `DELETE FROM batches WHERE id = ?`;
  const [result] = await pool.execute(query, [id]);
  return result.affectedRows > 0;
}

/**
 * Finds batches expiring within a given window (default 30 days):
 * - Must be expiring soon: expiry_date >= CURDATE() AND expiry_date <= CURDATE() + interval
 * - Must have stock: quantity > 0
 * - Ordered by expiry_date ASC, id ASC
 * @param {number} days
 * @returns {Promise<Array>}
 */
async function getExpiringBatches(days = 30) {
  const safeDays = Math.max(1, Math.min(365, parseInt(days, 10) || 30));
  const query = `
    SELECT 
      m.id AS medicineId,
      m.name AS medicineName,
      b.id AS batchId,
      b.batch_number AS batchNumber,
      b.quantity,
      DATE_FORMAT(b.expiry_date, '%Y-%m-%d') AS expiryDate,
      DATEDIFF(b.expiry_date, CURDATE()) AS daysRemaining
    FROM batches b
    INNER JOIN medicines m ON b.medicine_id = m.id
    WHERE b.quantity > 0
      AND b.expiry_date >= CURDATE()
      AND b.expiry_date <= DATE_ADD(CURDATE(), INTERVAL ? DAY)
    ORDER BY b.expiry_date ASC, b.id ASC
  `;
  const [rows] = await pool.execute(query, [safeDays]);
  return rows.map(r => ({
    medicineId: r.medicineId,
    medicineName: r.medicineName,
    batchId: r.batchId,
    batchNumber: r.batchNumber,
    quantity: r.quantity,
    expiryDate: r.expiryDate,
    daysRemaining: Number(r.daysRemaining),
  }));
}

module.exports = {
  createBatch,
  getBatchesByMedicineId,
  getSellableStock,
  getBatchById,
  updateBatch,
  isBatchDispensed,
  deleteBatch,
  getExpiringBatches,
};
