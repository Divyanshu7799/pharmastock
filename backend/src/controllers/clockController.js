const clockService = require('../services/clockService');

/**
 * Handles POST /clock automation trigger.
 */
async function processClock(req, res, next) {
  try {
    const result = await clockService.processClock();
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
}

module.exports = {
  processClock,
};
