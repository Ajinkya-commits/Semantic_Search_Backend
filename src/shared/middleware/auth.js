const { AppError } = require('./errorHandler');
const OAuthToken = require('../../models/OAuthToken');

/**
 * Authenticate stack API key from request
 */
const authenticateStack = async (req, res, next) => {
  try {
    let stackApiKey = req.query.stackApiKey || req.headers['x-stack-api-key'];

    if (!stackApiKey) {
      // Try to get from active tokens if not provided
      const tokens = await OAuthToken.findActiveTokens();
      if (tokens.length === 0) {
        throw new AppError('No stack API key provided and no active stacks found', 401);
      }
      stackApiKey = tokens[0].stackApiKey;
    }

    // Validate the stack API key exists in our database
    const token = await OAuthToken.findOne({ stackApiKey, isActive: true });
    if (!token) {
      throw new AppError('Invalid or inactive stack API key', 401);
    }

    // Attach to request for use in controllers
    req.stackApiKey = stackApiKey;
    req.stackToken = token;

    next();
  } catch (error) {
    next(error);
  }
};

module.exports = {
  authenticateStack
};
