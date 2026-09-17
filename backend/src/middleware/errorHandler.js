/**
 * Centralized error-handling middleware.
 * Ensures consistent JSON responses without exposing internal stack traces.
 */
function errorHandler(err, req, res, next) {
  // Determine HTTP status code
  let statusCode = err.status || 500;
  let message = err.message || 'Internal Server Error';

  // Handle known MySQL error codes
  if (err.code === 'ER_DUP_ENTRY') {
    statusCode = 409;
    if (err.message.includes('uq_medicine_batch')) {
      message = 'A batch with this number already exists for this medicine.';
    } else if (err.message.includes('email')) {
      message = 'An account with this email already exists.';
    } else {
      message = 'Duplicate entry conflict.';
    }
  } else if (err.code === 'ER_NO_REFERENCED_ROW_2') {
    statusCode = 404;
    message = 'Referenced parent record does not exist.';
  } else if (err.code === 'ER_ROW_IS_REFERENCED_2') {
    statusCode = 409;
    message = 'Cannot delete or modify record because other records depend on it.';
  }

  // Only log unexpected server errors
  if (statusCode >= 500) {
    console.error(`[Error] ${req.method} ${req.originalUrl}:`, err);
  }

  const responsePayload = {
    message,
    error: message,
  };

  if (err.requestedQuantity !== undefined && err.availableQuantity !== undefined) {
    responsePayload.requestedQuantity = err.requestedQuantity;
    responsePayload.availableQuantity = err.availableQuantity;
  }

  res.status(statusCode).json(responsePayload);
}

module.exports = errorHandler;
