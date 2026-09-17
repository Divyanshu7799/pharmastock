const express = require('express');
const router = express.Router();
const batchController = require('../controllers/batchController');
const authMiddleware = require('../middleware/authMiddleware');

// Batch routes require authentication
router.use(authMiddleware);

// Twist 2 (T4): Messy Data Batch Import
router.post('/import', batchController.importBatches);

router.put('/:id', batchController.updateBatch);
router.delete('/:id', batchController.deleteBatch);

module.exports = router;
