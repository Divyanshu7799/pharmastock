const batchService = require('../services/batchService');
const batchImportService = require('../services/batchImportService');

/**
 * Creates a batch for a given medicine.
 */
async function createBatch(req, res, next) {
  try {
    const { medicineId } = req.params;
    const { batchNumber, quantity, expiryDate } = req.body;
    const created = await batchService.createBatch({
      medicineId,
      batchNumber,
      quantity,
      expiryDate,
    });
    res.status(201).json(created);
  } catch (err) {
    next(err);
  }
}

/**
 * Retrieves all batches for a given medicine.
 */
async function getBatchesByMedicine(req, res, next) {
  try {
    const { medicineId } = req.params;
    const batches = await batchService.getBatchesByMedicine(medicineId);
    res.status(200).json(batches);
  } catch (err) {
    next(err);
  }
}

/**
 * Updates a batch.
 */
async function updateBatch(req, res, next) {
  try {
    const { id } = req.params;
    const { quantity, expiryDate } = req.body;
    const updated = await batchService.updateBatch(id, { quantity, expiryDate });
    res.status(200).json(updated);
  } catch (err) {
    next(err);
  }
}

/**
 * Deletes a batch.
 */
async function deleteBatch(req, res, next) {
  try {
    const { id } = req.params;
    await batchService.deleteBatch(id);
    res.status(200).json({ message: 'Batch deleted successfully' });
  } catch (err) {
    next(err);
  }
}

/**
 * Imports messy batch records with normalization, deduplication, and transactional storage.
 */
async function importBatches(req, res, next) {
  try {
    const { rows } = req.body;
    const result = await batchImportService.importBatches(rows);
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
}

module.exports = {
  createBatch,
  getBatchesByMedicine,
  updateBatch,
  deleteBatch,
  importBatches,
};
