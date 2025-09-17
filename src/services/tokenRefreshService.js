const axios = require('axios');
const config = require('../config');
const { AppError } = require('../shared/middleware/errorHandler');
const OAuthToken = require('../models/OAuthToken');

class TokenRefreshService {
  constructor() {
    this.baseUrl = config.apis.contentstack.baseUrl;
    this.clientId = config.apis.contentstack.clientId;
    this.clientSecret = config.apis.contentstack.clientSecret;
  }

  async refreshAccessToken(refreshToken, stackApiKey) {
    try {
      console.info('Refreshing access token', { stackApiKey });

      const response = await axios.post(`${this.baseUrl.replace('/v3', '')}/oauth/token`, {
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
        client_id: this.clientId,
        client_secret: this.clientSecret,
      }, {
        headers: {
          'Content-Type': 'application/json',
        },
        timeout: 30000,
      });

      const tokenData = response.data;

      if (!tokenData.access_token) {
        throw new AppError('Invalid token response from Contentstack', 500);
      }

      // Calculate expiration time (default to 1 hour if not provided)
      const expiresIn = tokenData.expires_in || 3600; // 1 hour in seconds
      const expiresAt = new Date(Date.now() + (expiresIn * 1000));

      console.info('Successfully refreshed access token', {
        stackApiKey,
        expiresAt: expiresAt.toISOString(),
      });

      return {
        accessToken: tokenData.access_token,
        refreshToken: tokenData.refresh_token || refreshToken, // Use new refresh token if provided
        expiresAt,
        tokenType: tokenData.token_type || 'Bearer',
      };
    } catch (error) {
      console.error('Failed to refresh access token', {
        stackApiKey,
        error: error.message,
        status: error.response?.status,
        response: error.response?.data,
      });

      if (error.response?.status === 400) {
        throw new AppError('Invalid refresh token - re-authentication required', 401);
      } else if (error.response?.status === 401) {
        throw new AppError('Refresh token expired - re-authentication required', 401);
      } else if (error.response?.status === 403) {
        throw new AppError('Insufficient permissions to refresh token', 403);
      }

      throw new AppError('Failed to refresh access token', 500);
    }
  }

  async updateTokenInDatabase(stackApiKey, newTokenData) {
    try {
      const updatedToken = await OAuthToken.findOneAndUpdate(
        { stackApiKey },
        {
          accessToken: newTokenData.accessToken,
          refreshToken: newTokenData.refreshToken,
          expiresAt: newTokenData.expiresAt,
          tokenType: newTokenData.tokenType,
          isActive: true, // Reactivate the token after successful refresh
          lastUsed: new Date(),
        },
        { new: true, runValidators: true }
      );

      if (!updatedToken) {
        throw new AppError(`No token found for stack: ${stackApiKey}`, 404);
      }

      console.info('Successfully updated token in database', {
        stackApiKey,
        expiresAt: updatedToken.expiresAt.toISOString(),
        isActive: updatedToken.isActive,
      });

      return updatedToken;
    } catch (error) {
      console.error('Failed to update token in database', {
        stackApiKey,
        error: error.message,
      });
      throw error;
    }
  }

  async refreshAndUpdateToken(stackApiKey) {
    try {
      // Get current token
      const currentToken = await OAuthToken.findActiveByStackApiKey(stackApiKey);
      
      if (!currentToken) {
        throw new AppError(`No active token found for stack: ${stackApiKey}`, 404);
      }

      // Refresh the access token
      const newTokenData = await this.refreshAccessToken(currentToken.refreshToken, stackApiKey);

      // Update the token in database
      const updatedToken = await this.updateTokenInDatabase(stackApiKey, newTokenData);

      return updatedToken;
    } catch (error) {
      if (error instanceof AppError) {
        throw error;
      }
      console.error('Failed to refresh and update token', {
        stackApiKey,
        error: error.message,
      });
      throw new AppError('Failed to refresh token', 500);
    }
  }

