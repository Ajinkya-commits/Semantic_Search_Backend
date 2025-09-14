const { AppError } = require('../../../shared/middleware/errorHandler');

/**
 * Validate search request parameters
 */
const validateSearchRequest = (req, res, next) => {
  const { query, imageUrl, limit, threshold } = req.body;

  // Validate limit parameter
  if (limit !== undefined) {
    const parsedLimit = parseInt(limit);
    if (isNaN(parsedLimit) || parsedLimit < 1 || parsedLimit > 100) {
      return next(new AppError('Limit must be a number between 1 and 100', 400));
    }
  }

  // Validate threshold parameter
  if (threshold !== undefined) {
    const parsedThreshold = parseFloat(threshold);
    if (isNaN(parsedThreshold) || parsedThreshold < 0 || parsedThreshold > 1) {
      return next(new AppError('Threshold must be a number between 0 and 1', 400));
    }
  }

  // Validate query for text search
  if (req.path.includes('/text') || req.path.includes('/semantic')) {
    if (!query || typeof query !== 'string' || query.trim().length === 0) {
      return next(new AppError('Query must be a non-empty string', 400));
    }
    if (query.length > 1000) {
      return next(new AppError('Query must be less than 1000 characters', 400));
    }
  }

  // Validate imageUrl for image search
  if (req.path.includes('/image') && !req.path.includes('/upload')) {
    if (!imageUrl || typeof imageUrl !== 'string') {
      return next(new AppError('Image URL must be provided', 400));
    }
    try {
      new URL(imageUrl);
    } catch (error) {
      return next(new AppError('Invalid image URL format', 400));
    }
  }

  // Validate hybrid search parameters
  if (req.path.includes('/hybrid')) {
    const { textWeight, imageWeight } = req.body;
    
    if (!query && !imageUrl) {
      return next(new AppError('Either text query or image URL must be provided for hybrid search', 400));
    }

    if (textWeight !== undefined) {
      const parsedTextWeight = parseFloat(textWeight);
      if (isNaN(parsedTextWeight) || parsedTextWeight < 0 || parsedTextWeight > 1) {
        return next(new AppError('Text weight must be a number between 0 and 1', 400));
      }
    }

    if (imageWeight !== undefined) {
      const parsedImageWeight = parseFloat(imageWeight);
      if (isNaN(parsedImageWeight) || parsedImageWeight < 0 || parsedImageWeight > 1) {
        return next(new AppError('Image weight must be a number between 0 and 1', 400));
      }
    }
  }

  next();
};

module.exports = {
  validateSearchRequest
};
