const jwt = require('jsonwebtoken');

/**
 * Middleware to authenticate requests using a Bearer JWT token.
 */
function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({
      error: 'Authentication required. Please provide a Bearer token in the Authorization header.',
    });
  }

  const token = authHeader.split(' ')[1];
  const secret = process.env.JWT_SECRET || 'pharmastock_dev_secret_key_2026_secure';

  try {
    const decoded = jwt.verify(token, secret);
    req.user = {
      id: decoded.id,
      name: decoded.name,
      email: decoded.email,
    };
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({
        error: 'Authentication token has expired. Please log in again.',
      });
    }
    return res.status(401).json({
      error: 'Invalid authentication token.',
    });
  }
}

module.exports = authMiddleware;
