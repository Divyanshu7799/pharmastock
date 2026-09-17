const batchRepo = require('../repositories/batchRepository');
const medicineRepo = require('../repositories/medicineRepository');

const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Validates date string.
 * @param {string} dateStr
 * @returns {boolean}
 */
function isValidDate(dateStr) {
  if (!dateStr || typeof dateStr !== 'string' || !DATE_REGEX.test(dateStr)) {
    return false;
  }
  const date = new Date(dateStr);
  return date instanceof Date && !isNaN(date.getTime());
}

/**
 * Creates a new batch.
 * @param {Object} params
 * @returns {Promise<Object>}
 */
async function createBatch({ medicineId, batchNumber, quantity, expiryDate }) {
  const medId = parseInt(medicineId, 10);
  if (isNaN(medId) || medId <= 0) {
    const error = new Error('Invalid medicine ID');
    error.status = 400;
    throw error;
  }

  // Ensure medicine exists
  const medicine = await medicineRepo.getMedicineById(medId);
  if (!medicine) {
    const error = new Error(`Medicine with ID ${medId} not found`);
    error.status = 404;
    throw error;
  }

  if (!batchNumber || !batchNumber.trim()) {
    const error = new Error('Batch number is required and cannot be blank');
    error.status = 400;
    throw error;
  }

  if (quantity === undefined || quantity === null || isNaN(Number(quantity)) || Number(quantity) < 0) {
    const error = new Error('Batch quantity must be a non-negative integer (0 or greater)');
    error.status = 400;
    throw error;
  }

  if (!isValidDate(expiryDate)) {
    const error = new Error('Expiry date is required and must be a valid date in YYYY-MM-DD format');
    error.status = 400;
    throw error;
  }

  try {
    return await batchRepo.createBatch({
      medicineId: medId,
      batchNumber: batchNumber.trim(),
      quantity: Math.floor(Number(quantity)),
      expiryDate,
    });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY' || err.message.includes('uq_medicine_batch')) {
      const error = new Error(`Batch '${batchNumber.trim()}' already exists for this medicine`);
      error.status = 409;
      throw error;
    }
    throw err;
  }
}

/**
 * Retrieves batches for a medicine.
 * @param {number} medicineId
 * @returns {Promise<Array>}
 */
async function getBatchesByMedicine(medicineId) {
  const medId = parseInt(medicineId, 10);
  if (isNaN(medId) || medId <= 0) {
    const error = new Error('Invalid medicine ID');
    error.status = 400;
    throw error;
  }

  const medicine = await medicineRepo.getMedicineById(medId);
  if (!medicine) {
    const error = new Error(`Medicine with ID ${medId} not found`);
    error.status = 404;
    throw error;
  }

  return batchRepo.getBatchesByMedicineId(medId);
}

/**
 * Updates an existing batch.
 * @param {number} id
 * @param {Object} params
 * @returns {Promise<Object>}
 */
async function updateBatch(id, { quantity, expiryDate }) {
  const batchId = parseInt(id, 10);
  if (isNaN(batchId) || batchId <= 0) {
    const error = new Error('Invalid batch ID');
    error.status = 400;
    throw error;
  }

  const existing = await batchRepo.getBatchById(batchId);
  if (!existing) {
    const error = new Error(`Batch with ID ${batchId} not found`);
    error.status = 404;
    throw error;
  }

  const updatedQty = quantity !== undefined ? Number(quantity) : existing.quantity;
  if (isNaN(updatedQty) || updatedQty < 0) {
    const error = new Error('Batch quantity must be a non-negative number');
    error.status = 400;
    throw error;
  }

  const updatedDate = expiryDate !== undefined ? expiryDate : existing.expiryDate;
  if (!isValidDate(updatedDate)) {
    const error = new Error('Expiry date must be a valid date in YYYY-MM-DD format');
    error.status = 400;
    throw error;
  }

  return batchRepo.updateBatch(batchId, {
    quantity: Math.floor(updatedQty),
    expiryDate: updatedDate,
  });
}

/**
 * Deletes a batch safely, checking for historical dispensing references.
 * @param {number} id
 * @returns {Promise<boolean>}
 */
async function deleteBatch(id) {
  const batchId = parseInt(id, 10);
  if (isNaN(batchId) || batchId <= 0) {
    const error = new Error('Invalid batch ID');
    error.status = 400;
    throw error;
  }

  const existing = await batchRepo.getBatchById(batchId);
  if (!existing) {
    const error = new Error(`Batch with ID ${batchId} not found`);
    error.status = 404;
    throw error;
  }

  const isDispensed = await batchRepo.isBatchDispensed(batchId);
  if (isDispensed) {
    const error = new Error(`Cannot delete batch '${existing.batchNumber}': it has recorded dispensing transactions.`);
    error.status = 409;
    throw error;
  }

  return batchRepo.deleteBatch(batchId);
}

module.exports = {
  createBatch,
  getBatchesByMedicine,
  updateBatch,
  deleteBatch,
};
