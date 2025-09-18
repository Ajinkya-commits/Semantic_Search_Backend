const { Pinecone } = require('@pinecone-database/pinecone');
const config = require('../config');
const { AppError } = require('../middleware/errorHandler');
const pineconeIndexService = require('./pineconeIndexService');

let pinecone = null;
let index = null;
let isInitialized = false;
let currentIndexName = null;

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
    
    index = pinecone.Index(targetIndexName);
    currentIndexName = targetIndexName;
    
    await pineconeIndexService.ensureIndexExists(stackApiKey);
    await index.describeIndexStats();
    
    isInitialized = true;
  } catch (error) {
    throw new AppError(`Failed to initialize vector search: ${error.message}`, 500);
  }
};

const ensureInitialized = async (stackApiKey = null) => {
  if (!isInitialized || (stackApiKey && currentIndexName !== pineconeIndexService.generateIndexName(stackApiKey))) {
    await initialize(stackApiKey);
  }
};

const search = async (queryEmbedding, topK = 10, metadataFilters = {}, similarityThreshold = 0.0, stackApiKey = null) => {
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
        locale: match.metadata?.locale || 'en-us',
        ...match.metadata,
      }));

    return filteredResults;
  } catch (error) {
    throw new AppError(`Vector search failed: ${error.message}`, 500);
  }
};

const searchImages = async (queryEmbedding, topK = 10, metadataFilters = {}, similarityThreshold = 0.0, stackApiKey = null) => {
  await ensureInitialized(stackApiKey);

  const imageFilters = {
    type: { $eq: 'image' },
    ...metadataFilters
  };

  const results = await search(queryEmbedding, topK, imageFilters, similarityThreshold, stackApiKey);
  
  const imageResults = results.filter(result => {
    const isImage = result.type === 'image' || result.imageUrl;
    return isImage;
  });

  return imageResults;
};

const searchHybrid = async (queryEmbedding, topK = 20, options = {}, stackApiKey = null) => {
  await ensureInitialized(stackApiKey);

  const {
    textWeight = 0.7,
    imageWeight = 0.3,
    similarityThreshold = 0.0,
    metadataFilters = {}
  } = options;

  try {
    const allResults = await search(queryEmbedding, topK, metadataFilters, similarityThreshold, stackApiKey);

    const textResults = allResults.filter(result => result.type !== 'image');
    const imageResults = allResults.filter(result => result.type === 'image');

    textResults.forEach(result => {
      result.weightedScore = result.score * textWeight;
    });

    imageResults.forEach(result => {
      result.weightedScore = result.score * imageWeight;
    });

    const combinedResults = [...textResults, ...imageResults]
      .sort((a, b) => b.weightedScore - a.weightedScore)
      .slice(0, topK);

    return combinedResults;
  } catch (error) {
    throw new AppError(`Hybrid search failed: ${error.message}`, 500);
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

const indexImage = async (imageId, imageUrl, vector, metadata = {}, stackApiKey = null) => {
  await ensureInitialized(stackApiKey);

  if (!imageId || typeof imageId !== 'string') {
    throw new AppError('Image ID must be a non-empty string', 400);
  }

  if (!Array.isArray(vector) || vector.length === 0) {
    throw new AppError('Vector must be a non-empty array', 400);
  }

  if (!imageUrl || typeof imageUrl !== 'string') {
    throw new AppError('Image URL must be a non-empty string', 400);
  }

  try {
    const upsertData = {
      id: imageId,
      values: vector,
      metadata: {
        imageUrl: imageUrl?.substring(0, 40000) || '',
        type: 'image',
        ...metadata,
      },
    };

    await index.upsert([upsertData]);
  } catch (error) {
    throw new AppError(`Failed to index image: ${error.message}`, 500);
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
  searchImages,
  searchHybrid,
  indexEntry,
  indexImage,
  deleteEntry,
  getIndexStats,
  clearIndex,
  setStackIndex,
};
