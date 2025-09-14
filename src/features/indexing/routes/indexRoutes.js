const express = require('express');
const router = express.Router();
const indexingController = require('../controllers/indexingController');
const { authenticateStack } = require('../../../shared/middleware/auth');

// Reindexing routes
router.post('/reindex', 
  authenticateStack, 
  indexingController.reindexEntries
);

router.get('/status', 
  authenticateStack, 
  indexingController.getIndexingStatus
);

router.delete('/clear', 
  authenticateStack, 
  indexingController.clearIndex
);

// Batch operations
router.post('/batch', 
  authenticateStack, 
  indexingController.batchIndex
);

module.exports = router;
