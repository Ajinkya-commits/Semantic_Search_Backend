const axios = require('axios');
const config = require('../config');
const logger = require('../config/logger');
const { AppError } = require('../shared/middleware/errorHandler');

class EmbeddingsService {
  constructor() {
    this.apiKey = config.apis.cohere.apiKey;
    this.baseUrl = config.apis.cohere.baseUrl;
    this.models = config.apis.cohere.models;
    this.timeout = 30000;
  }

  async generateTextEmbedding(text, inputType = 'search_document') {
    if (!text || typeof text !== 'string') {
      throw new AppError('Text must be a non-empty string', 400);
    }

    if (text.length > 10000) {
      throw new AppError('Text length cannot exceed 10,000 characters', 400);
    }

    try {
      logger.debug('Generating text embedding', { 
        textLength: text.length, 
        inputType 
      });

      const response = await axios.post(
        `${this.baseUrl}/embed`,
        {
          texts: [text],
          model: this.models.embedding,
          input_type: inputType,
          truncate: 'END',
        },
        {
          headers: {
            Authorization: `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json',
          },
          timeout: this.timeout,
        }
      );

      const vector = response.data.embeddings?.[0];
      if (!Array.isArray(vector) || vector.length === 0) {
        throw new AppError('Invalid embedding response from Cohere API', 500);
      }

      logger.debug('Text embedding generated successfully', { 
        vectorLength: vector.length 
      });

      return vector;
    } catch (error) {
      logger.error('Text embedding generation failed', {
        error: error.message,
        response: error.response?.data,
        status: error.response?.status,
      });

      if (error.response?.status === 429) {
        throw new AppError('Rate limit exceeded for embeddings API', 429);
      } else if (error.response?.status === 401) {
        throw new AppError('Invalid API key for embeddings service', 401);
      } else if (error.response?.status >= 500) {
        throw new AppError('Embeddings service temporarily unavailable', 503);
      }

      throw new AppError('Failed to generate text embedding', 500);
    }
  }

  /**
   * Generate image embedding using Cohere multimodal API
   * @param {string} imageUrl - URL of the image to embed
   * @param {string} inputType - Type of input (search_document, search_query)
   * @returns {Promise<number[]>} Embedding vector
   */
  async generateImageEmbedding(imageUrl, inputType = 'search_document') {
    if (!imageUrl || typeof imageUrl !== 'string') {
      throw new AppError('Image URL must be a non-empty string', 400);
    }

    try {
      new URL(imageUrl);
    } catch {
      throw new AppError('Invalid image URL format', 400);
    }

    try {
      logger.debug('Generating image embedding', { imageUrl, inputType });

      const response = await axios.post(
        `${this.baseUrl}/embed`,
        {
          image_urls: [imageUrl],
          model: this.models.multimodal,
          input_type: inputType,
        },
        {
          headers: {
            Authorization: `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json',
          },
          timeout: this.timeout,
        }
      );

      const vector = response.data.embeddings?.[0];
      if (!Array.isArray(vector) || vector.length === 0) {
        throw new AppError('Invalid image embedding response from Cohere API', 500);
      }

      logger.debug('Image embedding generated successfully', { 
        vectorLength: vector.length 
      });

      return vector;
    } catch (error) {
      logger.error('Image embedding generation failed', {
        error: error.message,
        response: error.response?.data,
        status: error.response?.status,
      });

      if (error.response?.status === 429) {
        throw new AppError('Rate limit exceeded for embeddings API', 429);
      } else if (error.response?.status === 401) {
        throw new AppError('Invalid API key for embeddings service', 401);
      } else if (error.response?.status >= 500) {
        throw new AppError('Embeddings service temporarily unavailable', 503);
      }

      throw new AppError('Failed to generate image embedding', 500);
    }
  }

  /**
   * Generate embeddings for multiple texts in batch
   * @param {string[]} texts - Array of texts to embed
   * @param {string} inputType - Type of input (search_document, search_query)
   * @returns {Promise<number[][]>} Array of embedding vectors
   */
  async generateBatchEmbeddings(texts, inputType = 'search_document') {
    if (!Array.isArray(texts) || texts.length === 0) {
      throw new AppError('Texts must be a non-empty array', 400);
    }

    if (texts.length > 100) {
      throw new AppError('Cannot process more than 100 texts in a single batch', 400);
    }

    for (const text of texts) {
      if (!text || typeof text !== 'string') {
        throw new AppError('All texts must be non-empty strings', 400);
      }
      if (text.length > 10000) {
        throw new AppError('Text length cannot exceed 10,000 characters', 400);
      }
    }

    try {
      logger.debug('Generating batch embeddings', { 
        textCount: texts.length, 
        inputType 
      });

      const response = await axios.post(
        `${this.baseUrl}/embed`,
        {
          texts,
          model: this.models.embedding,
          input_type: inputType,
          truncate: 'END',
        },
        {
          headers: {
            Authorization: `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json',
          },
          timeout: this.timeout * 2,
        }
      );

      const vectors = response.data.embeddings;
      if (!Array.isArray(vectors) || vectors.length !== texts.length) {
        throw new AppError('Invalid batch embedding response from Cohere API', 500);
      }

      logger.debug('Batch embeddings generated successfully', { 
        vectorCount: vectors.length 
      });

      return vectors;
    } catch (error) {
      logger.error('Batch embedding generation failed', {
        error: error.message,
        response: error.response?.data,
        status: error.response?.status,
      });

      if (error.response?.status === 429) {
        throw new AppError('Rate limit exceeded for embeddings API', 429);
      } else if (error.response?.status === 401) {
        throw new AppError('Invalid API key for embeddings service', 401);
      } else if (error.response?.status >= 500) {
        throw new AppError('Embeddings service temporarily unavailable', 503);
      }

      throw new AppError('Failed to generate batch embeddings', 500);
    }
  }

  /**
   * Get embedding model information
   * @returns {object} Model information
   */
  getModelInfo() {
    return {
      textModel: this.models.embedding,
      imageModel: this.models.multimodal,
      rerankModel: this.models.rerank,
      maxTextLength: 10000,
      maxBatchSize: 100,
    };
  }
}

const embeddingsService = new EmbeddingsService();

module.exports = embeddingsService;
