const { AppError, asyncHandler } = require('../../../shared/middleware/errorHandler');
const embeddingsService = require('../../../services/embeddingsService');
const vectorSearchService = require('../../../services/vectorSearchService');
const contentstackService = require('../../../services/contentstackService');
const rerankerService = require('../../../services/rerankerService');
const OAuthToken = require('../../../models/OAuthToken');
const SearchLog = require('../../../models/SearchLog');
const { enrichResultsWithContentstackData, logSearch } = require('../../../shared/utils/searchHelpers');

class TextSearchController {
  /**
   * Perform semantic search with reranking
   */
  semanticSearch = asyncHandler(async (req, res) => {
    const startTime = Date.now();
    const { query, topK = 5, filters = {} } = req.body;
    const environment = req.query.environment || 'development';
    const stackApiKey = req.stackApiKey;

    try {
      console.log('Semantic search request', {
        query: query.substring(0, 100),
        topK,
        filters,
        environment,
        stackApiKey,
      });

      const queryEmbedding = await embeddingsService.generateTextEmbedding(query, 'search_query');

      if (!queryEmbedding) {
        throw new AppError('Failed to generate query embedding', 500);
      }

      const metadataFilters = this.buildMetadataFilters(filters);

      if (stackApiKey) {
        await vectorSearchService.setStackIndex(stackApiKey);
      }

      const vectorResults = await vectorSearchService.search(
        queryEmbedding, 
        Math.min(topK * 2, 20), 
        metadataFilters, 
        0.1
      );

      if (!vectorResults || vectorResults.length === 0) {
        await logSearch(req, query, 0, filters, Date.now() - startTime, true);
        
        return res.json({
          query,
          results: [],
          message: 'No matching entries found.',
          metadata: {
            totalResults: 0,
            searchTime: Date.now() - startTime,
            environment,
          },
        });
      }

      const rerankedResults = await rerankerService.rerankResults(query, vectorResults, topK);
      const fullResults = await enrichResultsWithContentstackData(rerankedResults, stackApiKey, environment);
      const responseTime = Date.now() - startTime;

      await logSearch(req, query, fullResults.length, filters, responseTime, true);

      res.json({
        query,
        results: fullResults,
        metadata: {
          totalResults: fullResults.length,
          searchTime: responseTime,
          environment,
          reranked: true,
        },
      });

    } catch (error) {
      const responseTime = Date.now() - startTime;
      await logSearch(req, query, 0, filters, responseTime, false, error.message);
      
      console.error('Semantic search failed', {
        query,
        error: error.message,
        responseTime,
      });
      
      throw error;
    }
  });

  /**
   * Basic text-based semantic search
   */
  searchText = asyncHandler(async (req, res) => {
    const { query, limit = 10, threshold = 0.0, filters = {} } = req.body;

    if (!query || typeof query !== 'string') {
      throw new AppError('Query must be a non-empty string', 400);
    }

    console.log('Text search request', { query, limit, threshold });

    // Generate text embedding
    const queryEmbedding = await embeddingsService.generateTextEmbedding(query, 'search_query');

    // Search for similar text content
    const results = await vectorSearchService.search(
      queryEmbedding,
      parseInt(limit),
      { type: 'text', ...filters },
      parseFloat(threshold)
    );

    res.json({
      success: true,
      query,
      results,
      count: results.length,
      searchType: 'text'
    });
  });

  /**
   * Get all entries for a stack (for debugging/exploration)
   */
  getAllEntries = asyncHandler(async (req, res) => {
    const environment = req.query.environment || 'development';
    const stackApiKey = req.stackApiKey;

    try {
      const entriesByContentType = await contentstackService.fetchAllEntries(stackApiKey, environment);

      console.log(`Fetched entries for stack: ${stackApiKey}`, {
        contentTypes: entriesByContentType.length,
        totalEntries: entriesByContentType.reduce((sum, ct) => sum + ct.entries.length, 0),
      });

      res.json({
        stackApiKey,
        entries: entriesByContentType,
        metadata: {
          environment,
          timestamp: new Date().toISOString(),
        },
      });

    } catch (error) {
      console.error('Failed to fetch all entries', {
        error: error.message,
        environment,
      });
      throw error;
    }
  });

  /**
   * Build metadata filters from request
   */
  buildMetadataFilters(filters) {
    const validFilters = {};
    
    for (const key in filters) {
      if (filters[key] != null && filters[key] !== '') {
        validFilters[key] = filters[key];
      }
    }
    
    return validFilters;
  }
}

module.exports = new TextSearchController();
