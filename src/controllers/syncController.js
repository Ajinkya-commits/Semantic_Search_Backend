const { AppError, asyncHandler } = require('../shared/middleware/errorHandler');
const contentstackService = require('../services/contentstackService');
const indexingService = require('../services/indexingService');
const vectorSearchService = require('../services/vectorSearchService');

class SyncController {
  /**
   * Index all entries for a stack
   */
  indexAllEntries = asyncHandler(async (req, res) => {
    const environment = req.query.environment || 'development';
    const { contentType } = req.body;
    const stackApiKey = req.stackApiKey; // Now comes from middleware validation

    try {
      console.log('Starting full indexing', {
        stackApiKey,
        contentType,
        environment,
      });

      // Stack API key is now validated by middleware, so we can use it directly
      // Perform indexing
      const results = await indexingService.indexAllEntries(
        stackApiKey,
        environment,
        { contentType }
      );

      console.log('Full indexing completed', {
        stackApiKey,
        results,
      });

      res.json({
        status: 'success',
        message: 'Indexing completed successfully',
        results,
        metadata: {
          stackApiKey,
          environment,
          contentType,
          timestamp: new Date().toISOString(),
        },
      });
    } catch (error) {
      console.error('Full indexing failed', {
        stackApiKey,
        error: error.message,
      });
      throw error;
    }
  });

  /**
   * Index a specific entry
   */
  indexEntry = asyncHandler(async (req, res) => {
    const { contentType, entryUid } = req.body;
    const stackApiKey = req.stackApiKey; // Now comes from middleware validation
    const environment = req.query.environment || 'development';

    try {
      if (!contentType || !entryUid) {
        throw new AppError('Content type and entry UID are required', 400);
      }

      // Stack API key and token are now validated by middleware

      // Fetch the specific entry
      const entry = await contentstackService.fetchEntryByUid(
        stackApiKey,
        contentType,
        entryUid,
        environment
      );

      if (!entry) {
        throw new AppError('Entry not found', 404);
      }

      // Index the entry
      const success = await indexingService.indexEntry(entry, contentType, stackApiKey);

      if (success) {
        console.log(`Entry indexed successfully: ${entryUid}`);
        res.json({
          status: 'success',
          message: 'Entry indexed successfully',
          entryUid,
          contentType,
          metadata: {
            stackApiKey,
            environment,
            timestamp: new Date().toISOString(),
          },
        });
      } else {
        res.json({
          status: 'skipped',
          message: 'Entry was skipped (no text content)',
          entryUid,
          contentType,
          metadata: {
            stackApiKey,
            environment,
            timestamp: new Date().toISOString(),
          },
        });
      }
    } catch (error) {
      console.error('Entry indexing failed', {
        entryUid,
        contentType,
        stackApiKey,
        error: error.message,
      });
      throw error;
    }
  });

  /**
   * Remove entry from index
   */
  removeEntry = asyncHandler(async (req, res) => {
    const { entryUid } = req.body;
    const stackApiKey = req.stackApiKey; // Now comes from middleware validation

    try {
      if (!entryUid) {
        throw new AppError('Entry UID is required', 400);
      }

      // Set the correct index for the stack
      await vectorSearchService.setStackIndex(stackApiKey);

      // Remove the entry
      const success = await indexingService.removeEntry(entryUid);

      if (success) {
        console.log(`Entry removed from index: ${entryUid}`);
        res.json({
          status: 'success',
          message: 'Entry removed from index',
          entryUid,
          metadata: {
            stackApiKey,
            timestamp: new Date().toISOString(),
          },
        });
      } else {
        throw new AppError('Failed to remove entry from index', 500);
      }
    } catch (error) {
      console.error('Entry removal failed', {
        entryUid,
        stackApiKey,
        error: error.message,
      });
      throw error;
    }
  });

  /**
   * Update entry in index
   */
  updateEntry = asyncHandler(async (req, res) => {
    const { contentType, entryUid } = req.body;
    const stackApiKey = req.stackApiKey; // Now comes from middleware validation
    const environment = req.query.environment || 'development';

    try {
      if (!contentType || !entryUid) {
        throw new AppError('Content type and entry UID are required', 400);
      }

      // Stack API key and token are now validated by middleware

      // Fetch the updated entry
      const entry = await contentstackService.fetchEntryByUid(
        stackApiKey,
        contentType,
        entryUid,
        environment
      );

      if (!entry) {
        // Entry was deleted, remove from index
        await vectorSearchService.setStackIndex(stackApiKey);
        await indexingService.removeEntry(entryUid);
        console.log(`Entry deleted, removed from index: ${entryUid}`);
        
        res.json({
          status: 'success',
          message: 'Entry was deleted and removed from index',
          entryUid,
          contentType,
          metadata: {
            stackApiKey,
            environment,
            timestamp: new Date().toISOString(),
          },
        });
        return;
      }

      // Update the entry in the index
      const success = await indexingService.updateEntry(entry, contentType, stackApiKey);

      if (success) {
        console.log(`Entry updated in index: ${entryUid}`);
        res.json({
          status: 'success',
          message: 'Entry updated in index',
          entryUid,
          contentType,
          metadata: {
            stackApiKey,
            environment,
            timestamp: new Date().toISOString(),
          },
        });
      } else {
        res.json({
          status: 'skipped',
          message: 'Entry was skipped (no text content)',
          entryUid,
          contentType,
          metadata: {
            stackApiKey,
            environment,
            timestamp: new Date().toISOString(),
          },
        });
      }
    } catch (error) {
      console.error('Entry update failed', {
        entryUid,
        contentType,
        stackApiKey,
        error: error.message,
      });
      throw error;
    }
  });

  /**
   * Get indexing statistics for a specific stack
   */
  getIndexingStats = asyncHandler(async (req, res) => {
    const stackApiKey = req.stackApiKey; // Now comes from middleware validation

    try {
      // Set the correct index for the stack
      await vectorSearchService.setStackIndex(stackApiKey);

      // Get index statistics
      const stats = await vectorSearchService.getIndexStats();

      console.log('Index statistics retrieved', {
        stackApiKey,
        stats,
      });

      res.json({
        status: 'success',
        data: {
          stackApiKey,
          indexStats: stats,
          timestamp: new Date().toISOString(),
        },
      });
    } catch (error) {
      console.error('Failed to get indexing stats', {
        stackApiKey,
        error: error.message,
      });
      throw error;
    }
  });

  /**
   * Clear entire stack-specific index (use with caution!)
   */
  clearIndex = asyncHandler(async (req, res) => {
    const stackApiKey = req.stackApiKey; // Now comes from middleware validation

    try {
      // Set the correct index for the stack
      await vectorSearchService.setStackIndex(stackApiKey);

      // Clear the index
      await vectorSearchService.clearIndex();

      console.log(`Index cleared for stack: ${stackApiKey}`);

      res.json({
        status: 'success',
        message: 'Index cleared successfully',
        warning: 'This action cannot be undone!',
        metadata: {
          stackApiKey,
          timestamp: new Date().toISOString(),
        },
      });
    } catch (error) {
      console.error('Failed to clear index', {
        stackApiKey,
        error: error.message,
      });
      throw error;
    }
  });
}

const syncController = new SyncController();
module.exports = syncController;