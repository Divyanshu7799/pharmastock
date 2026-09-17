const dispensingService = require('../services/dispensingService');

/**
 * Handles transactional dispensing request.
 */
async function dispense(req, res, next) {
  try {
    const { medicineId, quantity } = req.body;
    const result = await dispensingService.dispenseMedicine({
      userId: req.user.id,
      medicineId,
      quantity,
    });

    res.status(200).json({
      message: 'Medicine dispensed successfully',
      data: result,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Handles fetching dispensing history for the logged-in user.
 */
async function getHistory(req, res, next) {
  try {
    const { page, limit } = req.query;
    const result = await dispensingService.getHistory(req.user.id, { page, limit });
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
}

/**
 * Handles retrieving a specific dispensing record with items.
 */
async function getRecordById(req, res, next) {
  try {
    const { id } = req.params;
    const record = await dispensingService.getDispensingRecord(id, req.user.id);
    res.status(200).json(record);
  } catch (err) {
    next(err);
  }
}

module.exports = {
  dispense,
  getHistory,
  getRecordById,
};
