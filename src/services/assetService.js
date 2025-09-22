const axios = require('axios');
const config = require('../config');
const { AppError } = require('../middleware/errorHandler');

const baseUrl = config.apis.contentstack.baseUrl;
const timeout = 30000;

async function fetchAssets(stackApiKey, accessToken, options = {}) {
  if (!stackApiKey || !accessToken) throw new AppError('Stack API key and access token required', 400);

  const { folder, includeFolders, environment, limit, skip, includeCount } = options;

  try {
    const params = {
      environment: environment || 'development',
      limit: limit || 100,
      skip: skip || 0,
      include_count: includeCount !== false,
      include_publish_details: true
    };

    if (folder) params.folder = folder;
    if (includeFolders) params.include_folders = includeFolders;

    const response = await axios.get(`${baseUrl}/assets`, {
      headers: {
        'api_key': stackApiKey,
        'authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      params,
      timeout
    });

    return {
      assets: response.data.assets || [],
      count: response.data.count || 0,
      total: response.data.total || 0
    };

  } catch (error) {
    console.error('Asset fetch failed:', {
      stackApiKey,
      error: error.message,
      status: error.response?.status
    });

    if (error.response?.status === 401) throw new AppError('Unauthorized - invalid access token', 401);
    if (error.response?.status === 422) throw new AppError('Invalid request parameters', 422);

    throw new AppError('Failed to fetch assets from Contentstack', 500);
  }
}

async function fetchAllAssets(stackApiKey, accessToken, options = {}) {
  const allAssets = [];
  let skip = 0;
  const limit = 100;
  let hasMore = true;

  while (hasMore) {
    try {
      const result = await fetchAssets(stackApiKey, accessToken, { ...options, limit, skip });

      allAssets.push(...result.assets);
      
      hasMore = result.assets.length === limit;
      skip += limit;

      if (skip > 10000) {
        console.warn('Asset fetch limit reached, stopping at 10,000 assets');
        break;
      }

    } catch (error) {
      console.error('Error fetching asset batch:', error.message);
      break;
    }
  }

  return allAssets;
}

async function fetchImageAssets(stackApiKey, accessToken, options = {}) {
  const assets = await fetchAllAssets(stackApiKey, accessToken, options);
  
  const imageAssets = assets.filter(asset => {
    if (!asset.content_type || asset.is_dir) return false;

    const contentType = asset.content_type.toLowerCase();
    const imageTypes = [
      'image/jpeg', 'image/jpg', 'image/png', 'image/gif', 
      'image/webp', 'image/svg+xml', 'image/bmp', 'image/tiff'
    ];

    return imageTypes.includes(contentType);
  });

  return imageAssets.map(asset => ({
    uid: asset.uid,
    title: asset.title || asset.filename,
    filename: asset.filename,
    url: asset.url,
    content_type: asset.content_type,
    file_size: asset.file_size,
    dimension: asset.dimension,
    created_at: asset.created_at,
    updated_at: asset.updated_at,
    tags: asset.tags || [],
    description: asset.description || '',
    alt: asset.alt || ''
  }));
}

module.exports = {
  fetchAssets,
  fetchAllAssets,
  fetchImageAssets
};
