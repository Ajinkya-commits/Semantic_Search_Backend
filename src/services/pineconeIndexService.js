const { Pinecone } = require('@pinecone-database/pinecone');
const config = require('../config');
const logger = require('../config/logger');
const { AppError } = require('../shared/middleware/errorHandler');

class PineconeIndexService {
  constructor() {
    this.apiKey = config.apis.pinecone.apiKey;
    this.environment = config.apis.pinecone.environment;
    this.pinecone = null;
    this.isInitialized = false;
  }

  async initialize() {
    if (this.isInitialized) {
      return;
    }

    try {
      logger.info('Initializing Pinecone connection for index management...');
      
      this.pinecone = new Pinecone({ 
        apiKey: this.apiKey,
      });
      
      this.isInitialized = true;
      logger.info('✅ Pinecone connection initialized for index management');
    } catch (error) {
      logger.error('❌ Failed to initialize Pinecone connection', {
        error: error.message,
      });
      throw new AppError('Failed to initialize Pinecone index service', 500);
    }
  }

  async ensureInitialized() {
    if (!this.isInitialized) {
      await this.initialize();
    }
  }

  generateIndexName(stackApiKey) {
    if (!stackApiKey || typeof stackApiKey !== 'string') {
      throw new AppError('Stack API key is required', 400);
    }

 
    const safeStackKey = stackApiKey.replace(/[^a-zA-Z0-9]/g, '');
    const indexName = `semantic-search-${safeStackKey}`;
    return indexName.toLowerCase().substring(0, 45);
  }

  async indexExists(indexName) {
    await this.ensureInitialized();

    try {
      const indexList = await this.pinecone.listIndexes();
      return indexList.indexes.some(index => index.name === indexName);
    } catch (error) {
      logger.error('Failed to check if index exists', {
        indexName,
        error: error.message,
      });
      throw new AppError('Failed to check index existence', 500);
    }
  }


  async createStackIndex(stackApiKey) {
    await this.ensureInitialized();

    const indexName = this.generateIndexName(stackApiKey);
    
    try {
      // Check if index already exists
      const exists = await this.indexExists(indexName);
      if (exists) {
        logger.info(`Index ${indexName} already exists for stack ${stackApiKey}`);
        return {
          success: true,
          indexName,
          message: 'Index already exists',
          created: false,
        };
      }

      logger.info(`Creating new Pinecone index: ${indexName} for stack: ${stackApiKey}`);

      // Create the index with appropriate configuration
      await this.pinecone.createIndex({
        name: indexName,
        dimension: 1536, // Cohere embedding dimension
        metric: 'cosine',
        spec: {
          serverless: {
            cloud: 'aws',
            region: this.environment || 'us-east-1',
          },
        },
      });

      // Wait for index to be ready
      await this.waitForIndexReady(indexName);

      logger.info(`✅ Successfully created index: ${indexName} for stack: ${stackApiKey}`);

      return {
        success: true,
        indexName,
        message: 'Index created successfully',
        created: true,
      };
    } catch (error) {
      logger.error('Failed to create stack index', {
        stackApiKey,
        indexName,
        error: error.message,
      });
      throw new AppError(`Failed to create index for stack: ${error.message}`, 500);
    }
  }


  async waitForIndexReady(indexName, maxWaitTime = 60000) {
    const startTime = Date.now();
    const checkInterval = 2000; // Check every 2 seconds

    while (Date.now() - startTime < maxWaitTime) {
      try {
        const indexList = await this.pinecone.listIndexes();
        const index = indexList.indexes.find(idx => idx.name === indexName);
        
        if (index && index.status?.ready) {
          logger.info(`Index ${indexName} is ready`);
          return;
        }
        
        logger.debug(`Waiting for index ${indexName} to be ready...`);
        await new Promise(resolve => setTimeout(resolve, checkInterval));
      } catch (error) {
        logger.error('Error checking index status', {
          indexName,
          error: error.message,
        });
        throw new AppError('Failed to check index status', 500);
      }
    }

    throw new AppError(`Index ${indexName} did not become ready within ${maxWaitTime}ms`, 500);
  }


  async deleteStackIndex(stackApiKey) {
    await this.ensureInitialized();

    const indexName = this.generateIndexName(stackApiKey);
    
    try {
      const exists = await this.indexExists(indexName);
      if (!exists) {
        logger.info(`Index ${indexName} does not exist for stack ${stackApiKey}`);
        return {
          success: true,
          indexName,
          message: 'Index does not exist',
          deleted: false,
        };
      }

      logger.info(`Deleting Pinecone index: ${indexName} for stack: ${stackApiKey}`);

      await this.pinecone.deleteIndex(indexName);

      logger.info(`✅ Successfully deleted index: ${indexName} for stack: ${stackApiKey}`);

      return {
        success: true,
        indexName,
        message: 'Index deleted successfully',
        deleted: true,
      };
    } catch (error) {
      logger.error('Failed to delete stack index', {
        stackApiKey,
        indexName,
        error: error.message,
      });
      throw new AppError(`Failed to delete index for stack: ${error.message}`, 500);
    }
  }


  async getStackIndexInfo(stackApiKey) {
    await this.ensureInitialized();

    const indexName = this.generateIndexName(stackApiKey);
    
    try {
      const exists = await this.indexExists(indexName);
      if (!exists) {
        return {
          exists: false,
          indexName,
          message: 'Index does not exist',
        };
      }

      const indexList = await this.pinecone.listIndexes();
      const index = indexList.indexes.find(idx => idx.name === indexName);

      return {
        exists: true,
        indexName,
        status: index.status,
        dimension: index.dimension,
        metric: index.metric,
        createdAt: index.createdAt,
      };
    } catch (error) {
      logger.error('Failed to get stack index info', {
        stackApiKey,
        indexName,
        error: error.message,
      });
      throw new AppError(`Failed to get index info for stack: ${error.message}`, 500);
    }
  }

  async listSemanticSearchIndexes() {
    await this.ensureInitialized();

    try {
      const indexList = await this.pinecone.listIndexes();
      const semanticIndexes = indexList.indexes.filter(index => 
        index.name.startsWith('semantic-search-')
      );

      return semanticIndexes.map(index => ({
        name: index.name,
        status: index.status,
        dimension: index.dimension,
        metric: index.metric,
        createdAt: index.createdAt,
        stackApiKey: this.extractStackApiKeyFromIndexName(index.name),
      }));
    } catch (error) {
      logger.error('Failed to list semantic search indexes', {
        error: error.message,
      });
      throw new AppError('Failed to list semantic search indexes', 500);
    }
  }

  extractStackApiKeyFromIndexName(indexName) {
    if (!indexName.startsWith('semantic-search-')) {
      return null;
    }
    
    return indexName.replace('semantic-search-', '');
  }
}

const pineconeIndexService = new PineconeIndexService();

module.exports = pineconeIndexService;
