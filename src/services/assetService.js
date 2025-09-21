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

async function fetchAssetByUid(uid, stackApiKey, accessToken) {
  if (!uid || !stackApiKey || !accessToken) throw new AppError('Asset UID, stack API key, and access token required', 400);

  try {
    const response = await axios.get(`${baseUrl}/v3/assets/${uid}`, {
      headers: {
        'api_key': stackApiKey,
        'authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      timeout
    });

    return response.data.asset;

  } catch (error) {
    console.error('Failed to fetch asset by UID:', {
      uid,
      stackApiKey,
      error: error.message,
      status: error.response?.status
    });

    if (error.response?.status === 404) throw new AppError('Asset not found', 404);
    if (error.response?.status === 401) throw new AppError('Unauthorized - invalid access token', 401);

    throw new AppError('Failed to fetch asset from Contentstack', 500);
  }
}

function isImageAsset(asset) {
  if (!asset || !asset.content_type || asset.is_dir) return false;

  const contentType = asset.content_type.toLowerCase();
  const imageTypes = [
    'image/jpeg', 'image/jpg', 'image/png', 'image/gif', 
    'image/webp', 'image/svg+xml', 'image/bmp', 'image/tiff'
  ];

  return imageTypes.includes(contentType);
}

function extractImageMetadata(asset) {
  if (!isImageAsset(asset)) return null;

  return {
    uid: asset.uid,
    title: asset.title || asset.filename,
    filename: asset.filename,
    url: asset.url,
    content_type: asset.content_type,
    file_size: asset.file_size,
    width: asset.dimension?.width || null,
    height: asset.dimension?.height || null,
    created_at: asset.created_at,
    updated_at: asset.updated_at,
    tags: asset.tags || [],
    description: asset.description || '',
    alt: asset.alt || '',
    folder: asset.parent_uid || null
  };
}

async function downloadImageBuffer(imageUrl) {
  if (!imageUrl) throw new AppError('Image URL required', 400);

  try {
    const response = await axios.get(imageUrl, {
      responseType: 'arraybuffer',
      timeout,
      maxContentLength: 10 * 1024 * 1024, // 10MB max
      headers: {
        'User-Agent': 'ContentStack-SemanticSearch/1.0',
        'Accept': 'image/*,*/*;q=0.8'
      }
    });

    const contentType = response.headers['content-type'];
    if (!contentType || !contentType.startsWith('image/')) throw new AppError(`Invalid content type: ${contentType}`, 400);

    return {
      buffer: Buffer.from(response.data),
      contentType,
      size: response.data.byteLength
    };

  } catch (error) {
    console.error('Failed to download image:', {
      imageUrl,
      error: error.message,
      status: error.response?.status
    });

    if (error.response?.status === 404) throw new AppError('Image not found', 404);
    if (error.response?.status === 403) throw new AppError('Access denied to image', 403);

    throw new AppError('Failed to download image', 500);
  }
}

module.exports = {
  fetchAssets,
  fetchAllAssets,
  fetchImageAssets,
  fetchAssetByUid,
  isImageAsset,
  extractImageMetadata,
  downloadImageBuffer
};
