const { Pinecone } = require('@pinecone-database/pinecone');
const config = require('../config');
const { AppError } = require('../middleware/errorHandler');

let pinecone = null;
let isInitialized = false;

const initialize = async () => {
  if (isInitialized) {
    return;
  }

  try {
    pinecone = new Pinecone({ 
      apiKey: config.apis.pinecone.apiKey,
    });
    
    isInitialized = true;
  } catch (error) {
    throw new AppError('Failed to initialize Pinecone index service', 500);
  }
};

const ensureInitialized = async () => {
  if (!isInitialized) {
    await initialize();
  }
};

const generateIndexName = (stackApiKey) => {
  if (!stackApiKey || typeof stackApiKey !== 'string') {
    throw new AppError('Stack API key is required', 400);
  }

  const safeStackKey = stackApiKey.replace(/[^a-zA-Z0-9]/g, '');
  const indexName = `semantic-search-${safeStackKey}`;
  return indexName.toLowerCase().substring(0, 45);
};

const createIndex = async (stackApiKey, dimension = 1536) => {
  await ensureInitialized();
  
  const indexName = generateIndexName(stackApiKey);
  
  try {
    const existingIndexes = await pinecone.listIndexes();
    const indexExists = existingIndexes.indexes?.some(index => index.name === indexName);
    
    if (indexExists) {
      return { indexName, created: false, message: 'Index already exists' };
    }

    await pinecone.createIndex({
      name: indexName,
      dimension: dimension,
      metric: 'cosine',
      spec: {
        serverless: {
          cloud: 'aws',
          region: 'us-east-1'
        }
      }
    });

    let indexReady = false;
    let attempts = 0;
    const maxAttempts = 60;

    while (!indexReady && attempts < maxAttempts) {
      try {
        const indexDescription = await pinecone.describeIndex(indexName);
        if (indexDescription.status?.ready) {
          indexReady = true;
        } else {
          await new Promise(resolve => setTimeout(resolve, 5000));
          attempts++;
        }
      } catch (error) {
        await new Promise(resolve => setTimeout(resolve, 5000));
        attempts++;
      }
    }

    if (!indexReady) {
      throw new AppError('Index creation timed out', 500);
    }

    return { indexName, created: true, message: 'Index created successfully' };

  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }
    throw new AppError(`Failed to create index: ${error.message}`, 500);
  }
};

const deleteIndex = async (stackApiKey) => {
  await ensureInitialized();
  
  const indexName = generateIndexName(stackApiKey);
  
  try {
    await pinecone.deleteIndex(indexName);
    return { indexName, deleted: true, message: 'Index deleted successfully' };
  } catch (error) {
    if (error.status === 404) {
      return { indexName, deleted: false, message: 'Index does not exist' };
    }
    throw new AppError(`Failed to delete index: ${error.message}`, 500);
  }
};

const listIndexes = async () => {
  await ensureInitialized();
  
  try {
    const response = await pinecone.listIndexes();
    return response.indexes || [];
  } catch (error) {
    throw new AppError(`Failed to list indexes: ${error.message}`, 500);
  }
};

const getIndexInfo = async (stackApiKey) => {
  await ensureInitialized();
  
  const indexName = generateIndexName(stackApiKey);
  
  try {
    const indexDescription = await pinecone.describeIndex(indexName);
    return {
      name: indexName,
      dimension: indexDescription.dimension,
      metric: indexDescription.metric,
      status: indexDescription.status,
      spec: indexDescription.spec
    };
  } catch (error) {
    if (error.status === 404) {
      return null;
    }
    throw new AppError(`Failed to get index info: ${error.message}`, 500);
  }
};

const ensureIndexExists = async (stackApiKey, dimension = 1536) => {
  const indexInfo = await getIndexInfo(stackApiKey);
  
  if (!indexInfo) {
    const result = await createIndex(stackApiKey, dimension);
    return result;
  }
  
  return { 
    indexName: indexInfo.name, 
    created: false, 
    message: 'Index already exists' 
  };
};

module.exports = {
  initialize,
  generateIndexName,
  createIndex,
  deleteIndex,
  listIndexes,
  getIndexInfo,
  ensureIndexExists,
};
