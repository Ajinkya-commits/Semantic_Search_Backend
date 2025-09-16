const tokenRefreshService = require('../services/tokenRefreshService');
const { AppError } = require('../shared/middleware/errorHandler');

class TokenController {
  /**
   * Refresh access token for a specific stack
   * @param {object} req - Express request object
   * @param {object} res - Express response object
   * @param {function} next - Express next function
   */
  async refreshToken(req, res, next) {
    try {
      const { stackApiKey } = req.params;

      if (!stackApiKey) {
        throw new AppError('Stack API key is required', 400);
      }

      console.info('Refreshing token for stack', { stackApiKey });

      const refreshedToken = await tokenRefreshService.refreshAndUpdateToken(stackApiKey);

      res.status(200).json({
        success: true,
        message: 'Token refreshed successfully',
        data: {
          stackApiKey: refreshedToken.stackApiKey,
          expiresAt: refreshedToken.expiresAt,
          tokenType: refreshedToken.tokenType,
        },
      });
    } catch (error) {
      console.error('Failed to refresh token', {
        stackApiKey: req.params.stackApiKey,
        error: error.message,
      });
      next(error);
    }
  }

  /**
   * Refresh all expired or expiring tokens
   * @param {object} req - Express request object
   * @param {object} res - Express response object
   * @param {function} next - Express next function
   */
  async refreshAllTokens(req, res, next) {
    try {
      console.info('Refreshing all expired or expiring tokens');

      const results = await tokenRefreshService.refreshAllExpiredTokens();

      res.status(200).json({
        success: true,
        message: 'Token refresh completed',
        data: results,
      });
    } catch (error) {
      console.error('Failed to refresh all tokens', { error: error.message });
      next(error);
    }
  }

  /**
   * Get token status for a specific stack
   * @param {object} req - Express request object
   * @param {object} res - Express response object
   * @param {function} next - Express next function
   */
  async getTokenStatus(req, res, next) {
    try {
      const { stackApiKey } = req.params;

      if (!stackApiKey) {
        throw new AppError('Stack API key is required', 400);
      }

      const OAuthToken = require('../models/OAuthToken');
      const token = await OAuthToken.findActiveByStackApiKey(stackApiKey);

      if (!token) {
        throw new AppError('No active token found for this stack', 404);
      }

      const now = new Date();
      const isExpired = token.expiresAt <= now;
      const timeUntilExpiry = token.expiresAt.getTime() - now.getTime();
      const minutesUntilExpiry = Math.floor(timeUntilExpiry / (1000 * 60));

      res.status(200).json({
        success: true,
        data: {
          stackApiKey: token.stackApiKey,
          isExpired,
          expiresAt: token.expiresAt,
          minutesUntilExpiry: isExpired ? 0 : minutesUntilExpiry,
          lastUsed: token.lastUsed,
          tokenType: token.tokenType,
          isActive: token.isActive,
        },
      });
    } catch (error) {
      console.error('Failed to get token status', {
        stackApiKey: req.params.stackApiKey,
        error: error.message,
      });
      next(error);
    }
  }

  /**
   * Get status of all tokens
   * @param {object} req - Express request object
   * @param {object} res - Express response object
   * @param {function} next - Express next function
   */
  async getAllTokensStatus(req, res, next) {
    try {
      const OAuthToken = require('../models/OAuthToken');
      const tokens = await OAuthToken.find({ isActive: true });

      const now = new Date();
      const tokenStatuses = tokens.map(token => {
        const isExpired = token.expiresAt <= now;
        const timeUntilExpiry = token.expiresAt.getTime() - now.getTime();
        const minutesUntilExpiry = Math.floor(timeUntilExpiry / (1000 * 60));

        return {
          stackApiKey: token.stackApiKey,
          isExpired,
          expiresAt: token.expiresAt,
          minutesUntilExpiry: isExpired ? 0 : minutesUntilExpiry,
          lastUsed: token.lastUsed,
          tokenType: token.tokenType,
          isActive: token.isActive,
        };
      });

      res.status(200).json({
        success: true,
        data: {
          tokens: tokenStatuses,
          total: tokenStatuses.length,
          expired: tokenStatuses.filter(t => t.isExpired).length,
          expiringSoon: tokenStatuses.filter(t => !t.isExpired && t.minutesUntilExpiry <= 5).length,
        },
      });
    } catch (error) {
      console.error('Failed to get all tokens status', { error: error.message });
      next(error);
    }
  }
}

module.exports = new TokenController();
