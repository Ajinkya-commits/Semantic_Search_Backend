const axios = require('axios');
const config = require('../config');
const { AppError } = require('../middleware/errorHandler');

const generateTextEmbedding = async (text, inputType = 'search_document') => {
  if (!text || typeof text !== 'string' || text.trim().length === 0) {
    throw new AppError('Text is required and must be a non-empty string', 400);
  }

  if (text.length > 10000) {
    throw new AppError('Text length cannot exceed 10,000 characters', 400);
  }

  if (!config.apis.cohere.apiKey) {
    throw new AppError('Cohere API key not configured', 500);
  }

  try {
    console.log('Generating text embedding for:', text.substring(0, 50) + '...');
    
    const response = await axios.post(
      `${config.apis.cohere.baseUrl}/embed`,
      {
        texts: [text.trim()],
        model: config.apis.cohere.models.embed,
        input_type: inputType,
        truncate: 'END',
      },
      {
        headers: {
          Authorization: `Bearer ${config.apis.cohere.apiKey}`,
          'Content-Type': 'application/json',
        },
        timeout: 15000, // **REDUCED from 30000ms to 15000ms**
      }
    );

    const vector = response.data.embeddings?.[0];
    if (!Array.isArray(vector) || vector.length === 0) {
      throw new AppError('Invalid embedding response from Cohere API', 500);
    }

    console.log('Text embedding generated successfully, vector length:', vector.length);
    return vector;
  } catch (error) {
    console.error('Text embedding generation failed:', error.message);

    if (error.response?.status === 429) {
      throw new AppError('Rate limit exceeded for embeddings API', 429);
    } else if (error.response?.status === 401) {
      throw new AppError('Invalid API key for embeddings service', 401);
    } else if (error.response?.status >= 500) {
      throw new AppError('Embeddings service temporarily unavailable', 503);
    }

    throw new AppError('Failed to generate text embedding', 500);
  }
};

module.exports = {
  generateTextEmbedding,
};
