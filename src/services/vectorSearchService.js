const { Pinecone } = require('@pinecone-database/pinecone');

const config = require('../config');
const { AppError } = require('../shared/middleware/errorHandler');
const pineconeIndexService = require('./pineconeIndexService');

class VectorSearchService {
  constructor() {
    this.apiKey = config.apis.pinecone.apiKey;
    this.environment = config.apis.pinecone.environment;
    this.pinecone = null;
    this.index = null;
    this.isInitialized = false;
    this.currentIndexName = null;
  }

  async initialize(stackApiKey = null) {
    if (!stackApiKey) {
      throw new AppError('stackApiKey is required for vector search initialization', 400);
    }

    const targetIndexName = pineconeIndexService.generateIndexName(stackApiKey);
    
    if (this.isInitialized && this.currentIndexName === targetIndexName) {
      return;
    }

    try {
      console.log('Initializing Pinecone connection...', { indexName: targetIndexName });
      
      this.pinecone = new Pinecone({ 
        apiKey: this.apiKey,
      });
      
      this.index = this.pinecone.Index(targetIndexName);
      this.currentIndexName = targetIndexName;
      
      await this.index.describeIndexStats();
      
      this.isInitialized = true;
      console.log('Pinecone connection initialized', { indexName: targetIndexName });
    } catch (error) {
      console.error('Failed to initialize Pinecone connection', {
        error: error.message,
        indexName: targetIndexName,
      });
      throw new AppError('Failed to initialize vector search service', 500);
    }
  }

  async ensureInitialized(stackApiKey = null) {
    if (!this.isInitialized || (stackApiKey && this.currentIndexName !== pineconeIndexService.generateIndexName(stackApiKey))) {
      await this.initialize(stackApiKey);
    }
  }

  async setStackIndex(stackApiKey) {
    await this.initialize(stackApiKey);
  }

