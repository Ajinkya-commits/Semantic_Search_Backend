const express = require('express');
const router = express.Router();
const textSearchController = require('../controllers/textSearchController');
const searchAnalyticsController = require('../controllers/searchAnalyticsController');
const syncController = require('../controllers/syncController');
const { authenticateStack } = require('../middleware/auth');

// Text search routes
router.post('/text', authenticateStack, textSearchController.searchText);
router.post('/semantic', authenticateStack, textSearchController.semanticSearch);
router.get('/entries', authenticateStack, textSearchController.getAllEntries);

// Analytics routes
router.get('/analytics', authenticateStack, searchAnalyticsController.getSearchAnalytics);
router.get('/stats', authenticateStack, searchAnalyticsController.getSearchStats);
router.get('/performance', authenticateStack, searchAnalyticsController.getPerformanceMetrics);

// Sync routes
router.get('/sync/stats', authenticateStack, syncController.getIndexingStats);

module.exports = router;
