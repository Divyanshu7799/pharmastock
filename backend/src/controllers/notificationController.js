const notificationService = require('../services/notificationService');

/**
 * Handles GET /outbox endpoint.
 * Returns persisted notification records.
 */
async function getOutbox(req, res, next) {
  try {
    const { status, medicineId } = req.query;
    const records = await notificationService.getOutbox({ status, medicineId });
    res.status(200).json(records);
  } catch (err) {
    next(err);
  }
}

module.exports = {
  getOutbox,
};