  async indexEntry(entryId, text, vector, metadata = {}, stackApiKey = null) {
    await this.ensureInitialized(stackApiKey);

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
          text: text?.substring(0, 40000) || '', // Pinecone metadata limit
          type: 'text',
          ...metadata,
        },
      };

      await this.index.upsert([upsertData]);
      console.log(`Indexed entry: ${entryId}`);
    } catch (error) {
      console.error(`Failed to index entry ${entryId}`, {
        error: error.message,
      });
      throw new AppError('Failed to index entry', 500);
    }
  }

  async indexBatch(entries, stackApiKey = null) {
    await this.ensureInitialized(stackApiKey);

    if (!Array.isArray(entries) || entries.length === 0) {
      throw new AppError('Entries must be a non-empty array', 400);
    }

    if (entries.length > 100) {
      throw new AppError('Cannot index more than 100 entries in a single batch', 400);
    }

    try {
      console.log('Indexing batch of entries', { count: entries.length });

      const upsertData = entries.map(entry => {
        if (!entry.id || !Array.isArray(entry.vector) || !entry.text) {
          throw new AppError('Each entry must have id, vector, and text properties', 400);
        }

        return {
          id: entry.id,
          values: entry.vector,
          metadata: {
            text: entry.text.substring(0, 1000),
            ...entry.metadata,
          },
        };
      });

      await this.index.upsert(upsertData);

      console.log(`Indexed ${entries.length} entries in batch`);
    } catch (error) {
      console.error('Failed to index batch of entries', {
        count: entries.length,
        error: error.message,
      });
      throw new AppError('Failed to index batch of entries', 500);
    }
  }

  async deleteEntry(entryId, stackApiKey = null) {
    await this.ensureInitialized(stackApiKey);

    if (!entryId || typeof entryId !== 'string') {
      throw new AppError('Entry ID must be a non-empty string', 400);
    }

    try {
      await this.index.deleteOne(entryId);
      console.log(`Deleted entry: ${entryId}`);
    } catch (error) {
      console.error(`Failed to delete entry ${entryId}`, {
        error: error.message,
      });
      throw new AppError('Failed to delete entry', 500);
    }
  }

  async deleteBatch(entryIds, stackApiKey = null) {
    await this.ensureInitialized(stackApiKey);

    if (!Array.isArray(entryIds) || entryIds.length === 0) {
      throw new AppError('Entry IDs must be a non-empty array', 400);
    }

    try {
      console.log('Deleting batch of entries', { count: entryIds.length });

      await this.index.deleteMany({ ids: entryIds });

      console.log(`Deleted ${entryIds.length} entries in batch`);
    } catch (error) {
      console.error('Failed to delete batch of entries', {
        count: entryIds.length,
        error: error.message,
      });
      throw new AppError('Failed to delete batch of entries', 500);
    }
  }

  async search(queryEmbedding, topK = 10, metadataFilters = {}, similarityThreshold = 0.0, stackApiKey = null) {
    await this.ensureInitialized(stackApiKey);

    if (!Array.isArray(queryEmbedding) || queryEmbedding.length === 0) {
      throw new AppError('Query embedding must be a non-empty array', 400);
    }

    if (topK < 1 || topK > 100) {
      throw new AppError('topK must be between 1 and 100', 400);
    }

    try {
      console.log('Performing vector search', {
        vectorLength: queryEmbedding.length,
        topK,
        filters: Object.keys(metadataFilters),
        similarityThreshold,
      });

      const queryOptions = {
        vector: queryEmbedding,
        topK,
        includeMetadata: true,
        includeValues: false,
      };

      if (metadataFilters && Object.keys(metadataFilters).length > 0) {
        queryOptions.filter = metadataFilters;
      }

      const results = await this.index.query(queryOptions);

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

      console.log('Vector search completed', {
        totalMatches: results.matches.length,
        filteredMatches: filteredResults.length,
        topScore: filteredResults[0]?.score || 0,
      });

      return filteredResults;
    } catch (error) {
      console.error('Vector search failed', {
        error: error.message,
        topK,
        filters: Object.keys(metadataFilters),
      });
      throw new AppError('Vector search failed', 500);
    }
  }

  async getIndexStats(stackApiKey = null) {
    await this.ensureInitialized(stackApiKey);

    try {
      const stats = await this.index.describeIndexStats();
      return stats;
    } catch (error) {
      console.error('Failed to get index statistics', { error: error.message });
      throw new AppError('Failed to get index statistics', 500);
    }
  }

  async clearIndex(stackApiKey = null) {
    await this.ensureInitialized(stackApiKey);

    try {
      console.log('Clearing entire Pinecone index - this action cannot be undone!');
      await this.index.deleteAll();
      console.log('Pinecone index cleared');
    } catch (error) {
      
      console.error('Failed to clear index', { error: error.message });
      throw new AppError('Failed to clear index', 500);
    }
  }

  async indexImage(imageId, imageUrl, vector, metadata = {}, stackApiKey = null) {
    await this.ensureInitialized(stackApiKey);

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

      await this.index.upsert([upsertData]);
      console.log(`Indexed image: ${imageId}`);
    } catch (error) {
      console.error(`Failed to index image ${imageId}`, {
        error: error.message,
      });
      throw new AppError('Failed to index image', 500);
    }
  }

  async searchImages(queryEmbedding, topK = 10, metadataFilters = {}, similarityThreshold = 0.0, stackApiKey = null) {
    await this.ensureInitialized(stackApiKey);

    // Add filter to only search image embeddings
    const imageFilters = {
      type: { $eq: 'image' }, // Use explicit equality operator for Pinecone
      ...metadataFilters
    };

    console.log('Image search filters', { imageFilters, topK, similarityThreshold });

    const results = await this.search(queryEmbedding, topK, imageFilters, similarityThreshold, stackApiKey);
    
    // Additional filtering to ensure only image entries are returned
    const imageResults = results.filter(result => {
      const isImage = result.type === 'image' || result.imageUrl;
      if (!isImage) {
        console.log('Non-image entry found in image search results', {
          id: result.id,
          type: result.type,
          hasImageUrl: !!result.imageUrl,
          hasText: !!result.text
        });
      }
      return isImage;
    });

    console.log('Image search results', {
      totalResults: results.length,
      imageResults: imageResults.length,
      filtered: results.length - imageResults.length
    });

    return imageResults;
  }

  async searchHybrid(queryEmbedding, topK = 20, options = {}, stackApiKey = null) {
    await this.ensureInitialized(stackApiKey);

    const {
      textWeight = 0.7,
      imageWeight = 0.3,
      similarityThreshold = 0.0,
      metadataFilters = {}
    } = options;

    try {
      // Search all content types
      const allResults = await this.search(queryEmbedding, topK, metadataFilters, similarityThreshold, stackApiKey);

      // Separate text and image results
      const textResults = allResults.filter(result => result.type !== 'image');
      const imageResults = allResults.filter(result => result.type === 'image');

      // Apply weights to scores
      textResults.forEach(result => {
        result.weightedScore = result.score * textWeight;
        result.resultType = 'text';
      });

      imageResults.forEach(result => {
        result.weightedScore = result.score * imageWeight;
        result.resultType = 'image';
      });

      // Combine and sort by weighted score
      const combinedResults = [...textResults, ...imageResults]
        .sort((a, b) => b.weightedScore - a.weightedScore)
        .slice(0, topK);

      console.log('Hybrid search completed', {
        totalResults: allResults.length,
        textResults: textResults.length,
        imageResults: imageResults.length,
        combinedResults: combinedResults.length,
      });

      return combinedResults;
    } catch (error) {
      console.error('Hybrid search failed', {
        error: error.message,
        topK,
        options,
      });
      throw new AppError('Hybrid search failed', 500);
    }
  }

  async indexImageBatch(images, stackApiKey = null) {
    await this.ensureInitialized(stackApiKey);

    if (!Array.isArray(images) || images.length === 0) {
      throw new AppError('Images must be a non-empty array', 400);
    }

    if (images.length > 100) {
      throw new AppError('Cannot index more than 100 images in a single batch', 400);
    }

    try {
      console.log('Indexing batch of images', { count: images.length });

      const upsertData = images.map(image => {
        if (!image.id || !Array.isArray(image.vector) || !image.url) {
          throw new AppError('Each image must have id, vector, and url properties', 400);
        }

        return {
          id: image.id,
          values: image.vector,
          metadata: {
            type: 'image',
            imageUrl: image.url,
            ...image.metadata,
          },
        };
      });

      await this.index.upsert(upsertData);

      console.log(`Indexed ${images.length} images in batch`);
    } catch (error) {
      console.error('Failed to index batch of images', {
        count: images.length,
        error: error.message,
      });
      throw new AppError('Failed to index batch of images', 500);
    }
  }
}

const vectorSearchService = new VectorSearchService();

module.exports = vectorSearchService;
