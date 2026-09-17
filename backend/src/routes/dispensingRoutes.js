const express = require('express');
const router = express.Router();
const dispensingController = require('../controllers/dispensingController');
const authMiddleware = require('../middleware/authMiddleware');

// All dispensing routes require authentication
router.use(authMiddleware);

// Transactional dispensing
router.post('/dispense', dispensingController.dispense);

// Dispensing history
router.get('/dispensing', dispensingController.getHistory);
router.get('/dispensing/:id', dispensingController.getRecordById);

module.exports = router;
