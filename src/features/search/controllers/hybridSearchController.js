const logger = require('../../../config/logger');
const { AppError, asyncHandler } = require('../../../shared/middleware/errorHandler');
const embeddingsService = require('../../../services/embeddingsService');
const imageEmbeddingService = require('../../../services/imageEmbeddingService');
const vectorSearchService = require('../../../services/vectorSearchService');

class HybridSearchController {
  /**
   * Hybrid search combining text and image results
   */
  searchHybrid = asyncHandler(async (req, res) => {
    const { 
      query, 
      imageUrl,
      limit = 20, 
      threshold = 0.0, 
      textWeight = 0.7,
      imageWeight = 0.3,
      filters = {} 
    } = req.body;

    if (!query && !imageUrl) {
      throw new AppError('Either text query or image URL must be provided', 400);
    }

    logger.info('Hybrid search request', { 
      hasQuery: !!query, 
      hasImage: !!imageUrl, 
      limit, 
      textWeight, 
      imageWeight 
    });

    let queryEmbedding;

    if (query && imageUrl) {
      // Combine text and image embeddings (weighted average)
      const textEmbedding = await embeddingsService.generateTextEmbedding(query, 'search_query');
      const imageEmbedding = await imageEmbeddingService.generateImageEmbedding(imageUrl);
      
      // Weighted combination of embeddings
      queryEmbedding = textEmbedding.map((val, idx) => 
        val * textWeight + imageEmbedding[idx] * imageWeight
      );
    } else if (query) {
      // Text-only search
      queryEmbedding = await embeddingsService.generateTextEmbedding(query, 'search_query');
    } else {
      // Image-only search
      queryEmbedding = await imageEmbeddingService.generateImageEmbedding(imageUrl);
    }

    // Perform hybrid search
    const results = await vectorSearchService.searchHybrid(
      queryEmbedding,
      parseInt(limit),
      {
        textWeight: parseFloat(textWeight),
        imageWeight: parseFloat(imageWeight),
        similarityThreshold: parseFloat(threshold),
        metadataFilters: filters
      }
    );

    res.json({
      success: true,
      query: query || null,
      imageUrl: imageUrl || null,
      results,
      count: results.length,
      searchType: 'hybrid',
      weights: {
        text: parseFloat(textWeight),
        image: parseFloat(imageWeight)
      }
    });
  });
}

module.exports = new HybridSearchController();
