const express = require('express');
const router = express.Router();
const textSearchController = require('../controllers/textSearchController');
const searchAnalyticsController = require('../controllers/searchAnalyticsController');
const syncController = require('../controllers/syncController');
const { authenticateStack } = require('../middleware/auth');

router.post('/text', authenticateStack, textSearchController.searchText);
router.post('/semantic', authenticateStack, textSearchController.semanticSearch);
router.get('/entries', authenticateStack, textSearchController.getAllEntries);

router.get('/analytics', authenticateStack, searchAnalyticsController.getSearchAnalytics);
router.get('/stats', authenticateStack, searchAnalyticsController.getSearchStats);

router.get('/sync/stats', authenticateStack, syncController.getIndexingStats);

module.exports = router;
