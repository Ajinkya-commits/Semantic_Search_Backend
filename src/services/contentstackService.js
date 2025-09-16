const axios = require('axios');
const config = require('../config');
const { AppError } = require('../shared/middleware/errorHandler');
const OAuthToken = require('../models/OAuthToken');
const tokenRefreshService = require('./tokenRefreshService');

class ContentstackService {
  constructor() {
    this.baseUrl = config.apis.contentstack.baseUrl;
    this.timeout = 30000; // 30 seconds
  }

  /**
   * Get valid access token for a stack
   * @param {string} stackApiKey - Stack API key
   * @returns {Promise<string>} Valid access token
   */
  async getValidAccessToken(stackApiKey) {
    try {
      // Use the token refresh service to get a valid token
      return await tokenRefreshService.getValidAccessToken(stackApiKey);
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

  /**
   * Make authenticated request to Contentstack API
   * @param {string} stackApiKey - Stack API key
   * @param {string} endpoint - API endpoint
   * @param {object} options - Request options
   * @returns {Promise<object>} API response
   */
  async makeAuthenticatedRequest(stackApiKey, endpoint, options = {}) {
    let accessToken;
    let retryCount = 0;
    const maxRetries = 2;

    while (retryCount <= maxRetries) {
      try {
        accessToken = await this.getValidAccessToken(stackApiKey);
        
        const requestOptions = {
          method: 'GET',
          url: `${this.baseUrl}${endpoint}`,
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
            'api_key': stackApiKey,
          },
          timeout: this.timeout,
          ...options,
        };

        console.debug('Making Contentstack API request', {
          endpoint,
          method: requestOptions.method,
          stackApiKey,
          retryCount,
        });

        const response = await axios(requestOptions);
        return response.data;
      } catch (error) {
        console.error('Contentstack API request failed', {
          endpoint,
          stackApiKey,
          error: error.message,
          status: error.response?.status,
          response: error.response?.data,
          retryCount,
        });

        if (error.response?.status === 401 && retryCount < maxRetries) {
          // Token is invalid, try to refresh it
          console.info('Token invalid, attempting to refresh', { stackApiKey, retryCount });
          
          try {
            // Try to refresh the token
            await tokenRefreshService.refreshAndUpdateToken(stackApiKey);
            retryCount++;
            continue; // Retry the request with the new token
          } catch (refreshError) {
            console.error('Failed to refresh token', {
              stackApiKey,
              error: refreshError.message,
            });
            
            // Mark token as inactive if refresh fails
            await OAuthToken.findOneAndUpdate(
              { stackApiKey },
              { isActive: false }
            );
            
            throw new AppError('Authentication failed - token refresh unsuccessful', 401);
          }
        } else if (error.response?.status === 401) {
          // Token is invalid and we've exhausted retries
          await OAuthToken.findOneAndUpdate(
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
  }

  /**
   * Fetch all content types for a stack
   * @param {string} stackApiKey - Stack API key
   * @returns {Promise<Array>} Array of content types
   */
  async fetchContentTypes(stackApiKey) {
    try {
      const response = await this.makeAuthenticatedRequest(
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
      console.error('Failed to fetch content types', {
        stackApiKey,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Fetch all entries for a specific content type
   * @param {string} stackApiKey - Stack API key
   * @param {string} contentTypeUid - Content type UID
   * @param {string} environment - Environment name
   * @param {object} options - Additional options
   * @returns {Promise<Array>} Array of entries
   */
  async fetchEntriesByContentType(stackApiKey, contentTypeUid, environment = 'development', options = {}) {
    try {
      const params = {
        environment,
        limit: 100,
        include_count: true,
        ...options,
      };

      const response = await this.makeAuthenticatedRequest(
        stackApiKey,
        `/content_types/${contentTypeUid}/entries`,
        { params }
      );

      return response.entries || [];
    } catch (error) {
      console.error('Failed to fetch entries by content type', {
        stackApiKey,
        contentTypeUid,
        environment,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Fetch a specific entry by UID and content type
   * @param {string} stackApiKey - Stack API key
   * @param {string} contentTypeUid - Content type UID
   * @param {string} entryUid - Entry UID
   * @param {string} environment - Environment name
   * @returns {Promise<object|null>} Entry object or null if not found
   */
  async fetchEntryByUid(stackApiKey, contentTypeUid, entryUid, environment = 'development') {
    try {
      const response = await this.makeAuthenticatedRequest(
        stackApiKey,
        `/content_types/${contentTypeUid}/entries/${entryUid}`,
        {
          params: { environment },
        }
      );

      return response.entry || null;
    } catch (error) {
      if (error.statusCode === 404) {
        return null;
      }
      console.error('Failed to fetch entry by UID', {
        stackApiKey,
        contentTypeUid,
        entryUid,
        environment,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Fetch all entries across all content types
   * @param {string} stackApiKey - Stack API key
   * @param {string} environment - Environment name
   * @returns {Promise<Array>} Array of objects with contentType and entries
   */
  async fetchAllEntries(stackApiKey, environment = 'development') {
    try {
      console.info(`Fetching all entries for stack: ${stackApiKey}`);

      // First, get all content types
      const contentTypes = await this.fetchContentTypes(stackApiKey);
      
      if (!contentTypes || contentTypes.length === 0) {
        console.warn(`No content types found for stack: ${stackApiKey}`);
        return [];
      }

      const entriesByContentType = [];

      // Fetch entries for each content type
      for (const contentType of contentTypes) {
        try {
          const entries = await this.fetchEntriesByContentType(
            stackApiKey,
            contentType.uid,
            environment
          );

          entriesByContentType.push({
            contentType: contentType.uid,
            contentTypeName: contentType.title,
            entries,
          });

          console.debug(`Fetched ${entries.length} entries for content type: ${contentType.uid}`);
        } catch (error) {
          console.error(`Failed to fetch entries for content type: ${contentType.uid}`, {
            error: error.message,
          });
          // Continue with other content types
        }
      }

      const totalEntries = entriesByContentType.reduce(
        (sum, item) => sum + item.entries.length,
        0
      );

      console.info(`Fetched ${totalEntries} total entries across ${entriesByContentType.length} content types`);

      return entriesByContentType;
    } catch (error) {
      console.error('Failed to fetch all entries', {
        stackApiKey,
        environment,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Fetch entries with pagination
   * @param {string} stackApiKey - Stack API key
   * @param {string} contentTypeUid - Content type UID
   * @param {string} environment - Environment name
   * @param {number} limit - Number of entries per page
   * @param {number} skip - Number of entries to skip
   * @returns {Promise<object>} Paginated response with entries and pagination info
   */
  async fetchEntriesPaginated(stackApiKey, contentTypeUid, environment = 'development', limit = 100, skip = 0) {
    try {
      const response = await this.makeAuthenticatedRequest(
        stackApiKey,
        `/content_types/${contentTypeUid}/entries`,
        {
          params: {
            environment,
            limit,
            skip,
            include_count: true,
          },
        }
      );

      return {
        entries: response.entries || [],
        count: response.count || 0,
        pagination: {
          limit,
          skip,
          hasMore: (skip + limit) < (response.count || 0),
        },
      };
    } catch (error) {
      console.error('Failed to fetch paginated entries', {
        stackApiKey,
        contentTypeUid,
        environment,
        limit,
        skip,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Get stack information
   * @param {string} stackApiKey - Stack API key
   * @returns {Promise<object>} Stack information
   */
  async getStackInfo(stackApiKey) {
    try {
      const response = await this.makeAuthenticatedRequest(
        stackApiKey,
        '/stacks'
      );

      return response.stack || null;
    } catch (error) {
      console.error('Failed to get stack info', {
        stackApiKey,
        error: error.message,
      });
      throw error;
    }
  }
}

// Create singleton instance
const contentstackService = new ContentstackService();

module.exports = contentstackService;
