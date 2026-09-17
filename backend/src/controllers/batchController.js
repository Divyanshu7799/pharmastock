const batchService = require('../services/batchService');

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

module.exports = {
  createBatch,
  getBatchesByMedicine,
  updateBatch,
  deleteBatch,
};
