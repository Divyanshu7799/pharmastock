const batchRepo = require('../repositories/batchRepository');

/**
 * Gets expiring soon batches within the specified window (default 30 days).
 * @param {string|number} days
 * @returns {Promise<Array>}
 */
async function getExpiringAlerts(days = 30) {
  const parsedDays = parseInt(days, 10);
  if (isNaN(parsedDays) || parsedDays <= 0 || parsedDays > 365) {
    const error = new Error('Days parameter must be a positive integer between 1 and 365');
    error.status = 400;
    throw error;
  }

  return batchRepo.getExpiringBatches(parsedDays);
}

module.exports = {
  getExpiringAlerts,
};
