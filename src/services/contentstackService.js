const axios = require('axios');
const config = require('../config');
const { AppError } = require('../middleware/errorHandler');
const OAuthToken = require('../models/OAuthToken');
const tokenService = require('./tokenService');

const getValidAccessToken = async (stackApiKey) => {
  try {
    return await tokenService.getValidAccessToken(stackApiKey);
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }
    console.error('Failed to get valid access token:', error.message);
    throw new AppError('Failed to get access token', 500);
  }
};

const makeAuthenticatedRequest = async (stackApiKey, endpoint, options = {}) => {
  let accessToken;
  let retryCount = 0;
  const maxRetries = 2;

  while (retryCount <= maxRetries) {
    try {
      accessToken = await getValidAccessToken(stackApiKey);
      
      const requestOptions = {
        method: 'GET',
        url: `${config.apis.contentstack.baseUrl}${endpoint}`,
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
          'api_key': stackApiKey,
        },
        timeout: 30000,
        ...options,
      };

      const response = await axios(requestOptions);
      return response.data;
    } catch (error) {
      retryCount++;
      
      if (error.response?.status === 401 && retryCount <= maxRetries) {
        console.log(`Authentication failed, retrying... (${retryCount}/${maxRetries})`);
        await OAuthToken.updateOne(
          { stackApiKey },
          { isActive: false }
        );
        continue;
      }

      if (error.response?.status === 401) {
        await OAuthToken.updateOne(
          { stackApiKey },
          { isActive: false }
        );
        throw new AppError('Authentication failed - token may be invalid', 401);
      } else if (error.response?.status === 404) {
        throw new AppError('Resource not found', 404);
      } else if (error.response?.status === 429) {
        throw new AppError('Rate limit exceeded for Contentstack API', 429);
      } else if (error.response?.status >= 500) {
        throw new AppError('Contentstack API temporarily unavailable', 503);
      }

      throw new AppError('Contentstack API request failed', 500);
    }
  }
};

const fetchContentTypes = async (stackApiKey) => {
  try {
    const response = await makeAuthenticatedRequest(
      stackApiKey,
      '/content_types',
      {
        params: {
          include_count: true,
          limit: 100,
        },
      }
    );

    return response.content_types || [];
  } catch (error) {
    console.error('Failed to fetch content types:', error.message);
    throw error;
  }
};

const fetchEntriesByContentType = async (stackApiKey, contentTypeUid, environment = 'development', options = {}) => {
  try {
    const params = {
      environment,
      limit: 100,
      include_count: true,
      ...options,
    };

    const response = await makeAuthenticatedRequest(
      stackApiKey,
      `/content_types/${contentTypeUid}/entries`,
      { params }
    );

    return response.entries || [];
  } catch (error) {
    console.error('Failed to fetch entries by content type:', error.message);
    throw error;
  }
};

const fetchEntryByUid = async (stackApiKey, contentTypeUid, entryUid, environment = 'development') => {
  try {
    console.log(`🔍 Fetching entry: ${entryUid} from ${contentTypeUid} in ${environment}`);
    
    const response = await makeAuthenticatedRequest(
      stackApiKey,
      `/content_types/${contentTypeUid}/entries/${entryUid}`,
      {
        params: { environment },
      }
    );

    console.log(`Response structure:`, Object.keys(response || {}));
    
    if (response && response.entry) {
      console.log(`Entry found: ${response.entry.title || response.entry.name || entryUid}`);
      return { entry: response.entry }; // Wrap in the expected structure
    } else {
      console.log(`No entry in response for ${entryUid}`);
      return null;
    }
  } catch (error) {
    if (error.response?.status === 404) {
      console.log(`Entry not found (404): ${entryUid}`);
      return null;
    }
    console.error(`Failed to fetch entry ${entryUid}:`, error.message);
    throw error;
  }
};

const fetchAllEntries = async (stackApiKey, environment = 'development') => {
  try {
    console.log(`Fetching all entries for stack: ${stackApiKey}`);

    const contentTypes = await fetchContentTypes(stackApiKey);
    
    if (!contentTypes || contentTypes.length === 0) {
      console.warn(`No content types found for stack: ${stackApiKey}`);
      return [];
    }

    const entriesByContentType = [];

    for (const contentType of contentTypes) {
      try {
        const entries = await fetchEntriesByContentType(
          stackApiKey,
          contentType.uid,
          environment
        );

        if (entries && entries.length > 0) {
          entriesByContentType.push({
            contentType: contentType.uid,
            entries,
          });
        }
      } catch (error) {
        console.error(`Failed to fetch entries for content type ${contentType.uid}:`, error.message);
      }
    }

    const totalEntries = entriesByContentType.reduce(
      (sum, item) => sum + item.entries.length,
      0
    );

    console.log(`Fetched ${totalEntries} total entries across ${entriesByContentType.length} content types`);

    return entriesByContentType;
  } catch (error) {
    console.error('Failed to fetch all entries:', error.message);
    throw error;
  }
};

module.exports = {
  getValidAccessToken,
  makeAuthenticatedRequest,
  fetchContentTypes,
  fetchEntriesByContentType,
  fetchEntryByUid,
  fetchAllEntries,
};
