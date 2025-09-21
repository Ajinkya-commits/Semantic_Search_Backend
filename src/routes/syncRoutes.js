const express = require('express');
const syncController = require('../controllers/syncController');
const { autoDetectStackApiKey } = require('../middleware/auth');

const router = express.Router();

router.use(autoDetectStackApiKey);

// Keep only the routes that are actually used by the frontend
router.post('/index-all', syncController.indexAllEntries);
router.get('/stats', syncController.getIndexingStats);

module.exports = router;
