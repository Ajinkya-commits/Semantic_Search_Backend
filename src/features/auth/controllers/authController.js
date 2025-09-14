const logger = require('../../../config/logger');
const { AppError, asyncHandler } = require('../../../shared/middleware/errorHandler');
const OAuthToken = require('../../../models/OAuthToken');
const tokenService = require('../../../services/tokenService');

class AuthController {
  /**
   * Initiate OAuth flow
   */
  initiateOAuth = asyncHandler(async (req, res) => {
    try {
      // OAuth initiation would typically redirect to Contentstack OAuth URL
      // For now, return a placeholder response
      res.json({
        success: true,
        message: 'OAuth initiation not implemented - use direct token configuration',
        authUrl: 'https://eu-app.contentstack.com/#!/stack-settings/tokens'
      });

    } catch (error) {
      logger.error('Failed to initiate OAuth', { error: error.message });
      throw error;
    }
  });

  /**
   * Handle OAuth callback
   */
  handleOAuthCallback = asyncHandler(async (req, res) => {
    const { code, state } = req.body;

    if (!code) {
      throw new AppError('Authorization code is required', 400);
    }

    try {
      // OAuth callback handling would exchange code for token
      // For now, return a placeholder response
      res.json({
        success: true,
        message: 'OAuth callback not implemented - use direct token configuration'
      });

    } catch (error) {
      logger.error('OAuth callback failed', { error: error.message });
      throw error;
    }
  });

  /**
   * Refresh OAuth token
   */
  refreshToken = asyncHandler(async (req, res) => {
    const { stackApiKey } = req.body;

    if (!stackApiKey) {
      throw new AppError('Stack API key is required', 400);
    }

    try {
      const refreshedToken = await tokenService.refreshAccessToken(stackApiKey);
      
      res.json({
        success: true,
        message: 'Token refreshed successfully',
        expiresAt: refreshedToken.expiresAt
      });

    } catch (error) {
      logger.error('Token refresh failed', { error: error.message, stackApiKey });
      throw error;
    }
  });

  /**
   * Get active tokens
   */
  getActiveTokens = asyncHandler(async (req, res) => {
    try {
      const tokens = await tokenService.getActiveTokens();
      
      const sanitizedTokens = tokens.map(token => ({
        stackApiKey: token.stackApiKey,
        stackName: token.stackName,
        isActive: token.isActive,
        expiresAt: token.expiresAt,
        createdAt: token.createdAt,
        lastUsed: token.lastUsed
      }));

      res.json({
        success: true,
        tokens: sanitizedTokens,
        count: sanitizedTokens.length
      });

    } catch (error) {
      logger.error('Failed to get active tokens', { error: error.message });
      throw error;
    }
  });

  /**
   * Revoke token
   */
  revokeToken = asyncHandler(async (req, res) => {
    const { stackApiKey } = req.params;

    if (!stackApiKey) {
      throw new AppError('Stack API key is required', 400);
    }

    try {
      await tokenService.deactivateToken(stackApiKey);
      
      res.json({
        success: true,
        message: 'Token revoked successfully',
        stackApiKey
      });

    } catch (error) {
      logger.error('Token revocation failed', { error: error.message, stackApiKey });
      throw error;
    }
  });
}

module.exports = new AuthController();
