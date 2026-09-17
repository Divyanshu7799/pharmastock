const { pool } = require('../config/db');

/**
 * Quarantines all active batches whose expiry date is strictly before CURRENT_DATE.
 * Idempotent: Batches already QUARANTINED are not affected or counted again.
 * @param {Object} [executor=pool] - Optional connection or pool
 * @returns {Promise<number>} Number of batches newly quarantined
 */
async function quarantineExpiredBatches(executor = pool) {
  const query = `
    UPDATE batches
    SET status = 'QUARANTINED', updated_at = NOW()
    WHERE status = 'ACTIVE'
      AND expiry_date < CURDATE()
  `;
  const [result] = await executor.execute(query);
  return result.affectedRows;
}

/**
 * Counts active batches that expire within the specified day window (default 7 days)
 * and still have positive inventory (quantity > 0).
 * Excludes expired batches (expiry_date < CURDATE()).
 * Excludes quarantined batches (status != 'ACTIVE').
 * Excludes zero-quantity batches (quantity <= 0).
 * @param {Object} [executor=pool]
 * @param {number} [days=7]
 * @returns {Promise<number>}
 */
async function countExpiringSoonBatches(executor = pool, days = 7) {
  const query = `
    SELECT COUNT(*) AS count
    FROM batches
    WHERE status = 'ACTIVE'
      AND quantity > 0
      AND expiry_date >= CURDATE()
      AND expiry_date <= DATE_ADD(CURDATE(), INTERVAL ? DAY)
  `;
  const [rows] = await executor.execute(query, [days]);
  return Number(rows[0].count);
}

/**
 * Retrieves list of currently quarantined batches for inspection/reporting.
 * @param {Object} [executor=pool]
 * @returns {Promise<Array>}
 */
async function getQuarantinedBatches(executor = pool) {
  const query = `
    SELECT 
      b.id,
      b.medicine_id AS medicineId,
      m.name AS medicineName,
      b.batch_number AS batchNumber,
      b.quantity,
      DATE_FORMAT(b.expiry_date, '%Y-%m-%d') AS expiryDate,
      b.status,
      b.updated_at AS updatedAt
    FROM batches b
    JOIN medicines m ON b.medicine_id = m.id
    WHERE b.status = 'QUARANTINED'
    ORDER BY b.expiry_date ASC, b.id ASC
  `;
  const [rows] = await executor.execute(query);
  return rows;
}

module.exports = {
  quarantineExpiredBatches,
  countExpiringSoonBatches,
  getQuarantinedBatches,
};
