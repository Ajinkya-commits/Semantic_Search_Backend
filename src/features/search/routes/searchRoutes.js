const express = require('express');
const router = express.Router();
const textSearchController = require('../controllers/textSearchController');
const imageSearchController = require('../controllers/imageSearchController');
const hybridSearchController = require('../controllers/hybridSearchController');
const searchAnalyticsController = require('../controllers/searchAnalyticsController');
const { validateSearchRequest } = require('../middleware/searchValidation');
const { authenticateStack } = require('../../../shared/middleware/auth');

// Text-based search routes
router.post('/text', 
  authenticateStack, 
  validateSearchRequest, 
  textSearchController.searchText
);

router.post('/semantic', 
  authenticateStack, 
  validateSearchRequest, 
  textSearchController.semanticSearch
);

// Image-based search routes
router.post('/image', 
  authenticateStack, 
  validateSearchRequest, 
  imageSearchController.searchByImage
);

router.post('/upload', 
  authenticateStack, 
  imageSearchController.uploadMiddleware,
  imageSearchController.searchByUploadedImage
);

// Hybrid search routes
router.post('/hybrid', 
  authenticateStack, 
  validateSearchRequest, 
  hybridSearchController.searchHybrid
);

// Analytics routes for frontend dashboard
router.get('/analytics', 
  authenticateStack, 
  searchAnalyticsController.getSearchAnalytics
);

router.get('/stats', 
  authenticateStack, 
  searchAnalyticsController.getSearchStats
);

router.get('/performance', 
  authenticateStack, 
  searchAnalyticsController.getPerformanceMetrics
);

// Debug route to check indexed images
router.get('/debug/images', 
  authenticateStack, 
  async (req, res) => {
    try {
      const vectorSearchService = require('../../../services/vectorSearchService');
      const OAuthToken = require('../../../models/OAuthToken');
      
      // Get stackApiKey from MongoDB
      const oauthToken = await OAuthToken.findOne({ 
        isActive: true,
        expiresAt: { $gt: new Date() }
      }).sort({ createdAt: -1 });
      
      if (!oauthToken) {
        return res.status(404).json({ error: 'No active OAuth token found' });
      }
      
      const stackApiKey = oauthToken.stackApiKey;
      const stats = await vectorSearchService.getIndexStats(stackApiKey);
      
      res.json({
        success: true,
        indexStats: stats,
        stackApiKey: stackApiKey
      });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }
);

// Debug route to check recent search logs
router.get('/debug/logs', 
  authenticateStack, 
  async (req, res) => {
    try {
      const SearchLog = require('../../../models/SearchLog');
      const stackApiKey = req.stackApiKey;
      
      const recentLogs = await SearchLog.find({ stackApiKey })
        .sort({ createdAt: -1 })
        .limit(10)
        .select('query stackApiKey resultsCount responseTime success createdAt');
      
      const totalLogs = await SearchLog.countDocuments({ stackApiKey });
      
      res.json({
        success: true,
        totalLogs,
        recentLogs,
        stackApiKey
      });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }
);

// Utility routes
router.get('/entries', 
  authenticateStack, 
  textSearchController.getAllEntries
);

module.exports = router;
