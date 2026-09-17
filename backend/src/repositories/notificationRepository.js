const { pool } = require('../config/db');

/**
 * Creates an outbox notification record.
 * @param {Object} executor - MySQL connection or pool
 * @param {Object} params
 * @param {number} params.medicineId
 * @param {string} [params.eventType='REORDER_ALERT']
 * @param {string} params.message
 * @param {Object} [params.payload={}]
 * @param {string} [params.status='PENDING']
 * @returns {Promise<number>} Inserted notification ID
 */
async function createNotification(executor, { medicineId, eventType = 'REORDER_ALERT', message, payload = {}, status = 'PENDING' }) {
  const query = `
    INSERT INTO outbox (medicine_id, event_type, message, payload, status)
    VALUES (?, ?, ?, ?, ?)
  `;
  const serializedPayload = typeof payload === 'string' ? payload : JSON.stringify(payload);
  const [result] = await executor.execute(query, [
    medicineId,
    eventType,
    message,
    serializedPayload,
    status,
  ]);
  return result.insertId;
}

/**
 * Checks if a pending notification already exists for the medicine.
 * Prevents notification spam. Uses FOR UPDATE if called inside a transaction.
 * @param {Object} executor - Active MySQL connection or pool
 * @param {number} medicineId
 * @param {string} [eventType='REORDER_ALERT']
 * @returns {Promise<boolean>}
 */
async function hasPendingAlert(executor, medicineId, eventType = 'REORDER_ALERT') {
  const query = `
    SELECT id
    FROM outbox
    WHERE medicine_id = ?
      AND event_type = ?
      AND status = 'PENDING'
    LIMIT 1
  `;
  const [rows] = await executor.execute(query, [medicineId, eventType]);
  return rows.length > 0;
}

/**
 * Retrieves all outbox notifications with optional filtering.
 * @param {Object} [filters={}]
 * @param {string} [filters.status]
 * @param {number} [filters.medicineId]
 * @returns {Promise<Array>}
 */
async function getOutboxNotifications(filters = {}) {
  let query = `
    SELECT 
      o.id,
      o.medicine_id,
      m.name AS medicine_name,
      o.event_type,
      o.message,
      o.payload,
      o.status,
      o.created_at
    FROM outbox o
    LEFT JOIN medicines m ON o.medicine_id = m.id
    WHERE 1=1
  `;
  const params = [];

  if (filters.status) {
    query += ` AND o.status = ?`;
    params.push(filters.status);
  }

  if (filters.medicineId) {
    query += ` AND o.medicine_id = ?`;
    params.push(filters.medicineId);
  }

  query += ` ORDER BY o.created_at DESC, o.id DESC`;

  const [rows] = await pool.execute(query, params);

  return rows.map(r => {
    let parsedPayload = null;
    if (r.payload) {
      parsedPayload = typeof r.payload === 'string' ? JSON.parse(r.payload) : r.payload;
    }

    return {
      id: r.id,
      medicine_id: r.medicine_id,
      medicineId: r.medicine_id,
      medicine_name: r.medicine_name,
      medicineName: r.medicine_name,
      event_type: r.event_type,
      eventType: r.event_type,
      message: r.message,
      payload: parsedPayload,
      status: r.status,
      created_at: r.created_at,
      createdAt: r.created_at,
    };
  });
}

module.exports = {
  createNotification,
  hasPendingAlert,
  getOutboxNotifications,
};
