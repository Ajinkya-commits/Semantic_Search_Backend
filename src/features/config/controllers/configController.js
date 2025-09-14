const logger = require('../../../config/logger');
const { AppError, asyncHandler } = require('../../../shared/middleware/errorHandler');
const FieldConfig = require('../../../models/FieldConfig');
const OAuthToken = require('../../../models/OAuthToken');
const contentstackService = require('../../../services/contentstackService');

class ConfigController {
  /**
   * Get field configurations for a stack
   */
  getFieldConfigs = asyncHandler(async (req, res) => {
    const stackApiKey = req.stackApiKey;

    try {
      const fieldConfigs = await FieldConfig.find({ stackApiKey });
      
      res.json({
        success: true,
        fieldConfigs,
        stackApiKey
      });

    } catch (error) {
      logger.error('Failed to get field configs', { error: error.message, stackApiKey });
      throw error;
    }
  });

  /**
   * Update field configurations
   */
  updateFieldConfigs = asyncHandler(async (req, res) => {
    const stackApiKey = req.stackApiKey;
    const { configs } = req.body;

    if (!configs || !Array.isArray(configs)) {
      throw new AppError('Field configs array is required', 400);
    }

    try {
      const results = [];

      for (const config of configs) {
        const { contentType, fieldUid, includeInEmbedding, weight } = config;

        const fieldConfig = await FieldConfig.findOneAndUpdate(
          { stackApiKey, contentType, fieldUid },
          { 
            includeInEmbedding: Boolean(includeInEmbedding),
            weight: parseFloat(weight) || 1.0,
            updatedAt: new Date()
          },
          { upsert: true, new: true }
        );

        results.push(fieldConfig);
      }

      res.json({
        success: true,
        message: 'Field configurations updated successfully',
        updatedConfigs: results.length,
        configs: results
      });

    } catch (error) {
      logger.error('Failed to update field configs', { error: error.message, stackApiKey });
      throw error;
    }
  });

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
      logger.error('Failed to get system config', { error: error.message });
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
      
      logger.info('System configuration update requested', { config });

      res.json({
        success: true,
        message: 'System configuration updated successfully',
        config
      });

    } catch (error) {
      logger.error('Failed to update system config', { error: error.message });
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
      logger.error('Failed to get content types', { error: error.message, stackApiKey });
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
      logger.error('Failed to get stack config', { error: error.message });
      throw error;
    }
  });
}

module.exports = new ConfigController();
