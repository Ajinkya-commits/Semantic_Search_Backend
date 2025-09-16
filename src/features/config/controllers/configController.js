const { AppError, asyncHandler } = require('../../../shared/middleware/errorHandler');
const OAuthToken = require('../../../models/OAuthToken');
const contentstackService = require('../../../services/contentstackService');

class ConfigController {
  /**
   * Get system configuration
   */
  getSystemConfig = asyncHandler(async (req, res) => {
    try {
      const config = {
        embedding: {
          model: process.env.OPENAI_MODEL || 'text-embedding-3-small',
          dimensions: parseInt(process.env.EMBEDDING_DIMENSIONS) || 1536,
          batchSize: parseInt(process.env.EMBEDDING_BATCH_SIZE) || 100
        },
        vectorSearch: {
          provider: process.env.VECTOR_DB_PROVIDER || 'pinecone',
          topK: parseInt(process.env.DEFAULT_TOP_K) || 10,
          threshold: parseFloat(process.env.DEFAULT_THRESHOLD) || 0.1
        },
        indexing: {
          batchSize: parseInt(process.env.INDEXING_BATCH_SIZE) || 50,
          maxRetries: parseInt(process.env.MAX_RETRIES) || 3
        }
      };

      res.json({
        success: true,
        config
      });

    } catch (error) {
      console.error('Failed to get system config', { error: error.message });
      throw error;
    }
  });

  /**
   * Update system configuration
   */
  updateSystemConfig = asyncHandler(async (req, res) => {
    const { config } = req.body;

    if (!config || typeof config !== 'object') {
      throw new AppError('Configuration object is required', 400);
    }

    try {
      // In a real implementation, you'd save this to a database or config file
      // For now, we'll just validate and return the config
      
      console.log('System configuration update requested', { config });

      res.json({
        success: true,
        message: 'System configuration updated successfully',
        config
      });

    } catch (error) {
      console.error('Failed to update system config', { error: error.message });
      throw error;
    }
  });

  /**
   * Get content types for a stack
   */
  getContentTypes = asyncHandler(async (req, res) => {
    const stackApiKey = req.stackApiKey;
    const environment = req.query.environment || 'development';

    try {
      const contentTypes = await contentstackService.fetchContentTypes(stackApiKey, environment);
      
      res.json({
        success: true,
        contentTypes,
        count: contentTypes.length,
        stackApiKey,
        environment
      });

    } catch (error) {
      console.error('Failed to get content types', { error: error.message, stackApiKey });
      throw error;
    }
  });

  /**
   * Get stack configuration from OAuth tokens
   */
  getStackConfig = asyncHandler(async (req, res) => {
    try {
      // Find the most recent active OAuth token record
      const oauthToken = await OAuthToken.findOne({ 
        isActive: true,
        expiresAt: { $gt: new Date() }
      }).sort({ createdAt: -1 });
      
      if (!oauthToken) {
        return res.status(404).json({
          success: false,
          message: 'No active OAuth token found. Please reinstall the app.'
        });
      }

      res.json({
        stackApiKey: oauthToken.stackApiKey,
        managementToken: oauthToken.managementToken,
        environment: 'development' // Default environment
      });

    } catch (error) {
      console.error('Failed to get stack config', { error: error.message });
      throw error;
    }
  });
}

module.exports = new ConfigController();
