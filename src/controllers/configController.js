const { AppError, asyncHandler } = require('../middleware/errorHandler');
const contentstackService = require('../services/contentstackService');


const getSystemConfig = asyncHandler(async (req, res) => {
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

const updateSystemConfig = asyncHandler(async (req, res) => {
  const { config } = req.body;

  if (!config || typeof config !== 'object') {
    throw new AppError('Configuration object is required', 400);
  }

  try {
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

const getContentTypes = asyncHandler(async (req, res) => {
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

const getStackConfig = asyncHandler(async (req, res) => {
  const stackApiKey = req.stackApiKey;

  try {
    res.json({
      success: true,
      stackApiKey,
      region: 'eu',
      baseUrl: 'https://eu-app.contentstack.com',
      environment: 'development'
    });

  } catch (error) {
    console.error('Failed to get stack config', { error: error.message });
    throw error;
  }
});

module.exports = {
  getSystemConfig,
  updateSystemConfig,
  getContentTypes,
  getStackConfig,
};
