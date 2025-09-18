const axios = require('axios');
const config = require('../config');
const { AppError } = require('../middleware/errorHandler');

const cohereApiKey = config.apis.cohere.apiKey;
const timeout = 30000;

const downloadImage = async (imageUrl) => {
  try {
    const headers = {
      'User-Agent': 'ContentStack-SemanticSearch/1.0',
      'Accept': 'image/*,*/*;q=0.8',
      'Accept-Encoding': 'gzip, deflate, br',
      'Cache-Control': 'no-cache'
    };

    if (isContentstackImageUrl(imageUrl)) {
      headers['Referer'] = 'https://app.contentstack.io/';
      headers['Origin'] = 'https://app.contentstack.io';
    }

    const response = await axios.get(imageUrl, {
      responseType: 'arraybuffer',
      timeout,
      maxContentLength: 10 * 1024 * 1024, 
      headers,
      validateStatus: function (status) {
        return status >= 200 && status < 300; 
      }
    });

    const contentType = response.headers['content-type'];
    if (!contentType || !contentType.startsWith('image/')) {
      throw new AppError(`Invalid content type: ${contentType}`, 400);
    }

    return Buffer.from(response.data);
  } catch (error) {
    console.error('Failed to download image', {
      imageUrl,
      error: error.message,
      status: error.response?.status
    });
    
    if (error.response?.status === 422) {
      throw new AppError('Contentstack image access denied', 422);
    } else if (error.response?.status === 403) {
      throw new AppError('Forbidden - insufficient permissions to access image', 403);
    } else if (error.response?.status === 404) {
      throw new AppError('Image not found', 404);
    } else if (error.code === 'ENOTFOUND') {
      throw new AppError('Image URL is not accessible', 400);
    }
    
    throw new AppError('Failed to download image', 500);
  }
};

const getMimeType = (imageUrl) => {
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
};

const isSupportedImageFormat = (imageUrl) => {
  const supportedFormats = ['png', 'jpg', 'jpeg', 'webp', 'gif'];
  const format = getImageFormat(imageUrl);
  
  if (!format) {
    return true;
  }
  
  return supportedFormats.includes(format);
};

const getImageFormat = (imageUrl) => {
  try {
    const cleanUrl = imageUrl.split('?')[0].split('#')[0];
    const pathParts = cleanUrl.split('/');
    const filename = pathParts[pathParts.length - 1];
    
    if (filename.includes('.')) {
      const extension = filename.toLowerCase().split('.').pop();
      const imageExtensions = ['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp', 'tiff', 'tif', 'svg', 'avif', 'heic'];
      return imageExtensions.includes(extension) ? extension : null;
    }

    return null;
  } catch (error) {
    console.warn('Error detecting image format', { imageUrl, error: error.message });
    return null;
  }
};

const generateImageEmbedding = async (imageUrl) => {
  if (!imageUrl || typeof imageUrl !== 'string') {
    throw new AppError('Image URL must be a non-empty string', 400);
  }

  if (!isSupportedImageFormat(imageUrl)) {
    const format = getImageFormat(imageUrl);
    console.warn('Skipping unsupported image format', { imageUrl, format });
    return null;
  }

  try {
    console.debug('Generating image embedding with Cohere', { imageUrl });
    console.warn('Image embedding temporarily disabled - returning null');
    return null;

  } catch (error) {
    console.error('Failed to generate image embedding', {
      imageUrl,
      error: error.message
    });
    
    return null;
  }
};

const generateImageEmbeddingFromBuffer = async (imageBuffer, mimeType = 'image/jpeg') => {
  if (!Buffer.isBuffer(imageBuffer)) {
    throw new AppError('Image data must be a Buffer', 400);
  }

  try {
    console.debug('Generating image embedding from buffer with Cohere', { 
      bufferSize: imageBuffer.length,
      mimeType 
    });

    console.warn('Image embedding from buffer temporarily disabled - returning null');
    return null;

  } catch (error) {
    console.error('Failed to generate image embedding from buffer', {
      error: error.message
    });
    
    return null;
  }
};

const isValidImageUrl = (url) => {
  if (!url || typeof url !== 'string') {
    return false;
  }

  const imageExtensions = /\.(jpg|jpeg|png|gif|webp|svg|bmp|tiff)(\?.*)?$/i;
  if (imageExtensions.test(url)) {
    return true;
  }

  const contentstackImagePattern = /images\.contentstack\.(com|io)/i;
  if (contentstackImagePattern.test(url)) {
    return true;
  }

  const cdnPatterns = [
    /cloudinary\.com/i,
    /amazonaws\.com.*\.(jpg|jpeg|png|gif|webp)/i,
    /googleusercontent\.com/i,
  ];

  return cdnPatterns.some(pattern => pattern.test(url));
};

const isContentstackImageUrl = (url) => {
  return /images\.contentstack\.(com|io)/i.test(url);
};

module.exports = {
  generateImageEmbedding,
  generateImageEmbeddingFromBuffer,
  isValidImageUrl,
  isContentstackImageUrl,
};
