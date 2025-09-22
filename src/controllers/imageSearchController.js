const { AppError, asyncHandler } = require('../middleware/errorHandler');
const imageEmbeddingService = require('../services/imageEmbeddingService');
const assetService = require('../services/assetService');
const vectorSearchService = require('../services/vectorSearchService');
const { getValidAccessToken } = require('../services/tokenService');

const indexImages = asyncHandler(async (req, res) => {
  const stackApiKey = req.stackApiKey;
  
  if (!stackApiKey) {
    throw new AppError('Stack API key is required', 400);
  }

  try {
    const accessToken = await getValidAccessToken(stackApiKey);
    
    // Fetch all image assets from Contentstack
    const imageAssets = await assetService.fetchImageAssets(
      stackApiKey, 
      accessToken
    );

    if (imageAssets.length === 0) {
      return res.json({
        success: true,
        message: 'No images found to index',
        indexed: 0,
        total: 0
      });
    }

    const results = {
      total: imageAssets.length,
      indexed: 0,
      failed: 0,
      errors: []
    };

    // Process images in batches
    const batchSize = 5;
    for (let i = 0; i < imageAssets.length; i += batchSize) {
      const batch = imageAssets.slice(i, i + batchSize);
      
      const batchPromises = batch.map(async (asset) => {
        try {
          // Generate embedding for image URL
          const embeddingResult = await imageEmbeddingService.embedImage(asset.url);
          
          // Create minimal metadata for Pinecone
          const metadata = {
            uid: asset.uid,
            title: asset.title || asset.filename,
            url: asset.url,
            type: 'image',
            stackApiKey
          };

          // Store in Pinecone with image namespace
          await vectorSearchService.indexEntry(
            `image_${asset.uid}`,
            asset.title || asset.filename, // text description
            embeddingResult.embedding,
            metadata,
            stackApiKey
          );

          results.indexed++;
          return { success: true, uid: asset.uid };

        } catch (error) {
          console.error(`Failed to index image ${asset.uid}:`, error.message);
          results.failed++;
          results.errors.push({
            uid: asset.uid,
            error: error.message
          });
          return { success: false, uid: asset.uid, error: error.message };
        }
      });

      await Promise.all(batchPromises);
    }

    res.json({
      success: true,
      message: `Image indexing completed`,
      ...results
    });

  } catch (error) {
    console.error('Image indexing error:', error.message);
    throw new AppError('Failed to index images', 500);
  }
});

const searchImages = asyncHandler(async (req, res) => {
  const { imageUrl, limit = 5 } = req.body;
  const stackApiKey = req.stackApiKey;

  if (!stackApiKey) {
    throw new AppError('Stack API key is required', 400);
  }

  if (!imageUrl) {
    throw new AppError('Image URL is required', 400);
  }

  try {
    // Search by image similarity only
    const embeddingResult = await imageEmbeddingService.embedImage(imageUrl);
    const queryEmbedding = embeddingResult.embedding;

    // Search in Pinecone image namespace with more permissive threshold
    const searchResults = await vectorSearchService.search(
      queryEmbedding,
      parseInt(limit),
      { stackApiKey, type: 'image' },
      0.1, // Lowered from 0.4 to 0.1 for more permissive matching
      stackApiKey
    );

    if (!searchResults || !Array.isArray(searchResults) || searchResults.length === 0) {
      return res.json({
        success: true,
        imageUrl: imageUrl,
        results: [],
        total: 0,
        message: 'No image matches found',
        searchType: 'image'
      });
    }

    const results = searchResults.map(match => ({
      uid: match.uid,
      title: match.title,
      url: match.url,
      similarity: match.score,
      type: 'image',
      contentstack_url: `https://eu-app.contentstack.com/#!/stack/${stackApiKey}/assets/${match.uid}?branch=main`
    }));

    res.json({
      success: true,
      imageUrl: imageUrl,
      results,
      total: results.length,
      searchType: 'image'
    });

  } catch (error) {
    console.error('Image search error:', error.message);
    throw new AppError('Failed to search images', 500);
  }
});

