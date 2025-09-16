const { AppError, asyncHandler } = require('../../../shared/middleware/errorHandler');
const indexingService = require('../../../services/indexingService');
const vectorSearchService = require('../../../services/vectorSearchService');
const contentstackService = require('../../../services/contentstackService');
const pineconeIndexService = require('../../../services/pineconeIndexService');

class IndexingController {

  reindexEntries = asyncHandler(async (req, res) => {
    const stackApiKey = req.stackApiKey;
    const { environment = 'development', batchSize = 50 } = req.body;

    console.info('Starting reindexing process', { stackApiKey, environment, batchSize });

    try {
      const result = await indexingService.reindexAllEntries(stackApiKey, environment, {
        batchSize: parseInt(batchSize),
        onProgress: (progress) => {
         
          console.info('Reindexing progress', progress);
        }
      });

      res.json({
        success: true,
        message: 'Reindexing completed successfully',
        result: {
          totalProcessed: result.totalProcessed,
          totalIndexed: result.totalIndexed,
          errors: result.errors,
          duration: result.duration
        }
      });

    } catch (error) {
      console.error('Reindexing failed', { error: error.message, stackApiKey });
      throw error;
    }
  });


  getIndexingStatus = asyncHandler(async (req, res) => {
    const stackApiKey = req.stackApiKey;

    try {
      const [indexStats, indexingStatus] = await Promise.all([
        vectorSearchService.getIndexStats(),
        indexingService.getIndexingStatus(stackApiKey)
      ]);

      res.json({
        success: true,
        indexStats,
        indexingStatus,
        stackApiKey
      });

    } catch (error) {
      console.error('Failed to get indexing status', { error: error.message });
      throw error;
    }
  });


  clearIndex = asyncHandler(async (req, res) => {
    const stackApiKey = req.stackApiKey;

    console.warn('Clearing index', { stackApiKey });

    try {
      await vectorSearchService.clearIndex(stackApiKey);

      res.json({
        success: true,
        message: 'Index cleared successfully',
        stackApiKey
      });

    } catch (error) {
      console.error('Failed to clear index', { error: error.message, stackApiKey });
      throw error;
    }
  });

  /**
   * Batch index specific entries
   */
  batchIndex = asyncHandler(async (req, res) => {
    const stackApiKey = req.stackApiKey;
    const { entries, environment = 'development' } = req.body;

    if (!entries || !Array.isArray(entries) || entries.length === 0) {
      throw new AppError('Entries array is required and must not be empty', 400);
    }

    console.info('Starting batch indexing', { 
      stackApiKey, 
      environment, 
      entryCount: entries.length 
    });

    try {
      const result = await indexingService.batchIndexEntries(
        stackApiKey, 
        entries, 
        environment
      );

      res.json({
        success: true,
        message: 'Batch indexing completed',
        result: {
          processed: result.processed,
          indexed: result.indexed,
          errors: result.errors
        }
      });

    } catch (error) {
      console.error('Batch indexing failed', { error: error.message, stackApiKey });
      throw error;
    }
  });
}

module.exports = new IndexingController();
