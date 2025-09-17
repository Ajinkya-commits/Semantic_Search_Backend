const { AppError, asyncHandler } = require('../../../shared/middleware/errorHandler');
const vectorSearchService = require('../../../services/vectorSearchService');
const SearchLog = require('../../../models/SearchLog');

class SearchAnalyticsController {
  /**
   * Get search analytics for dashboard display
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
        success: true,
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
      throw error;
    }
  });

  /**
   * Get search statistics and capabilities
   */
  getSearchStats = asyncHandler(async (req, res) => {
    const stackApiKey = req.stackApiKey;

    try {
      const stats = await vectorSearchService.getIndexStats(stackApiKey);
      
      res.json({
        success: true,
        stats,
        capabilities: {
          textSearch: true,
          imageSearch: true,
          hybridSearch: true,
          uploadSearch: true
        },
        indexInfo: {
          totalVectors: stats?.totalVectors || 0,
          dimensions: stats?.dimensions || 1536,
          lastUpdated: stats?.lastUpdated || null
        }
      });

    } catch (error) {
      throw error;
    }
  });

  /**
   * Get search performance metrics
   */
  getPerformanceMetrics = asyncHandler(async (req, res) => {
    const stackApiKey = req.stackApiKey;
    const hours = req.query.hours || 24;
    const endDate = new Date();
    const startDate = new Date();
    startDate.setHours(startDate.getHours() - parseInt(hours));

    try {
      const metrics = await SearchLog.aggregate([
        {
          $match: {
            stackApiKey,
            timestamp: { $gte: startDate, $lte: endDate }
          }
        },
        {
          $group: {
            _id: {
              $dateToString: {
                format: "%Y-%m-%d %H:00",
                date: "$timestamp"
              }
            },
            searchCount: { $sum: 1 },
            avgResponseTime: { $avg: "$responseTime" },
            successRate: {
              $avg: {
                $cond: [{ $eq: ["$success", true] }, 1, 0]
              }
            }
          }
        },
        { $sort: { _id: 1 } }
      ]);

      res.json({
        success: true,
        period: {
          startDate,
          endDate,
          hours: parseInt(hours)
        },
        metrics
      });

    } catch (error) {
      throw error;
    }
  });
}

module.exports = new SearchAnalyticsController();
