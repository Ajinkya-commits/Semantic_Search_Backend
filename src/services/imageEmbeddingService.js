const { CohereClient } = require('cohere-ai');
const axios = require('axios');
const config = require('../config');
const logger = require('../config/logger');
const { AppError } = require('../shared/middleware/errorHandler');

class ImageEmbeddingService {
  constructor() {
    this.cohereApiKey = config.apis.cohere.apiKey;
    this.cohere = new CohereClient({
      token: this.cohereApiKey,
    });
    this.timeout = 30000; // 30 seconds
  }

  /**
   * Generate embedding for an image from URL using Cohere's multimodal model
   * @param {string} imageUrl - URL of the image
   * @returns {Promise<number[]>} Image embedding vector
   */
  async generateImageEmbedding(imageUrl) {
    if (!imageUrl || typeof imageUrl !== 'string') {
      throw new AppError('Image URL must be a non-empty string', 400);
    }

    // Check if image format is supported by Cohere
    if (!this.isSupportedImageFormat(imageUrl)) {
      const format = this.getImageFormat(imageUrl);
      logger.warn('Skipping unsupported image format', { imageUrl, format });
      throw new AppError(`Unsupported image format: ${format}. Cohere supports PNG, JPEG, WebP, and GIF only.`, 400);
    }

    try {
      logger.debug('Generating image embedding with Cohere', { imageUrl });

      // Download and validate image first
      const imageBuffer = await this.downloadImage(imageUrl);
      
      // Convert to base64 for Cohere API
      const base64Image = imageBuffer.toString('base64');
      const mimeType = this.getMimeType(imageUrl);
      
      // Use Cohere's multimodal embedding model
      const response = await this.cohere.v2.embed({
        model: 'embed-v4.0',
        inputType: 'image',
        embeddingTypes: ['float'],
        images: [`data:${mimeType};base64,${base64Image}`]
      });

      const embedding = response.embeddings.float[0];
      
      logger.debug('Image embedding generated successfully', {
        imageUrl,
        embeddingLength: embedding.length,
      });

      return embedding;
    } catch (error) {
      logger.error('Failed to generate image embedding', {
        imageUrl,
        error: error.message,
        status: error.status,
      });
      
      // Handle specific Cohere API errors
      if (error.status === 401) {
        throw new AppError('Invalid Cohere API key', 401);
      } else if (error.status === 429) {
        throw new AppError('Cohere API rate limit exceeded', 429);
      } else if (error.status === 400 && error.message?.includes('unsupported')) {
        // Handle unsupported image format errors from Cohere
        throw new AppError(`Unsupported image format. Cohere supports PNG, JPEG, WebP, and GIF only.`, 400);
      } else if (error.message?.includes('Invalid image')) {
        throw new AppError('Invalid or corrupted image file', 400);
      }
      
      throw new AppError(`Failed to generate image embedding: ${error.message}`, 500);
    }
  }

  /**
   * Generate embedding for uploaded image buffer
   * @param {Buffer} imageBuffer - Image buffer data
   * @param {string} mimeType - MIME type of the image
   * @returns {Promise<number[]>} Image embedding vector
   */
  async generateImageEmbeddingFromBuffer(imageBuffer, mimeType = 'image/jpeg') {
    if (!Buffer.isBuffer(imageBuffer)) {
      throw new AppError('Image data must be a Buffer', 400);
    }

    try {
      logger.debug('Generating image embedding from buffer with Cohere', { 
        bufferSize: imageBuffer.length,
        mimeType 
      });

      // Convert to base64 for Cohere API
      const base64Image = imageBuffer.toString('base64');
      
      // Use Cohere's multimodal embedding model
      const response = await this.cohere.v2.embed({
        model: config.apis.cohere.models.multimodal || 'embed-v4.0',
        inputType: 'image',
        embeddingTypes: ['float'],
        images: [`data:${mimeType};base64,${base64Image}`]
      });

      const embedding = response.embeddings.float[0];
      
      logger.debug('Image embedding generated successfully from buffer', {
        embeddingLength: embedding.length,
      });

      return embedding;
    } catch (error) {
      logger.error('Failed to generate image embedding from buffer', {
        error: error.message,
        status: error.status,
      });
      
      // Handle specific Cohere API errors
      if (error.status === 401) {
        throw new AppError('Invalid Cohere API key', 401);
      } else if (error.status === 429) {
        throw new AppError('Cohere API rate limit exceeded', 429);
      } else if (error.status === 400 && error.message?.includes('unsupported')) {
        // Handle unsupported image format errors from Cohere
        throw new AppError(`Unsupported image format. Cohere supports PNG, JPEG, WebP, and GIF only.`, 400);
      } else if (error.message?.includes('Invalid image')) {
        throw new AppError('Invalid or corrupted image file', 400);
      }
      
      throw new AppError(`Failed to generate image embedding: ${error.message}`, 500);
    }
  }

