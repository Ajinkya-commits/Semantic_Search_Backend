const OAuthToken = require("../models/OAuthToken");
const logger = require("../config/logger");
const { AppError } = require("../shared/middleware/errorHandler");

class TokenService {
  async saveOrUpdateToken(tokenData) {
    try {
      const {
        stackApiKey,
        organizationUid,
        accessToken,
        refreshToken,
        expiresIn,
      } = tokenData;

      if (!stackApiKey || !organizationUid || !accessToken || !refreshToken) {
        throw new AppError("Missing required token data", 400);
      }

      // Calculate expiration date
      const expiresAt = new Date(Date.now() + expiresIn * 1000);

      // Check if token already exists
      const existingToken = await OAuthToken.findOne({ stackApiKey });

      if (existingToken) {
        // Update existing token
        existingToken.organizationUid = organizationUid;
        existingToken.accessToken = accessToken;
        existingToken.refreshToken = refreshToken;
        existingToken.expiresAt = expiresAt;
        existingToken.isActive = true;
        existingToken.lastUsed = new Date();

        await existingToken.save();
        logger.info(`Updated OAuth token for stack: ${stackApiKey}`);
        return existingToken;
      } else {
        // Create new token
        const newToken = new OAuthToken({
          stackApiKey,
          organizationUid,
          accessToken,
          refreshToken,
          expiresAt,
          isActive: true,
        });

        await newToken.save();
        logger.info(`Created new OAuth token for stack: ${stackApiKey}`);
        return newToken;
      }
    } catch (error) {
      logger.error("Failed to save or update token", {
        error: error.message,
        stackApiKey: tokenData?.stackApiKey,
      });
      throw error;
    }
  }

  async getValidAccessToken(stackApiKey) {
    try {
      const token = await OAuthToken.findActiveByStackApiKey(stackApiKey);

      if (!token) {
        throw new AppError(
          `No valid token found for stack: ${stackApiKey}`,
          401
        );
      }

      if (token.isExpired()) {
        // Token is expired, mark as inactive
        token.isActive = false;
        await token.save();
        throw new AppError(`Token expired for stack: ${stackApiKey}`, 401);
      }

      // Update last used timestamp
      await token.updateLastUsed();

      return token; // Return the full token document, not just token.accessToken
    } catch (error) {
      if (error instanceof AppError) {
        throw error;
      }
      logger.error("Failed to get valid access token", {
        stackApiKey,
        error: error.message,
      });
      throw new AppError("Failed to get access token", 500);
    }
  }

  async refreshAccessToken(stackApiKey) {
    try {
      const token = await OAuthToken.findOne({
        stackApiKey,
        isActive: true,
      });

      if (!token) {
        throw new AppError(`No token found for stack: ${stackApiKey}`, 404);
      }

      // This would typically make a request to Contentstack to refresh the token
      // For now, we'll just return the existing token
      // In a real implementation, you'd call the Contentstack token refresh endpoint

      logger.warn(`Token refresh not implemented for stack: ${stackApiKey}`);
      return token;
    } catch (error) {
      logger.error("Failed to refresh access token", {
        stackApiKey,
        error: error.message,
      });
      throw error;
    }
  }

  async deactivateToken(stackApiKey) {
    try {
      const result = await OAuthToken.updateOne(
        { stackApiKey },
        { isActive: false }
      );

      if (result.modifiedCount > 0) {
        logger.info(`Deactivated token for stack: ${stackApiKey}`);
        return true;
      } else {
        logger.warn(`No token found to deactivate for stack: ${stackApiKey}`);
        return false;
      }
    } catch (error) {
      logger.error("Failed to deactivate token", {
        stackApiKey,
        error: error.message,
      });
      throw error;
    }
  }

  async getActiveTokens() {
    try {
      return await OAuthToken.findActiveTokens();
    } catch (error) {
      logger.error("Failed to get active tokens", {
        error: error.message,
      });
      throw error;
    }
  }

  async cleanupExpiredTokens() {
    try {
      return await OAuthToken.deactivateExpiredTokens();
    } catch (error) {
      logger.error("Failed to cleanup expired tokens", {
        error: error.message,
      });
      throw error;
    }
  }
}

const tokenService = new TokenService();

module.exports = {
  saveOrUpdateToken: tokenService.saveOrUpdateToken.bind(tokenService),
  getValidAccessToken: tokenService.getValidAccessToken.bind(tokenService),
  refreshAccessToken: tokenService.refreshAccessToken.bind(tokenService),
  deactivateToken: tokenService.deactivateToken.bind(tokenService),
  getActiveTokens: tokenService.getActiveTokens.bind(tokenService),
  cleanupExpiredTokens: tokenService.cleanupExpiredTokens.bind(tokenService),
};
