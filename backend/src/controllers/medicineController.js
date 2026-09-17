const medicineService = require('../services/medicineService');

/**
 * Lists medicines with search, pagination, and sorting.
 */
async function getMedicines(req, res, next) {
  try {
    const { search, page, limit, sortBy, order } = req.query;
    const result = await medicineService.getMedicines({ search, page, limit, sortBy, order });
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
}

/**
 * Gets medicine details by ID.
 */
async function getMedicineById(req, res, next) {
  try {
    const { id } = req.params;
    const medicine = await medicineService.getMedicineById(id);
    res.status(200).json(medicine);
  } catch (err) {
    next(err);
  }
}

/**
 * Creates a new medicine.
 */
async function createMedicine(req, res, next) {
  try {
    const { name, description, reorderThreshold, reorder_threshold } = req.body;
    const created = await medicineService.createMedicine({ name, description, reorderThreshold, reorder_threshold });
    res.status(201).json(created);
  } catch (err) {
    next(err);
  }
}

/**
 * Updates a medicine.
 */
async function updateMedicine(req, res, next) {
  try {
    const { id } = req.params;
    const { name, description, reorderThreshold, reorder_threshold } = req.body;
    const updated = await medicineService.updateMedicine(id, { name, description, reorderThreshold, reorder_threshold });
    res.status(200).json(updated);
  } catch (err) {
    next(err);
  }
}

/**
 * Deletes a medicine.
 */
async function deleteMedicine(req, res, next) {
  try {
    const { id } = req.params;
    await medicineService.deleteMedicine(id);
    res.status(200).json({ message: 'Medicine deleted successfully' });
  } catch (err) {
    next(err);
  }
}

/**
 * Gets sellable stock for a medicine.
 */
async function getStock(req, res, next) {
  try {
    const { id } = req.params;
    const stock = await medicineService.getStock(id);
    res.status(200).json(stock);
  } catch (err) {
    next(err);
  }
}

module.exports = {
  getMedicines,
  getMedicineById,
  createMedicine,
  updateMedicine,
  deleteMedicine,
  getStock,
};
