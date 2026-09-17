const express = require('express');
const router = express.Router();
const medicineController = require('../controllers/medicineController');
const batchController = require('../controllers/batchController');
const authMiddleware = require('../middleware/authMiddleware');

// All medicine and nested batch routes require authentication
router.use(authMiddleware);

// Medicine CRUD
router.get('/', medicineController.getMedicines);
router.post('/', medicineController.createMedicine);
router.get('/:id', medicineController.getMedicineById);
router.put('/:id', medicineController.updateMedicine);
router.delete('/:id', medicineController.deleteMedicine);

// Stock endpoint
router.get('/:id/stock', medicineController.getStock);

// Nested Batch routes under medicine
router.get('/:medicineId/batches', batchController.getBatchesByMedicine);
router.post('/:medicineId/batches', batchController.createBatch);

module.exports = router;
