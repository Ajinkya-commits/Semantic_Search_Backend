const { Pinecone } = require('@pinecone-database/pinecone');
const config = require('../config');
const { AppError } = require('../middleware/errorHandler');
const pineconeIndexService = require('./pineconeIndexService');

let pinecone = null;
let index = null;
let isInitialized = false;
let currentIndexName = null;

const createIndexIfNotExists = async (stackApiKey) => {
  const indexName = pineconeIndexService.generateIndexName(stackApiKey);
  
  try {
    // Try to describe the index first
    const testIndex = pinecone.Index(indexName);
    await testIndex.describeIndexStats();
    console.log(`Index ${indexName} already exists`);
    return indexName;
  } catch (error) {
    if (error.message.includes('404')) {
      console.log(`Creating new index: ${indexName}`);
      
      try {
        await pinecone.createIndex({
          name: indexName,
          dimension: 1536, 
          metric: 'cosine',
          spec: {
            serverless: {
              cloud: 'aws',
              region: 'us-east-1'
            }
          }
        });
        
        let attempts = 0;
        const maxAttempts = 24; 
        
        while (attempts < maxAttempts) {
          try {
            const newIndex = pinecone.Index(indexName);
            await newIndex.describeIndexStats();
            console.log(`Index ${indexName} is now ready!`);
            return indexName;
          } catch (waitError) {
            attempts++;
            console.log(`Waiting for index... (${attempts}/${maxAttempts})`);
            await new Promise(resolve => setTimeout(resolve, 5000)); // Wait 5 seconds
          }
        }
        
        throw new Error(`Index ${indexName} creation timed out`);
      } catch (createError) {
        throw new AppError(`Failed to create index ${indexName}: ${createError.message}`, 500);
      }
    } else {
      throw new AppError(`Failed to check index ${indexName}: ${error.message}`, 500);
    }
  }
};

const initialize = async (stackApiKey = null) => {
  if (!stackApiKey) {
    throw new AppError('stackApiKey is required for vector search initialization', 400);
  }

  const targetIndexName = pineconeIndexService.generateIndexName(stackApiKey);
  
  if (isInitialized && currentIndexName === targetIndexName) {
    return;
  }

  try {
    pinecone = new Pinecone({ 
      apiKey: config.apis.pinecone.apiKey,
    });

    await createIndexIfNotExists(stackApiKey);
    
    index = pinecone.Index(targetIndexName);
    currentIndexName = targetIndexName;
    await index.describeIndexStats();
    
    isInitialized = true;
    console.log(`Vector search initialized for index: ${targetIndexName}`);
  } catch (error) {
    throw new AppError(`Failed to initialize vector search: ${error.message}`, 500);
  }
};

const ensureInitialized = async (stackApiKey = null) => {
  if (!isInitialized || (stackApiKey && currentIndexName !== pineconeIndexService.generateIndexName(stackApiKey))) {
    await initialize(stackApiKey);
  }
};

const search = async (queryEmbedding, topK = 5, metadataFilters = {}, similarityThreshold = 0.7, stackApiKey = null) => {
  await ensureInitialized(stackApiKey);

  if (!Array.isArray(queryEmbedding) || queryEmbedding.length === 0) {
    throw new AppError('Query embedding must be a non-empty array', 400);
  }

  if (topK < 1 || topK > 100) {
    throw new AppError('topK must be between 1 and 100', 400);
  }

  try {
    const queryOptions = {
      vector: queryEmbedding,
      topK,
      includeMetadata: true,
    };

    if (metadataFilters && Object.keys(metadataFilters).length > 0) {
      queryOptions.filter = metadataFilters;
    }

    const results = await index.query(queryOptions);

    const filteredResults = results.matches
      .filter(match => match.score >= similarityThreshold)
      .map(match => ({
        id: match.id,
        score: match.score,
        text: match.metadata?.text || '',
        contentType: match.metadata?.contentType || 'unknown',
        ...match.metadata,
      }));

    return filteredResults;
  } catch (error) {
    throw new AppError(`Vector search failed: ${error.message}`, 500);
  }
};

const indexEntry = async (entryId, text, vector, metadata = {}, stackApiKey = null) => {
  await ensureInitialized(stackApiKey);

  if (!entryId || typeof entryId !== 'string') {
    throw new AppError('Entry ID must be a non-empty string', 400);
  }

  if (!Array.isArray(vector) || vector.length === 0) {
    throw new AppError('Vector must be a non-empty array', 400);
  }

  try {
    const upsertData = {
      id: entryId,
      values: vector,
      metadata: {
        text: text?.substring(0, 40000) || '',
        type: 'text',
        ...metadata,
      },
    };

    await index.upsert([upsertData]);
  } catch (error) {
    throw new AppError(`Failed to index entry: ${error.message}`, 500);
  }
};

const deleteEntry = async (entryId, stackApiKey = null) => {
  await ensureInitialized(stackApiKey);

  if (!entryId || typeof entryId !== 'string') {
    throw new AppError('Entry ID must be a non-empty string', 400);
  }

  try {
    await index.deleteOne(entryId);
  } catch (error) {
    throw new AppError(`Failed to delete entry: ${error.message}`, 500);
  }
};

const getIndexStats = async (stackApiKey = null) => {
  await ensureInitialized(stackApiKey);

  try {
    const stats = await index.describeIndexStats();
    return stats;
  } catch (error) {
    throw new AppError(`Failed to get index stats: ${error.message}`, 500);
  }
};

const clearIndex = async (stackApiKey = null) => {
  await ensureInitialized(stackApiKey);

  try {
    await index.deleteAll();
  } catch (error) {
    throw new AppError(`Failed to clear index: ${error.message}`, 500);
  }
};

const setStackIndex = async (stackApiKey) => {
  await initialize(stackApiKey);
};

module.exports = {
  search,
  indexEntry,
  deleteEntry,
  getIndexStats,
  clearIndex,
  setStackIndex
};