  async getValidAccessToken(stackApiKey) {
    try {
      // First, try to find any token for this stack (including inactive ones)
      let token = await OAuthToken.findOne({ stackApiKey });
      
      if (!token) {
        throw new AppError(`No token found for stack: ${stackApiKey}. Please re-authenticate.`, 404);
      }

      // If token is inactive, try to refresh it
      if (!token.isActive) {
        console.info('Token is inactive, attempting to refresh', { stackApiKey });
        try {
          const refreshedToken = await this.refreshAndUpdateToken(stackApiKey);
          return refreshedToken.accessToken;
        } catch (refreshError) {
          console.error('Failed to refresh inactive token', {
            stackApiKey,
            error: refreshError.message,
          });
          throw new AppError(`Token is inactive and refresh failed for stack: ${stackApiKey}`, 401);
        }
      }

      // Check if token is expired or will expire soon (within 5 minutes)
      const fiveMinutesFromNow = new Date(Date.now() + (5 * 60 * 1000));
      const isExpiredOrExpiringSoon = token.expiresAt <= fiveMinutesFromNow;

      if (isExpiredOrExpiringSoon) {
        console.info('Token expired or expiring soon, refreshing', {
          stackApiKey,
          expiresAt: token.expiresAt.toISOString(),
        });

        try {
          // Refresh the token
          const refreshedToken = await this.refreshAndUpdateToken(stackApiKey);
          return refreshedToken.accessToken;
        } catch (refreshError) {
          console.error('Failed to refresh expiring token', {
            stackApiKey,
            error: refreshError.message,
          });
          // If refresh fails, mark as inactive and throw error
          await OAuthToken.findOneAndUpdate(
            { stackApiKey },
            { isActive: false }
          );
          throw new AppError(`Token refresh failed for stack: ${stackApiKey}`, 401);
        }
      }

      // Update last used timestamp
      await token.updateLastUsed();
      return token.accessToken;
    } catch (error) {
      if (error instanceof AppError) {
        throw error;
      }
      console.error('Failed to get valid access token', {
        stackApiKey,
        error: error.message,
      });
      throw new AppError('Failed to get access token', 500);
    }
  }

  async refreshAllExpiredTokens() {
    try {
      console.info('Starting refresh of all expired or expiring tokens');

      // First, deactivate any expired tokens
      await OAuthToken.deactivateExpiredTokens();

      // Find tokens that are expired or will expire within 5 minutes
      const fiveMinutesFromNow = new Date(Date.now() + (5 * 60 * 1000));
      const tokensToRefresh = await OAuthToken.find({
        $or: [
          { isActive: true, expiresAt: { $lte: fiveMinutesFromNow } },
          { isActive: false, expiresAt: { $gt: new Date(Date.now() - (24 * 60 * 60 * 1000)) } } // Include recently expired tokens (within 24 hours)
        ]
      });

      const results = {
        total: tokensToRefresh.length,
        refreshed: 0,
        failed: 0,
        errors: [],
      };

      for (const token of tokensToRefresh) {
        try {
          console.info(`Attempting to refresh token for stack: ${token.stackApiKey}`, {
            isActive: token.isActive,
            expiresAt: token.expiresAt.toISOString(),
            minutesUntilExpiry: Math.round((token.expiresAt - new Date()) / (1000 * 60))
          });

          await this.refreshAndUpdateToken(token.stackApiKey);
          results.refreshed++;
          console.info('Successfully refreshed token', { stackApiKey: token.stackApiKey });
        } catch (error) {
          results.failed++;
          results.errors.push({
            stackApiKey: token.stackApiKey,
            error: error.message,
          });
          console.error('Failed to refresh token', {
            stackApiKey: token.stackApiKey,
            error: error.message,
          });

          // If refresh fails due to invalid refresh token, mark as inactive
          if (error.message.includes('Invalid refresh token') || error.message.includes('refresh token')) {
            await OAuthToken.findOneAndUpdate(
              { stackApiKey: token.stackApiKey },
              { isActive: false }
            );
            console.warn(`Marked token as inactive due to refresh failure: ${token.stackApiKey}`);
          }
        }
      }

      // Cleanup old inactive tokens (older than 30 days)
      try {
        await OAuthToken.cleanupOldTokens();
      } catch (cleanupError) {
        console.warn('Token cleanup failed', { error: cleanupError.message });
      }

      console.info('Completed refresh of expired tokens', results);
      return results;
    } catch (error) {
      console.error('Failed to refresh expired tokens', { error: error.message });
      throw new AppError('Failed to refresh expired tokens', 500);
    }
  }
}

const tokenRefreshService = new TokenRefreshService();

module.exports = tokenRefreshService;
