const axios = require('axios');
const config = require('../config');
const { AppError } = require('../middleware/errorHandler');
const OAuthToken = require('../models/OAuthToken');

const saveOrUpdateToken = async (tokenData) => {
  try {
    const { stackApiKey, accessToken, refreshToken, expiresIn, expiresAt } = tokenData;
    let calculatedExpiresAt;
    if (expiresAt) {
      calculatedExpiresAt = new Date(expiresAt);
    } else if (expiresIn) {
      calculatedExpiresAt = new Date(Date.now() + (expiresIn * 1000));
    } else {
      calculatedExpiresAt = new Date(Date.now() + (3600 * 1000));
    }

    const existingToken = await OAuthToken.findOne({ stackApiKey });

    if (existingToken) {
      existingToken.accessToken = accessToken;
      existingToken.refreshToken = refreshToken;
      existingToken.expiresAt = calculatedExpiresAt;
      existingToken.lastUsed = new Date();
      await existingToken.save();
      return existingToken;
    } else {
      const newToken = new OAuthToken({
        stackApiKey,
        accessToken,
        refreshToken,
        expiresAt: calculatedExpiresAt,
        lastUsed: new Date()
      });
      await newToken.save();
      return newToken;
    }
  } catch (error) {
    throw error;
  }
};

const getValidAccessToken = async (stackApiKey) => {
  try {
    const token = await OAuthToken.findOne({ stackApiKey });
    
    if (!token) {
      throw new AppError('No token found for stack. Please authenticate first.', 404);
    }
    const fiveMinutesFromNow = new Date(Date.now() + (5 * 60 * 1000));
    const needsRefresh = token.expiresAt <= fiveMinutesFromNow;

    if (needsRefresh) {
      const newAccessToken = await refreshAccessToken(stackApiKey);
      return newAccessToken;
    }
    token.lastUsed = new Date();
    await token.save();
    return token.accessToken;
  } catch (error) {
    throw error;
  }
};

const refreshAccessToken = async (stackApiKey) => {
  try {
    const token = await OAuthToken.findOne({ stackApiKey });
    
    if (!token || !token.refreshToken) {
      throw new AppError('No refresh token found for stack', 404);
    }

    const response = await axios.post(`${config.apis.contentstack.baseUrl.replace('/v3', '')}/oauth/token`, {
      grant_type: 'refresh_token',
      refresh_token: token.refreshToken,
      client_id: config.apis.contentstack.clientId,
      client_secret: config.apis.contentstack.clientSecret,
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

    const expiresIn = tokenData.expires_in || 3600;
    const expiresAt = new Date(Date.now() + (expiresIn * 1000));

    token.accessToken = tokenData.access_token;
    token.refreshToken = tokenData.refresh_token || token.refreshToken;
    token.expiresAt = expiresAt;
    token.lastUsed = new Date();
    await token.save();

    return token.accessToken;
  } catch (error) {
    if (error.response?.status === 400 || error.response?.status === 401) {
      throw new AppError('Refresh token expired - re-authentication required', 401);
    }
    throw new AppError(`Failed to refresh access token: ${error.message}`, 500);
  }
};

module.exports = {
  saveOrUpdateToken,
  getValidAccessToken,
  refreshAccessToken,
};
