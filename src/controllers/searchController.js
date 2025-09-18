const { AppError, asyncHandler } = require('../middleware/errorHandler');
const embeddingsService = require('../services/embeddingsService');
const imageEmbeddingService = require('../services/imageEmbeddingService');
const vectorSearchService = require('../services/vectorSearchService');
const contentstackService = require('../services/contentstackService');
const rerankerService = require('../services/rerankerService');
const { enrichResultsWithContentstackData, logSearch } = require('../utils/searchHelpers');
const multer = require('multer');

const searchText = asyncHandler(async (req, res) => {
  const startTime = Date.now();
  const { query, limit = 10, filters = {}, useReranking = true } = req.body;
  const environment = req.query.environment || 'development';
  const stackApiKey = req.stackApiKey;

  if (!query || typeof query !== 'string' || query.trim().length === 0) {
    throw new AppError('Query is required and must be a non-empty string', 400);
  }

  try {
    console.log('Semantic search request', {
      query: query.substring(0, 100),
      limit,
      filters,
      environment,
      stackApiKey: stackApiKey?.substring(0, 8) + '...',
    });

    const queryEmbedding = await embeddingsService.generateTextEmbedding(query, 'search_query');

    if (!queryEmbedding) {
      throw new AppError('Failed to generate query embedding', 500);
    }

    if (stackApiKey) {
      await vectorSearchService.setStackIndex(stackApiKey);
    }

    const vectorResults = await vectorSearchService.search(
      queryEmbedding, 
      Math.min(limit * 2, 20), 
      filters, 
      0.0, 
      stackApiKey
    );

    if (!vectorResults || vectorResults.length === 0) {
      await logSearch(req, query, 0, filters, Date.now() - startTime, true);
      
      return res.json({
        success: true,
        query,
        results: [],
        total: 0,
        message: 'No matching entries found.',
        metadata: {
          totalResults: 0,
          searchTime: Date.now() - startTime,
          environment,
          reranked: false
        },
      });
    }

    console.log(`Found ${vectorResults.length} vector results from Pinecone`);


    let processedResults = vectorResults;
    if (useReranking && vectorResults.length > 0) {
      try {
        console.log('Applying reranking...');
        processedResults = await rerankerService.rerankResults(query, vectorResults);
        console.log('Reranking completed');
      } catch (error) {
        console.warn('Reranking failed:', error.message);
        processedResults = vectorResults;
      }
    }

    const enrichedResults = await enrichResultsWithContentstackData(
      processedResults, 
      stackApiKey, 
      environment
    );

    const finalResults = enrichedResults.slice(0, limit);
    const responseTime = Date.now() - startTime;


    await logSearch(req, query, finalResults.length, filters, responseTime, true);

    console.log(`Search completed: ${finalResults.length} results in ${responseTime}ms`);

    res.json({
      success: true,
      query,
      results: finalResults,
      total: finalResults.length,
      reranked: useReranking,
      metadata: {
        totalResults: finalResults.length,
        searchTime: responseTime,
        environment,
        reranked: useReranking,
      },
    });

  } catch (error) {
    const responseTime = Date.now() - startTime;
    await logSearch(req, query, 0, filters, responseTime, false, error.message);
    
    console.error('Semantic search failed', {
      query: query.substring(0, 100),
      error: error.message,
      responseTime,
    });
    
    throw error;
  }
});

const semanticSearch = asyncHandler(async (req, res) => {
  const { query, limit = 10 } = req.body;
  const stackApiKey = req.stackApiKey;

  const queryEmbedding = await embeddingsService.generateTextEmbedding(query, 'search_query');

  const results = await vectorSearchService.search(
    queryEmbedding,
    limit,
    { type: 'text' },
    0.0,
    stackApiKey
  );

  res.json({
    success: true,
    query,
    results,
    total: results.length
  });
});

const getAllEntries = asyncHandler(async (req, res) => {
  const stackApiKey = req.stackApiKey;
  const { environment = 'development', contentType } = req.query;

  const entries = await contentstackService.fetchAllEntries(stackApiKey, environment, { contentType });

  res.json({
    success: true,
    entries,
    total: entries.reduce((sum, ct) => sum + ct.entries.length, 0)
  });
});

const searchByImage = asyncHandler(async (req, res) => {
  const { imageUrl, limit = 10, filters = {} } = req.body;
  const stackApiKey = req.stackApiKey;

  if (!imageUrl) {
    throw new AppError('Image URL is required', 400);
  }

  const queryEmbedding = await imageEmbeddingService.generateImageEmbedding(imageUrl);

  const results = await vectorSearchService.searchImages(
    queryEmbedding,
    limit,
    filters,
    0.0,
    stackApiKey
  );

  res.json({
    success: true,
    imageUrl,
    results,
    total: results.length
  });
});

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new AppError('Only image files are allowed', 400), false);
    }
  }
});

const searchByUploadedImage = asyncHandler(async (req, res) => {
  const { limit = 10, filters = {} } = req.body;
  const stackApiKey = req.stackApiKey;

  if (!req.file) {
    throw new AppError('Image file is required', 400);
  }

  const dataUri = `data:${req.file.mimetype};base64,${req.file.buffer.toString('base64')}`;
  
  const queryEmbedding = await imageEmbeddingService.generateImageEmbedding(dataUri);

  const results = await vectorSearchService.searchImages(
    queryEmbedding,
    limit,
    filters,
    0.0,
    stackApiKey
  );

  res.json({
    success: true,
    results,
    total: results.length
  });
});

const searchHybrid = asyncHandler(async (req, res) => {
  const { query, imageUrl, limit = 10, textWeight = 0.7, imageWeight = 0.3 } = req.body;
  const stackApiKey = req.stackApiKey;

  if (!query && !imageUrl) {
    throw new AppError('Either query or imageUrl is required', 400);
  }

  let queryEmbedding;
  if (query) {
    queryEmbedding = await embeddingsService.generateTextEmbedding(query, 'search_query');
  } else {
    queryEmbedding = await imageEmbeddingService.generateImageEmbedding(imageUrl);
  }

  const results = await vectorSearchService.searchHybrid(
    queryEmbedding,
    limit,
    {
      textWeight: parseFloat(textWeight),
      imageWeight: parseFloat(imageWeight),
      similarityThreshold: 0.0
    },
    stackApiKey
  );

  res.json({
    success: true,
    query,
    imageUrl,
    results,
    total: results.length
  });
});

const getSearchAnalytics = asyncHandler(async (req, res) => {
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
        totalVectors: stats.totalVectors,
        dimensions: stats.dimensions,
        lastUpdated: stats.lastUpdated
      }
    });

  } catch (error) {
    throw error;
  }
});

module.exports = {
  searchText,
  semanticSearch,
  getAllEntries,
  searchByImage,
  searchByUploadedImage,
  searchHybrid,
  getSearchAnalytics,
  uploadMiddleware: upload.single('image')
};