const searchImageByUpload = asyncHandler(async (req, res) => {
  const { limit = 5 } = req.body;
  const stackApiKey = req.stackApiKey;

  if (!stackApiKey) {
    throw new AppError('Stack API key is required', 400);
  }

  if (!req.file) {
    throw new AppError('Image file is required', 400);
  }

  try {
    console.log('Generating embedding for uploaded image...');
    
    // Check if Python service is available
    const serviceAvailable = await imageEmbeddingService.checkPythonService();
    if (!serviceAvailable) {
      throw new AppError('Image embedding service is not available. Please ensure the Python service is running on port 5001.', 503);
    }
    
    // Generate embedding from uploaded image
    const embeddingResult = await imageEmbeddingService.embedImageFromFile(
      req.file.buffer,
      req.file.mimetype
    );

    console.log('Embedding generated, searching...');

    // Search in Pinecone image namespace with lower similarity threshold
    const searchResults = await vectorSearchService.search(
      embeddingResult.embedding,
      Math.max(parseInt(limit), 5), // Ensure minimum 5 results
      { stackApiKey, type: 'image' },
      0.1, // Keep low threshold for uploaded images
      stackApiKey
    );

    console.log(`Upload search results found: ${searchResults?.length || 0}`);

    // Create base64 image preview for response
    const base64Image = req.file.buffer.toString('base64');
    const imagePreview = `data:${req.file.mimetype};base64,${base64Image}`;

    if (!searchResults || !Array.isArray(searchResults) || searchResults.length === 0) {
      console.log('No results found. Possible reasons:');
      console.log('1. No images indexed in Pinecone');
      console.log('2. Search threshold too strict (now using 0.1)');
      console.log('3. Wrong namespace or index');
      console.log('4. Embedding mismatch between indexed and search embeddings');
      
      return res.json({
        success: true,
        query: 'Uploaded image similarity search',
        uploadedImage: {
          filename: req.file.originalname,
          size: req.file.size,
          mimetype: req.file.mimetype,
          preview: imagePreview
        },
        results: [],
        total: 0,
        message: 'No image matches found',
        searchType: 'upload'
      });
    }

    const results = searchResults.map(match => ({
      uid: match.uid,
      title: match.title,
      url: match.url,
      similarity: match.score,
      type: 'image',
      contentstack_url: `https://eu-app.contentstack.com/#!/stack/${stackApiKey}/assets/${match.uid}?branch=main`
    }));

    res.json({
      success: true,
      query: 'Uploaded image similarity search',
      uploadedImage: {
        filename: req.file.originalname,
        size: req.file.size,
        mimetype: req.file.mimetype,
        preview: imagePreview
      },
      results,
      total: results.length,
      searchType: 'upload'
    });

  } catch (error) {
    console.error('Image upload search error:', error.message);
    throw new AppError('Failed to search by uploaded image', 500);
  }
});

const getImageStats = asyncHandler(async (req, res) => {
  const stackApiKey = req.stackApiKey;

  if (!stackApiKey) {
    throw new AppError('Stack API key is required', 400);
  }

  try {
    // Get stats from Pinecone image namespace
    const stats = await vectorSearchService.getIndexStats(stackApiKey);
    
    res.json({
      success: true,
      stackApiKey,
      imageStats: {
        totalImages: stats.totalVectors || 0,
        dimensions: stats.dimensions || 0,
        lastUpdated: stats.lastUpdated || null,
        indexName: `${stackApiKey}_images`
      }
    });

  } catch (error) {
    console.error('Image stats error:', error.message);
    throw new AppError('Failed to get image statistics', 500);
  }
});


module.exports = {
  indexImages,
  searchImages,
  searchImageByUpload,
  getImageStats
};
