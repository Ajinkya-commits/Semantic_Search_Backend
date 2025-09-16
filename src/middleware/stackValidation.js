const OAuthToken = require('../models/OAuthToken');

/**
 * Middleware to detect and validate stack API key from request
 * Supports multiple detection methods for different contexts
 */
const autoDetectStackApiKey = async (req, res, next) => {
  try {
    // First, check if stackApiKey is explicitly provided
    const explicitStackApiKey = req.body.stackApiKey || req.query.stackApiKey || req.params.stackApiKey;
    
    if (explicitStackApiKey) {
      // Validate the explicitly provided stackApiKey
      if (!explicitStackApiKey.startsWith('blt') || explicitStackApiKey.length < 10) {
        return res.status(400).json({
          error: 'Invalid stack API key format',
          message: 'Stack API key must be a valid Contentstack API key (starts with "blt")',
        });
      }
      
      // Check if this stack has a valid token
      const token = await OAuthToken.findActiveByStackApiKey(explicitStackApiKey);
      if (!token) {
        return res.status(404).json({
          error: 'Stack not found or inactive',
          message: 'The provided stack API key does not have a valid authentication token.',
        });
      }
      
      req.stackApiKey = explicitStackApiKey;
      console.log('Using explicitly provided stack API key', { stackApiKey: explicitStackApiKey });
      return next();
    }

    // If no explicit stackApiKey, try to auto-detect from available stacks
    const activeTokens = await OAuthToken.findActiveTokens();
    
    if (!activeTokens || activeTokens.length === 0) {
      return res.status(404).json({
        error: 'No active stacks found',
        message: 'No stacks with valid authentication tokens found. Please ensure the app is installed and authenticated.',
      });
    }

    if (activeTokens.length === 1) {
      // Only one active stack, use it automatically
      req.stackApiKey = activeTokens[0].stackApiKey;
      console.log('Auto-detected single active stack', { stackApiKey: req.stackApiKey });
      return next();
    }

    // Multiple stacks available - use the most recently used one
    const mostRecentToken = activeTokens.sort((a, b) => {
      // Sort by lastUsed first, then by createdAt
      const aLastUsed = a.lastUsed || a.createdAt;
      const bLastUsed = b.lastUsed || b.createdAt;
      return new Date(bLastUsed) - new Date(aLastUsed);
    })[0];

    req.stackApiKey = mostRecentToken.stackApiKey;
    console.log('Auto-detected most recently used stack', { 
      stackApiKey: req.stackApiKey,
      lastUsed: mostRecentToken.lastUsed,
      totalStacks: activeTokens.length
    });
    return next();

  } catch (error) {
    console.error('Error in auto-detect stack API key middleware', {
      error: error.message,
      method: req.method,
      url: req.url,
    });

    return res.status(500).json({
      error: 'Failed to detect stack API key',
      details: error.message,
    });
  }
};

/**
 * Middleware to ensure stack isolation - automatically detects stackApiKey
 */
const ensureStackIsolation = (req, res, next) => {
  // For routes that don't require stackApiKey (like health checks, OAuth callbacks)
  const publicRoutes = ['/health', '/oauth/callback', '/api/indexes/list', '/api/indexes/stacks'];
  
  if (publicRoutes.some(route => req.path.startsWith(route))) {
    return next();
  }

  // For all other routes, auto-detect stackApiKey
  return autoDetectStackApiKey(req, res, next);
};

/**
 * Middleware to validate that the stack has a valid token
 */
const validateStackToken = async (req, res, next) => {
  try {
    const tokenService = require('../services/tokenService');
    const stackApiKey = req.stackApiKey;

    if (!stackApiKey) {
      return res.status(400).json({
        error: 'Stack API key is required',
      });
    }

    // Check if stack has a valid token
    const token = await tokenService.getValidAccessToken(stackApiKey);
    
    if (!token) {
      console.warn('No valid token found for stack', {
        stackApiKey,
        method: req.method,
        url: req.url,
      });

      return res.status(401).json({
        error: 'No valid authentication token found for this stack',
        message: 'Please ensure the app is properly installed and authenticated for this stack.',
      });
    }

    // Add token info to request for use in controllers
    req.stackToken = token;
    
    // Update lastUsed timestamp (don't await to avoid blocking the request)
    token.updateLastUsed().catch(err => {
      console.error('Failed to update lastUsed timestamp', {
        stackApiKey,
        error: err.message,
      });
    });
    
    next();
  } catch (error) {
    console.error('Error validating stack token', {
      stackApiKey: req.stackApiKey,
      error: error.message,
    });

    return res.status(500).json({
      error: 'Failed to validate stack authentication',
      details: error.message,
    });
  }
};

/**
 * Middleware to ensure the stack has a Pinecone index
 */
const validateStackIndex = async (req, res, next) => {
  try {
    const pineconeIndexService = require('../services/pineconeIndexService');
    const stackApiKey = req.stackApiKey;

    if (!stackApiKey) {
      return res.status(400).json({
        error: 'Stack API key is required',
      });
    }

    // Check if stack has an index
    const indexName = pineconeIndexService.generateIndexName(stackApiKey);
    const indexExists = await pineconeIndexService.indexExists(indexName);

    if (!indexExists) {
      console.warn('No Pinecone index found for stack', {
        stackApiKey,
        indexName,
        method: req.method,
        url: req.url,
      });

      return res.status(404).json({
        error: 'No search index found for this stack',
        message: 'Please create a search index for this stack first using the index management endpoints.',
        stackApiKey,
        indexName,
      });
    }

    // Add index name to request for use in controllers
    req.stackIndexName = indexName;
    
    next();
  } catch (error) {
    console.error('Error validating stack index', {
      stackApiKey: req.stackApiKey,
      error: error.message,
    });

    return res.status(500).json({
      error: 'Failed to validate stack index',
      details: error.message,
    });
  }
};

module.exports = {
  ensureStackIsolation,
  validateStackToken,
  validateStackIndex,
};
