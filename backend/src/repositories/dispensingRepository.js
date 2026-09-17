const { pool } = require('../config/db');

/**
 * Retrieves eligible batches with row-level locks for transactional dispensing.
 * Conditions:
 * - medicine_id matches
 * - quantity > 0
 * - expiry_date >= CURDATE()
 * - Ordered strictly by expiry_date ASC, id ASC
 * @param {Object} connection - Active transaction MySQL connection
 * @param {number} medicineId
 * @returns {Promise<Array>}
 */
async function getEligibleBatchesForUpdate(connection, medicineId) {
  const query = `
    SELECT 
      id,
      medicine_id,
      batch_number,
      quantity,
      DATE_FORMAT(expiry_date, '%Y-%m-%d') AS expiry_date
    FROM batches
    WHERE medicine_id = ?
      AND quantity > 0
      AND expiry_date >= CURDATE()
      AND status = 'ACTIVE'
    ORDER BY expiry_date ASC, id ASC
    FOR UPDATE
  `;
  const [rows] = await connection.execute(query, [medicineId]);
  return rows;
}

/**
 * Decrements batch quantity inside a transaction.
 * @param {Object} connection
 * @param {number} batchId
 * @param {number} decrementBy
 * @returns {Promise<void>}
 */
async function updateBatchQuantity(connection, batchId, decrementBy) {
  const query = `
    UPDATE batches
    SET quantity = quantity - ?
    WHERE id = ?
  `;
  await connection.execute(query, [decrementBy, batchId]);
}

/**
 * Inserts a master dispensing record inside a transaction.
 * @param {Object} connection
 * @param {Object} params
 * @param {number} params.userId
 * @param {number} params.medicineId
 * @param {number} params.requestedQuantity
 * @returns {Promise<number>} Inserted record ID
 */
async function createDispensingRecord(connection, { userId, medicineId, requestedQuantity }) {
  const query = `
    INSERT INTO dispensing_records (user_id, medicine_id, requested_quantity, dispensed_at)
    VALUES (?, ?, ?, NOW())
  `;
  const [result] = await connection.execute(query, [userId, medicineId, requestedQuantity]);
  return result.insertId;
}

/**
 * Inserts a line item for consumed batch inside a transaction.
 * @param {Object} connection
 * @param {Object} params
 * @param {number} params.dispensingRecordId
 * @param {number} params.batchId
 * @param {number} params.quantityDispensed
 * @returns {Promise<number>} Inserted item ID
 */
async function createDispensingItem(connection, { dispensingRecordId, batchId, quantityDispensed }) {
  const query = `
    INSERT INTO dispensing_items (dispensing_record_id, batch_id, quantity_dispensed)
    VALUES (?, ?, ?)
  `;
  const [result] = await connection.execute(query, [dispensingRecordId, batchId, quantityDispensed]);
  return result.insertId;
}

/**
 * Retrieves paginated dispensing history for a user.
 * @param {number} userId
 * @param {Object} options
 * @param {number} options.page
 * @param {number} options.limit
 * @returns {Promise<Object>} { data, pagination }
 */
async function getHistoryByUserId(userId, { page = 1, limit = 10 } = {}) {
  const safePage = Math.max(1, parseInt(page, 10) || 1);
  let safeLimit = parseInt(limit, 10) || 10;
  if (safeLimit < 1) safeLimit = 10;
  if (safeLimit > 50) safeLimit = 50;
  const offset = (safePage - 1) * safeLimit;

  const countQuery = `
    SELECT COUNT(*) AS total
    FROM dispensing_records
    WHERE user_id = ?
  `;
  const [countRows] = await pool.execute(countQuery, [userId]);
  const total = Number(countRows[0].total);
  const totalPages = Math.ceil(total / safeLimit) || 1;

  const dataQuery = `
    SELECT 
      dr.id,
      dr.user_id AS userId,
      dr.medicine_id AS medicineId,
      m.name AS medicineName,
      dr.requested_quantity AS requestedQuantity,
      dr.dispensed_at AS dispensedAt,
      COALESCE(SUM(di.quantity_dispensed), 0) AS totalDispensedQuantity
    FROM dispensing_records dr
    JOIN medicines m ON dr.medicine_id = m.id
    LEFT JOIN dispensing_items di ON dr.id = di.dispensing_record_id
    WHERE dr.user_id = ?
    GROUP BY dr.id
    ORDER BY dr.dispensed_at DESC, dr.id DESC
    LIMIT ${safeLimit} OFFSET ${offset}
  `;
  const [rows] = await pool.execute(dataQuery, [userId]);

  return {
    data: rows.map(r => ({
      id: r.id,
      userId: r.userId,
      medicineId: r.medicineId,
      medicineName: r.medicineName,
      requestedQuantity: r.requestedQuantity,
      dispensedQuantity: Number(r.totalDispensedQuantity),
      dispensedAt: r.dispensedAt,
    })),
    pagination: {
      page: safePage,
      limit: safeLimit,
      total,
      totalPages,
    },
  };
}

/**
 * Retrieves a dispensing record by ID.
 * @param {number} id
 * @returns {Promise<Object|null>}
 */
async function getDispensingRecordDetails(id) {
  const query = `
    SELECT 
      dr.id,
      dr.user_id AS userId,
      dr.medicine_id AS medicineId,
      m.name AS medicineName,
      dr.requested_quantity AS requestedQuantity,
      dr.dispensed_at AS dispensedAt
    FROM dispensing_records dr
    JOIN medicines m ON dr.medicine_id = m.id
    WHERE dr.id = ?
  `;
  const [rows] = await pool.execute(query, [id]);
  return rows.length > 0 ? rows[0] : null;
}

/**
 * Retrieves batch items associated with a dispensing record.
 * @param {number} dispensingRecordId
 * @returns {Promise<Array>}
 */
async function getDispensingItems(dispensingRecordId) {
  const query = `
    SELECT 
      di.id,
      di.batch_id AS batchId,
      b.batch_number AS batchNumber,
      di.quantity_dispensed AS quantityDispensed
    FROM dispensing_items di
    JOIN batches b ON di.batch_id = b.id
    WHERE di.dispensing_record_id = ?
    ORDER BY di.id ASC
  `;
  const [rows] = await pool.execute(query, [dispensingRecordId]);
  return rows;
}

module.exports = {
  getEligibleBatchesForUpdate,
  updateBatchQuantity,
  createDispensingRecord,
  createDispensingItem,
  getHistoryByUserId,
  getDispensingRecordDetails,
  getDispensingItems,
};
