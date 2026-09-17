const express = require('express');
const router = express.Router();
const alertController = require('../controllers/alertController');
const authMiddleware = require('../middleware/authMiddleware');

// Alert routes require authentication
router.use(authMiddleware);

router.get('/expiring', alertController.getExpiringAlerts);

module.exports = router;
