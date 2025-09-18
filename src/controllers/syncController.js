const { AppError, asyncHandler } = require('../middleware/errorHandler');
const indexingService = require('../services/indexingService');
const vectorSearchService = require('../services/vectorSearchService');

const indexAllEntries = asyncHandler(async (req, res) => {
  const stackApiKey = req.stackApiKey;
  const { environment = 'development', contentType } = req.body;

  try {
    console.log('Starting indexing with:', { stackApiKey, environment, contentType });
    
    const results = await indexingService.indexAllEntries(
      stackApiKey,
      environment,
      { contentType }
    );

    console.log('Indexing completed with results:', results);
    res.json({
      success: true,
      message: 'Indexing completed',
      results: {
        ...results,
        errorDetails: results.errorsList ? results.errorsList.slice(0, 5) : []
      }
    });

  } catch (error) {
    console.error('Indexing failed:', error);
    throw error;
  }
});

const indexEntry = asyncHandler(async (req, res) => {
  const stackApiKey = req.stackApiKey;
  const { entry, contentType } = req.body;

  if (!entry || !contentType) {
    throw new AppError('Entry and contentType are required', 400);
  }

  try {
    console.log('Indexing single entry:', { entryUid: entry.uid, contentType });
    
    const success = await indexingService.indexEntry(entry, contentType, stackApiKey);

    if (success) {
      res.json({
        success: true,
        message: `Entry indexed successfully: ${entry.uid}`
      });
    } else {
      res.json({
        success: false,
        message: `Entry could not be indexed: ${entry.uid} (likely no text content)`
      });
    }

  } catch (error) {
    console.error('Single entry indexing failed:', error);
    throw error;
  }
});

const removeEntry = asyncHandler(async (req, res) => {
  const stackApiKey = req.stackApiKey;
  const { entryUid } = req.body;

  if (!entryUid) {
    throw new AppError('Entry UID is required', 400);
  }

  try {
    await vectorSearchService.setStackIndex(stackApiKey);
    const success = await indexingService.removeEntry(entryUid);

    if (success) {
      res.json({
        success: true,
        message: `Entry removed from index: ${entryUid}`
      });
    } else {
      res.json({
        success: false,
        message: `Entry could not be removed: ${entryUid}`
      });
    }

  } catch (error) {
    throw error;
  }
});

const updateEntry = asyncHandler(async (req, res) => {
  const stackApiKey = req.stackApiKey;
  const { entry, contentType } = req.body;

  if (!entry || !contentType) {
    throw new AppError('Entry and contentType are required', 400);
  }

  try {
    const success = await indexingService.updateEntry(entry, contentType, stackApiKey);

    if (success) {
      res.json({
        success: true,
        message: `Entry updated in index: ${entry.uid}`
      });
    } else {
      res.json({
        success: false,
        message: `Entry could not be updated: ${entry.uid}`
      });
    }

  } catch (error) {
    throw error;
  }
});

const getIndexingStats = asyncHandler(async (req, res) => {
  const stackApiKey = req.stackApiKey;

  try {
    await vectorSearchService.setStackIndex(stackApiKey);
    const stats = await vectorSearchService.getIndexStats();
    const formattedStats = {
      totalVectors: stats?.totalVectorCount || stats?.vectorCount || 0,
      dimensions: stats?.dimension || 1536,
      indexFullness: stats?.indexFullness || 0,
      namespaces: stats?.namespaces || {},
      totalEntries: stats?.totalVectorCount || 0,
      lastUpdated: new Date().toISOString(),
      indexName: stats?.indexName || `semantic-search-${stackApiKey}`,
      status: 'ready'
    };

    res.json({
      success: true,
      stats: formattedStats,
      stackApiKey,
      totalVectors: formattedStats.totalVectors,
      dimensions: formattedStats.dimensions,
      indexInfo: {
        totalVectors: formattedStats.totalVectors,
        dimensions: formattedStats.dimensions,
        lastUpdated: formattedStats.lastUpdated
      }
    });

  } catch (error) {
    res.json({
      success: false,
      error: error.message,
      stats: {
        totalVectors: 0,
        dimensions: 1536,
        indexFullness: 0,
        namespaces: {},
        totalEntries: 0,
        lastUpdated: new Date().toISOString(),
        indexName: `semantic-search-${stackApiKey}`,
        status: 'error'
      },
      stackApiKey,
      totalVectors: 0,
      dimensions: 1536,
      indexInfo: {
        totalVectors: 0,
        dimensions: 1536,
        lastUpdated: new Date().toISOString()
      }
    });
  }
});

const clearIndex = asyncHandler(async (req, res) => {
  const stackApiKey = req.stackApiKey;

  try {
    await vectorSearchService.setStackIndex(stackApiKey);
    await vectorSearchService.clearIndex();

    res.json({
      success: true,
      message: `Index cleared for stack: ${stackApiKey}`
    });

  } catch (error) {
    throw error;
  }
});

module.exports = {
  indexAllEntries,
  indexEntry,
  removeEntry,
  updateEntry,
  getIndexingStats,
  clearIndex,
};