  /**
   * Download image from URL
   * @param {string} imageUrl - URL of the image
   * @returns {Promise<Buffer>} Image buffer
   */
  async downloadImage(imageUrl) {
    try {
      const headers = {
        'User-Agent': 'ContentStack-SemanticSearch/1.0',
        'Accept': 'image/*,*/*;q=0.8',
        'Accept-Encoding': 'gzip, deflate, br',
        'Cache-Control': 'no-cache'
      };

      // Add Contentstack-specific headers if it's a Contentstack image URL
      if (this.isContentstackImageUrl(imageUrl)) {
        headers['Referer'] = 'https://app.contentstack.io/';
        headers['Origin'] = 'https://app.contentstack.io';
      }

      const response = await axios.get(imageUrl, {
        responseType: 'arraybuffer',
        timeout: this.timeout,
        maxContentLength: 10 * 1024 * 1024, // 10MB limit
        headers,
        validateStatus: function (status) {
          return status >= 200 && status < 300; // Only resolve for 2xx status codes
        }
      });

      // Validate it's actually an image
      const contentType = response.headers['content-type'];
      if (!contentType || !contentType.startsWith('image/')) {
        throw new AppError(`Invalid content type: ${contentType}`, 400);
      }

      return Buffer.from(response.data);
    } catch (error) {
      logger.error('Failed to download image', {
        imageUrl,
        error: error.message,
        status: error.response?.status,
        statusText: error.response?.statusText
      });
      
      if (error.response?.status === 422) {
        throw new AppError('Contentstack image access denied - image may be private or require authentication', 422);
      } else if (error.response?.status === 403) {
        throw new AppError('Forbidden - insufficient permissions to access image', 403);
      } else if (error.response?.status === 404) {
        throw new AppError('Image not found', 404);
      } else if (error.code === 'ENOTFOUND' || error.code === 'ECONNREFUSED') {
        throw new AppError('Image URL is not accessible', 400);
      }
      
      throw new AppError('Failed to download image', 500);
    }
  }

  /**
   * Get MIME type from image URL
   * @param {string} imageUrl - URL of the image
   * @returns {string} MIME type
   */
  getMimeType(imageUrl) {
    const extension = imageUrl.toLowerCase().split('.').pop().split('?')[0];
    const mimeTypes = {
      'jpg': 'image/jpeg',
      'jpeg': 'image/jpeg',
      'png': 'image/png',
      'gif': 'image/gif',
      'webp': 'image/webp',
      'svg': 'image/svg+xml',
      'bmp': 'image/bmp',
      'tiff': 'image/tiff',
      'tif': 'image/tiff'
    };
    return mimeTypes[extension] || 'image/jpeg';
  }

  /**
   * Check if image format is supported by Cohere
   * @param {string} imageUrl - URL of the image
   * @returns {boolean} True if image format is supported
   */
  isSupportedImageFormat(imageUrl) {
    const supportedFormats = ['png', 'jpg', 'jpeg', 'webp', 'gif'];
    const format = this.getImageFormat(imageUrl);
    
    // If no format detected from URL, assume it's supported (Contentstack URLs often don't have extensions)
    if (!format) {
      return true;
    }
    
    return supportedFormats.includes(format);
  }

