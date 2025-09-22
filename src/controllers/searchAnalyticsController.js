const { AppError, asyncHandler } = require('../middleware/errorHandler');
const vectorSearchService = require('../services/vectorSearchService');
const SearchLog = require('../models/SearchLog');


const getSearchAnalytics = asyncHandler(async (req, res) => {
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

const getSearchStats = asyncHandler(async (req, res) => {
  const stackApiKey = req.stackApiKey;

  try {
    const stats = await vectorSearchService.getIndexStats(stackApiKey);
    
    res.json({
      success: true,
      stats,
      capabilities: {
        textSearch: true,
        imageSearch: false,
        hybridSearch: false,
        uploadSearch: false
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


module.exports = {
  getSearchAnalytics,
  getSearchStats,
};
