const { body, query, param, validationResult } = require('express-validator');
const { AppError } = require('./errorHandler');

const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    const errorMessages = errors.array().map(error => ({
      field: error.path,
      message: error.msg,
      value: error.value,
    }));
    
    throw new AppError(`Validation failed: ${errorMessages.map(e => e.message).join(', ')}`, 400);
  }
  next();
};

// Search validation rules
const validateSemanticSearch = [
  body('query')
    .trim()
    .notEmpty()
    .withMessage('Search query is required')
    .isLength({ min: 1, max: 500 })
    .withMessage('Query must be between 1 and 500 characters')
    .escape(),
  
  body('topK')
    .optional()
    .isInt({ min: 1, max: 50 })
    .withMessage('topK must be an integer between 1 and 50'),
  
  body('filters')
    .optional()
    .isObject()
    .withMessage('Filters must be an object'),
  
  body('filters.contentType')
    .optional()
    .isString()
    .trim()
    .isLength({ min: 1, max: 100 })
    .withMessage('Content type filter must be a string between 1 and 100 characters'),
  
  body('filters.locale')
    .optional()
    .isString()
    .trim()
    .isLength({ min: 2, max: 10 })
    .withMessage('Locale filter must be a string between 2 and 10 characters'),
  
  query('environment')
    .optional()
    .isIn(['development', 'staging', 'production'])
    .withMessage('Environment must be one of: development, staging, production'),
  
  handleValidationErrors,
];

// Sync validation rules
const validateSyncRequest = [
  query('environment')
    .optional()
    .isIn(['development', 'staging', 'production'])
    .withMessage('Environment must be one of: development, staging, production'),
  
  body('contentType')
    .optional()
    .isString()
    .trim()
    .isLength({ min: 1, max: 100 })
    .withMessage('Content type must be a string between 1 and 100 characters'),
  
  body('entryUid')
    .optional()
    .isString()
    .trim()
    .isLength({ min: 1, max: 100 })
    .withMessage('Entry UID must be a string between 1 and 100 characters'),
  
  handleValidationErrors,
];

// OAuth callback validation
const validateOAuthCallback = [
  query('code')
    .notEmpty()
    .withMessage('Authorization code is required'),
  
  query('state')
    .notEmpty()
    .withMessage('State parameter is required'),
  
  handleValidationErrors,
];

// Webhook validation
const validateWebhook = [
  body('event')
    .notEmpty()
    .withMessage('Event type is required'),
  
  body('data')
    .notEmpty()
    .withMessage('Event data is required'),
  
  body('data.entry')
    .optional()
    .isObject()
    .withMessage('Entry data must be an object'),
  
  body('data.content_type')
    .optional()
    .isObject()
    .withMessage('Content type data must be an object'),
  
  handleValidationErrors,
];

// Generic parameter validation
const validateObjectId = [
  param('id')
    .isMongoId()
    .withMessage('Invalid ID format'),
  
  handleValidationErrors,
];

// Rate limiting validation
const validateRateLimit = (req, res, next) => {
  next();
};

// Test extraction validation rules
const validateTestExtraction = [
  body('contentType')
    .trim()
    .notEmpty()
    .withMessage('Content type is required')
    .isLength({ min: 1, max: 100 })
    .withMessage('Content type must be between 1 and 100 characters'),
  
  body('entry')
    .isObject()
    .withMessage('Entry must be an object')
    .custom((entry) => {
      if (Object.keys(entry).length === 0) {
        throw new Error('Entry cannot be empty');
      }
      return true;
    }),
  
  handleValidationErrors,
];

// Token validation rules
const validateTokenRequest = [
  param('stackApiKey')
    .trim()
    .notEmpty()
    .withMessage('Stack API key is required')
    .isLength({ min: 1, max: 100 })
    .withMessage('Stack API key must be between 1 and 100 characters')
    .matches(/^[a-zA-Z0-9_-]+$/)
    .withMessage('Stack API key contains invalid characters'),
  
  handleValidationErrors,
];

module.exports = {
  validateSemanticSearch,
  validateSyncRequest,
  validateOAuthCallback,
  validateWebhook,
  validateObjectId,
  validateRateLimit,
  validateTestExtraction,
  validateTokenRequest,
  handleValidationErrors,
};
