const alertService = require('../services/alertService');

/**
 * Retrieves batches expiring soon.
 */
async function getExpiringAlerts(req, res, next) {
  try {
    const { days } = req.query;
    const alerts = await alertService.getExpiringAlerts(days);
    res.status(200).json(alerts);
  } catch (err) {
    next(err);
  }
}

module.exports = {
  getExpiringAlerts,
};
