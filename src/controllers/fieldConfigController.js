const logger = require('../config/logger');
const { AppError, asyncHandler } = require('../shared/middleware/errorHandler');
const fieldConfigService = require('../services/fieldConfigService');

class FieldConfigController {
  /**
   * Get field patterns for a content type
   */
  getFieldPatterns = asyncHandler(async (req, res) => {
    const { contentType } = req.params;
    
    if (!contentType) {
      throw new AppError('Content type is required', 400);
    }

    const patterns = fieldConfigService.getFieldPatterns(contentType);
    
    logger.info('Retrieved field patterns', { contentType, patterns });
    
    res.json({
      success: true,
      contentType,
      patterns
    });
  });

  /**
   * Add custom field patterns for a content type
   */
  addCustomPatterns = asyncHandler(async (req, res) => {
    const { contentType } = req.params;
    const { patterns } = req.body;
    
    if (!contentType) {
      throw new AppError('Content type is required', 400);
    }
    
    if (!patterns || typeof patterns !== 'object') {
      throw new AppError('Patterns object is required', 400);
    }

    // Validate patterns structure
    const validCategories = ['title', 'description', 'metadata'];
    for (const [category, fieldNames] of Object.entries(patterns)) {
      if (!validCategories.includes(category)) {
        throw new AppError(`Invalid category: ${category}. Valid categories are: ${validCategories.join(', ')}`, 400);
      }
      
      if (!Array.isArray(fieldNames)) {
        throw new AppError(`Field names for category '${category}' must be an array`, 400);
      }
    }

    fieldConfigService.addCustomPatterns(contentType, patterns);
    
    logger.info('Added custom field patterns', { contentType, patterns });
    
    res.json({
      success: true,
      message: 'Custom field patterns added successfully',
      contentType,
      patterns
    });
  });

  /**
   * Test field extraction for a sample entry
   */
  testFieldExtraction = asyncHandler(async (req, res) => {
    const { contentType, entry } = req.body;
    
    if (!contentType) {
      throw new AppError('Content type is required', 400);
    }
    
    if (!entry || typeof entry !== 'object') {
      throw new AppError('Entry object is required', 400);
    }

    const extractedText = fieldConfigService.extractTextByCategory(entry, contentType);
    
    logger.info('Tested field extraction', { contentType, extractedText });
    
    res.json({
      success: true,
      contentType,
      extractedText,
      fieldAnalysis: Object.entries(entry).map(([fieldName, fieldValue]) => ({
        fieldName,
        fieldValue: typeof fieldValue === 'string' ? fieldValue.substring(0, 100) + '...' : fieldValue,
        shouldInclude: fieldConfigService.shouldIncludeField(fieldName, contentType, fieldValue)
      }))
    });
  });

  /**
   * Get all available content types and their field patterns
   */
  getAllContentTypePatterns = asyncHandler(async (req, res) => {
    const allPatterns = {};
    
    // Get patterns for all known content types
    const knownContentTypes = ['product', 'article', 'page', 'blog', 'news', 'event'];
    
    for (const contentType of knownContentTypes) {
      allPatterns[contentType] = fieldConfigService.getFieldPatterns(contentType);
    }
    
    logger.info('Retrieved all content type patterns', { contentTypes: Object.keys(allPatterns) });
    
    res.json({
      success: true,
      patterns: allPatterns
    });
  });
}

module.exports = new FieldConfigController();