  /**
   * Get image format from URL
   * @param {string} imageUrl - URL of the image
   * @returns {string|null} Image format or null if not detectable
   */
  getImageFormat(imageUrl) {
    try {
      // Remove query parameters and fragments
      const cleanUrl = imageUrl.split('?')[0].split('#')[0];
      
      // Check if URL has a file extension
      const pathParts = cleanUrl.split('/');
      const filename = pathParts[pathParts.length - 1];
      
      if (filename.includes('.')) {
        const extension = filename.toLowerCase().split('.').pop();
        // Validate that it's actually an image extension
        const imageExtensions = ['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp', 'tiff', 'tif', 'svg', 'avif', 'heic'];
        return imageExtensions.includes(extension) ? extension : null;
      }
      
      // For Contentstack URLs without extensions, return null (will be handled as supported)
      return null;
    } catch (error) {
      logger.warn('Error detecting image format', { imageUrl, error: error.message });
      return null;
    }
  }

  /**
   * Generate embeddings for multiple images in batch
   * @param {string[]} imageUrls - Array of image URLs
   * @returns {Promise<Array>} Array of {url, embedding} objects
   */
  async generateBatchImageEmbeddings(imageUrls) {
    if (!Array.isArray(imageUrls) || imageUrls.length === 0) {
      throw new AppError('Image URLs must be a non-empty array', 400);
    }

    const results = [];
    const errors = [];

    // Process in smaller batches to avoid rate limits
    const batchSize = 5;
    for (let i = 0; i < imageUrls.length; i += batchSize) {
      const batch = imageUrls.slice(i, i + batchSize);
      
      const batchPromises = batch.map(async (imageUrl) => {
        try {
          // Check if image format is supported before processing
          if (!this.isSupportedImageFormat(imageUrl)) {
            const format = this.getImageFormat(imageUrl);
            logger.warn('Skipping unsupported image format', { imageUrl, format });
            errors.push({
              imageUrl,
              error: `Unsupported image format: ${format}. Cohere supports PNG, JPEG, WebP, and GIF only.`
            });
            return null;
          }

          const embedding = await this.generateImageEmbedding(imageUrl);
          return { url: imageUrl, embedding };
        } catch (error) {
          logger.warn('Failed to process image in batch', { imageUrl, error: error.message });
          errors.push({ imageUrl, error: error.message });
          return null;
        }
      });

      const batchResults = await Promise.all(batchPromises);
      results.push(...batchResults.filter(result => result !== null));

      // Add delay between batches to respect rate limits
      if (i + batchSize < imageUrls.length) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }

    logger.info('Batch image embedding completed', {
      total: imageUrls.length,
      successful: results.length,
      failed: errors.length,
    });

    return { results, errors };
  }

  /**
   * Validate if URL points to a supported image format
   * @param {string} url - Image URL to validate
   * @returns {boolean} True if URL appears to be a valid image
   */
  isValidImageUrl(url) {
    if (!url || typeof url !== 'string') {
      return false;
    }

    // Check for common image extensions
    const imageExtensions = /\.(jpg|jpeg|png|gif|webp|svg|bmp|tiff)(\?.*)?$/i;
    if (imageExtensions.test(url)) {
      return true;
    }

    // Check for Contentstack image URLs
    const contentstackImagePattern = /images\.contentstack\.(com|io)/i;
    if (contentstackImagePattern.test(url)) {
      return true;
    }

    // Check for other CDN patterns
    const cdnPatterns = [
      /cloudinary\.com/i,
      /amazonaws\.com.*\.(jpg|jpeg|png|gif|webp)/i,
      /googleusercontent\.com/i,
    ];

    return cdnPatterns.some(pattern => pattern.test(url));
  }

  /**
   * Check if URL is a Contentstack image URL
   * @param {string} url - Image URL to check
   * @returns {boolean} True if it's a Contentstack image URL
   */
  isContentstackImageUrl(url) {
    return /images\.contentstack\.(com|io)/i.test(url);
  }
}

const imageEmbeddingService = new ImageEmbeddingService();
module.exports = imageEmbeddingService;
