const medicineRepo = require('../repositories/medicineRepository');
const batchRepo = require('../repositories/batchRepository');

/**
 * Creates a new medicine.
 * @param {Object} params
 * @param {string} params.name
 * @param {string} [params.description]
 * @returns {Promise<Object>}
 */
async function createMedicine({ name, description }) {
  if (!name || !name.trim()) {
    const error = new Error('Medicine name is required and cannot be blank');
    error.status = 400;
    throw error;
  }

  return medicineRepo.createMedicine({
    name: name.trim(),
    description: description ? description.trim() : null,
  });
}

/**
 * Lists medicines with search, pagination, and sorting.
 * @param {Object} queryParams
 * @returns {Promise<Object>}
 */
async function getMedicines(queryParams) {
  return medicineRepo.getMedicines(queryParams);
}

/**
 * Gets medicine details including batches and sellable stock.
 * @param {number} id
 * @returns {Promise<Object>}
 */
async function getMedicineById(id) {
  const medicineId = parseInt(id, 10);
  if (isNaN(medicineId) || medicineId <= 0) {
    const error = new Error('Invalid medicine ID');
    error.status = 400;
    throw error;
  }

  const medicine = await medicineRepo.getMedicineById(medicineId);
  if (!medicine) {
    const error = new Error(`Medicine with ID ${medicineId} not found`);
    error.status = 404;
    throw error;
  }

  const [batches, sellableStock] = await Promise.all([
    batchRepo.getBatchesByMedicineId(medicineId),
    batchRepo.getSellableStock(medicineId),
  ]);

  const expiredBatchesCount = batches.filter(b => b.isExpired).length;

  return {
    ...medicine,
    sellableStock,
    totalBatches: batches.length,
    expiredBatchesCount,
    batches,
  };
}

/**
 * Updates a medicine.
 * @param {number} id
 * @param {Object} params
 * @param {string} params.name
 * @param {string} [params.description]
 * @returns {Promise<Object>}
 */
async function updateMedicine(id, { name, description }) {
  const medicineId = parseInt(id, 10);
  if (isNaN(medicineId) || medicineId <= 0) {
    const error = new Error('Invalid medicine ID');
    error.status = 400;
    throw error;
  }

  if (!name || !name.trim()) {
    const error = new Error('Medicine name cannot be blank');
    error.status = 400;
    throw error;
  }

  const existing = await medicineRepo.getMedicineById(medicineId);
  if (!existing) {
    const error = new Error(`Medicine with ID ${medicineId} not found`);
    error.status = 404;
    throw error;
  }

  return medicineRepo.updateMedicine(medicineId, {
    name: name.trim(),
    description: description !== undefined ? (description ? description.trim() : null) : existing.description,
  });
}

/**
 * Safely deletes a medicine, preventing foreign-key breakage if batches exist.
 * @param {number} id
 * @returns {Promise<boolean>}
 */
async function deleteMedicine(id) {
  const medicineId = parseInt(id, 10);
  if (isNaN(medicineId) || medicineId <= 0) {
    const error = new Error('Invalid medicine ID');
    error.status = 400;
    throw error;
  }

  const existing = await medicineRepo.getMedicineById(medicineId);
  if (!existing) {
    const error = new Error(`Medicine with ID ${medicineId} not found`);
    error.status = 404;
    throw error;
  }

  const batchCount = await medicineRepo.getBatchCountForMedicine(medicineId);
  if (batchCount > 0) {
    const error = new Error(`Cannot delete medicine '${existing.name}': it has ${batchCount} existing batch(es). Please delete batches first.`);
    error.status = 409;
    throw error;
  }

  return medicineRepo.deleteMedicine(medicineId);
}

/**
 * Gets sellable stock for a medicine.
 * @param {number} id
 * @returns {Promise<Object>}
 */
async function getStock(id) {
  const medicineId = parseInt(id, 10);
  if (isNaN(medicineId) || medicineId <= 0) {
    const error = new Error('Invalid medicine ID');
    error.status = 400;
    throw error;
  }

  const existing = await medicineRepo.getMedicineById(medicineId);
  if (!existing) {
    const error = new Error(`Medicine with ID ${medicineId} not found`);
    error.status = 404;
    throw error;
  }

  const sellableStock = await batchRepo.getSellableStock(medicineId);
  return {
    medicineId,
    sellableStock: sellableStock || 0,
  };
}

module.exports = {
  createMedicine,
  getMedicines,
  getMedicineById,
  updateMedicine,
  deleteMedicine,
  getStock,
};
