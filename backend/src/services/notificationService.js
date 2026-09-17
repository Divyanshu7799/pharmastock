const notificationRepo = require('../repositories/notificationRepository');

/**
 * Checks remaining sellable stock against medicine reorder threshold
 * and creates an outbox alert if strictly below threshold and no pending alert exists.
 * 
 * Must be executed within the active dispensing MySQL transaction.
 * 
 * @param {Object} connection - Active transaction MySQL connection
 * @param {Object} params
 * @param {number} params.medicineId
 * @param {number} params.remainingSellableStock
 * @returns {Promise<Object>} { triggered: boolean, notificationId?: number, reason?: string }
 */
async function checkAndTriggerReorderAlert(connection, { medicineId, remainingSellableStock }) {
  // Query medicine threshold
  const [medRows] = await connection.execute(
    'SELECT name, reorder_threshold FROM medicines WHERE id = ?',
    [medicineId]
  );
  if (medRows.length === 0) {
    return { triggered: false, reason: 'Medicine not found' };
  }

  const medicine = medRows[0];
  const threshold = Number(medicine.reorder_threshold ?? 10);
  const currentStock = Number(remainingSellableStock);

  // Trigger condition: strictly less than threshold (<)
  // If stock == threshold or stock > threshold: DO NOT NOTIFY
  if (currentStock >= threshold) {
    return {
      triggered: false,
      reason: `Stock (${currentStock}) is at or above reorder threshold (${threshold})`,
    };
  }

  // Duplicate policy: Prevent notification spam.
  // Exactly one pending reorder alert per medicine at any given time.
  const hasPending = await notificationRepo.hasPendingAlert(connection, medicineId, 'REORDER_ALERT');
  if (hasPending) {
    return {
      triggered: false,
      reason: `A pending reorder alert already exists for medicine '${medicine.name}'`,
    };
  }

  // Create notification in outbox
  const message = `Low stock alert: In-date sellable stock for '${medicine.name}' is ${currentStock}, which has dropped below the reorder threshold of ${threshold}.`;
  const payload = {
    medicineId,
    medicineName: medicine.name,
    currentSellableStock: currentStock,
    reorderThreshold: threshold,
    deficit: threshold - currentStock,
    triggeredAt: new Date().toISOString(),
  };

  const notificationId = await notificationRepo.createNotification(connection, {
    medicineId,
    eventType: 'REORDER_ALERT',
    message,
    payload,
    status: 'PENDING',
  });

  return {
    triggered: true,
    notificationId,
    message,
  };
}

/**
 * Retrieves persisted notification records from outbox.
 * @param {Object} [filters={}]
 * @returns {Promise<Array>}
 */
async function getOutbox(filters = {}) {
  return notificationRepo.getOutboxNotifications(filters);
}

module.exports = {
  checkAndTriggerReorderAlert,
  getOutbox,
};
