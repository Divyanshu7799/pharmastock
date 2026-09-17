const { pool } = require('../config/db');
const dispensingRepo = require('../repositories/dispensingRepository');
const notificationService = require('./notificationService');

/**
 * Validates whether a value is a strictly positive integer.
 * @param {*} val
 * @returns {boolean}
 */
function isPositiveInteger(val) {
  if (val === undefined || val === null) return false;
  const num = Number(val);
  return Number.isInteger(num) && num > 0 && String(val).trim() !== '';
}

/**
 * Executes atomic transactional FEFO dispensing.
 * @param {Object} params
 * @param {number} params.userId
 * @param {number} params.medicineId
 * @param {number} params.quantity
 * @returns {Promise<Object>}
 */
async function dispenseMedicine({ userId, medicineId, quantity }) {
  // 1. Validation
  if (!isPositiveInteger(medicineId)) {
    const error = new Error('Medicine ID must be a positive integer');
    error.status = 400;
    throw error;
  }
  if (!isPositiveInteger(quantity)) {
    const error = new Error('Quantity must be a positive integer (greater than zero)');
    error.status = 400;
    throw error;
  }

  const medId = Number(medicineId);
  const reqQty = Number(quantity);

  // 2. Obtain dedicated connection from pool for transaction
  const connection = await pool.getConnection();
  await connection.beginTransaction();

  try {
    // 3. Verify medicine exists
    const [medRows] = await connection.execute(
      'SELECT id, name FROM medicines WHERE id = ?',
      [medId]
    );
    if (medRows.length === 0) {
      const error = new Error(`Medicine with ID ${medId} not found`);
      error.status = 404;
      throw error;
    }
    const medicine = medRows[0];

    // 4. Retrieve & lock eligible batches (row-level locking with FOR UPDATE)
    // Enforces FEFO: quantity > 0, expiry_date >= CURDATE(), ordered by expiry_date ASC, id ASC
    const eligibleBatches = await dispensingRepo.getEligibleBatchesForUpdate(connection, medId);

    // 5. Calculate total sellable stock available
    const availableQuantity = eligibleBatches.reduce((sum, b) => sum + Number(b.quantity), 0);

    // 6. Check stock sufficiency
    if (availableQuantity < reqQty) {
      const error = new Error('Insufficient sellable stock');
      error.status = 400;
      error.requestedQuantity = reqQty;
      error.availableQuantity = availableQuantity;
      // Transaction will be rolled back in catch block
      throw error;
    }

    // 7. Sequential FEFO Consumption
    let remainingToDispense = reqQty;
    const consumedItems = [];

    for (const batch of eligibleBatches) {
      if (remainingToDispense <= 0) break;

      const currentBatchQty = Number(batch.quantity);
      const take = Math.min(currentBatchQty, remainingToDispense);

      // Decrement batch inventory
      await dispensingRepo.updateBatchQuantity(connection, batch.id, take);

      consumedItems.push({
        batchId: batch.id,
        batchNumber: batch.batch_number,
        quantityDispensed: take,
      });

      remainingToDispense -= take;
    }

    // 8. Create master dispensing record
    const dispensingRecordId = await dispensingRepo.createDispensingRecord(connection, {
      userId,
      medicineId: medId,
      requestedQuantity: reqQty,
    });

    // 9. Create batch line items in dispensing_items
    for (const item of consumedItems) {
      await dispensingRepo.createDispensingItem(connection, {
        dispensingRecordId,
        batchId: item.batchId,
        quantityDispensed: item.quantityDispensed,
      });
    }

    // 10. Level 3 / T1: Check remaining sellable stock and trigger reorder alert if below threshold
    const [stockRows] = await connection.execute(`
      SELECT COALESCE(SUM(quantity), 0) AS remainingSellableStock
      FROM batches
      WHERE medicine_id = ?
        AND status = 'ACTIVE'
        AND quantity > 0
        AND expiry_date >= CURDATE()
    `, [medId]);
    const remainingSellableStock = Number(stockRows[0].remainingSellableStock);

    const alertResult = await notificationService.checkAndTriggerReorderAlert(connection, {
      medicineId: medId,
      remainingSellableStock,
    });

    // 11. Commit transaction
    await connection.commit();

    return {
      dispensingId: dispensingRecordId,
      medicineId: medId,
      medicineName: medicine.name,
      requestedQuantity: reqQty,
      dispensedQuantity: reqQty,
      remainingSellableStock,
      reorderAlert: alertResult,
      dispensedAt: new Date().toISOString(),
      items: consumedItems,
    };
  } catch (error) {
    // Atomic rollback on any error
    await connection.rollback();
    throw error;
  } finally {
    // Always return connection to the pool
    connection.release();
  }
}

/**
 * Gets dispensing history for the authenticated user.
 * @param {number} userId
 * @param {Object} options
 * @returns {Promise<Object>}
 */
async function getHistory(userId, options) {
  return dispensingRepo.getHistoryByUserId(userId, options);
}

/**
 * Gets specific dispensing record with items, enforcing user access control.
 * @param {number} id
 * @param {number} userId
 * @returns {Promise<Object>}
 */
async function getDispensingRecord(id, userId) {
  const dispensingId = parseInt(id, 10);
  if (isNaN(dispensingId) || dispensingId <= 0) {
    const error = new Error('Invalid dispensing ID');
    error.status = 400;
    throw error;
  }

  const record = await dispensingRepo.getDispensingRecordDetails(dispensingId);
  if (!record) {
    const error = new Error(`Dispensing record #${dispensingId} not found`);
    error.status = 404;
    throw error;
  }

  // Access check: prevent accessing another user's dispensing record
  if (record.userId !== userId) {
    const error = new Error('Forbidden: You do not have permission to view this dispensing record');
    error.status = 403;
    throw error;
  }

  const items = await dispensingRepo.getDispensingItems(dispensingId);

  return {
    ...record,
    items,
  };
}

module.exports = {
  dispenseMedicine,
  getHistory,
  getDispensingRecord,
};
