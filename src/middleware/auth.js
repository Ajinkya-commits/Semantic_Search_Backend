const { AppError } = require('./errorHandler');
const OAuthToken = require('../models/OAuthToken');

const authenticateStack = async (req, res, next) => {
  try {
    let stackApiKey = req.headers['x-stack-api-key'] || req.body.stackApiKey;

    if (!stackApiKey) {
      const tokens = await OAuthToken.find({});
      if (tokens.length === 0) {
        throw new AppError('No stack API key provided and no stacks found', 401);
      }
      stackApiKey = tokens[0].stackApiKey;
    }

    req.stackApiKey = stackApiKey;
    next();
  } catch (error) {
    next(error);
  }
};

const autoDetectStackApiKey = async (req, res, next) => {
  try {
    let stackApiKey = req.headers['x-stack-api-key'] || req.body.stackApiKey;

    if (!stackApiKey) {
      const tokens = await OAuthToken.find({});
      
      if (!tokens || tokens.length === 0) {
        return res.status(404).json({
          success: false,
          message: 'No stacks found. Please authenticate first.',
        });
      }

      stackApiKey = tokens[0].stackApiKey;
    }

    req.stackApiKey = stackApiKey;
    next();
  } catch (error) {
    console.error('Error in auto-detect stack API key middleware:', error.message);
    next(error);
  }
};

module.exports = {
  authenticateStack,
  autoDetectStackApiKey,
};
