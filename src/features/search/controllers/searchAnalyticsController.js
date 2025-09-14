const logger = require('../../../config/logger');
const { AppError, asyncHandler } = require('../../../shared/middleware/errorHandler');
const vectorSearchService = require('../../../services/vectorSearchService');
const SearchLog = require('../../../models/SearchLog');

class SearchAnalyticsController {
  /**
   * Get search analytics
   */
  getSearchAnalytics = asyncHandler(async (req, res) => {
    const stackApiKey = req.stackApiKey;
    const days = req.query.days || 7;
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - parseInt(days));

    try {
      const [stats, popularQueries, errorStats] = await Promise.all([
        SearchLog.getSearchStats(stackApiKey, startDate, endDate),
        SearchLog.getPopularQueries(stackApiKey, 10, startDate, endDate),
        SearchLog.getErrorStats(stackApiKey, startDate, endDate),
      ]);

      res.json({
        period: {
          startDate,
          endDate,
          days: parseInt(days),
        },
        stats: stats[0] || {
          totalSearches: 0,
          successfulSearches: 0,
          averageResponseTime: 0,
          averageResultsCount: 0,
        },
        popularQueries,
        errorStats,
      });

    } catch (error) {
      logger.error('Failed to get search analytics', {
        error: error.message,
        stackApiKey,
        days,
      });
      throw error;
    }
  });

  /**
   * Get search statistics
   */
  getSearchStats = asyncHandler(async (req, res) => {
    try {
      const stats = await vectorSearchService.getIndexStats();
      
      res.json({
        success: true,
        stats,
        capabilities: {
          textSearch: true,
          imageSearch: true,
          hybridSearch: true,
          uploadSearch: true
        }
      });

    } catch (error) {
      logger.error('Failed to get search stats', { error: error.message });
      throw error;
    }
  });
}

module.exports = new SearchAnalyticsController();
