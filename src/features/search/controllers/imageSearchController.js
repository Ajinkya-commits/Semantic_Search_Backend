const { AppError, asyncHandler } = require('../../../shared/middleware/errorHandler');
const imageEmbeddingService = require('../../../services/imageEmbeddingService');
const vectorSearchService = require('../../../services/vectorSearchService');
const OAuthToken = require('../../../models/OAuthToken');
const multer = require('multer');
const path = require('path');

// Configure multer for image uploads
const storage = multer.memoryStorage();
const upload = multer({
  storage: storage,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|gif|webp/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);

    if (mimetype && extname) {
      return cb(null, true);
    } else {
      cb(new AppError('Only image files are allowed', 400));
    }
  }
});

class ImageSearchController {
  /**
   * Image-based similarity search by URL
   */
  searchByImage = asyncHandler(async (req, res) => {
    const { imageUrl, limit = 10, threshold = 0.0, filters = {} } = req.body;

    if (!imageUrl || typeof imageUrl !== 'string') {
      throw new AppError('Image URL must be provided', 400);
    }

    console.log('Image search request', { imageUrl, limit, threshold });

    // Get stackApiKey from active OAuth token in MongoDB
    const oauthToken = await OAuthToken.findOne({ 
      isActive: true,
      expiresAt: { $gt: new Date() }
    }).sort({ createdAt: -1 });
    
    if (!oauthToken) {
      throw new AppError('No active OAuth token found. Please reinstall the app.', 401);
    }
    
    const stackApiKey = oauthToken.stackApiKey;

    // Generate image embedding
    const queryEmbedding = await imageEmbeddingService.generateImageEmbedding(imageUrl);

    // Search for similar images
    const results = await vectorSearchService.searchImages(
      queryEmbedding,
      parseInt(limit),
      filters,
      parseFloat(threshold),
      stackApiKey
    );

    // Debug logging to understand ranking issues
    console.log('Image search results analysis', {
      queryImage: imageUrl,
      totalResults: results.length,
      topResults: results.slice(0, 5).map(r => ({
        id: r.id,
        score: r.score,
        similarity: r.similarity,
        contentType: r.contentType,
        imageUrl: r.imageUrl?.substring(0, 100) + '...',
        metadata: {
          title: r.title,
          description: r.description?.substring(0, 50) + '...'
        }
      })),
      scoreDistribution: {
        highest: results[0]?.score || 0,
        lowest: results[results.length - 1]?.score || 0,
        average: results.length > 0 ? results.reduce((sum, r) => sum + r.score, 0) / results.length : 0
      }
    });

    res.json({
      success: true,
      queryImage: imageUrl,
      results,
      count: results.length,
      searchType: 'image'
    });
  });

  /**
   * Upload image and search for similar images
   */
  searchByUploadedImage = asyncHandler(async (req, res) => {
    if (!req.file) {
      throw new AppError('No image file uploaded', 400);
    }

    const { limit = 10, threshold = 0.0, filters = {} } = req.body;

    console.log('Uploaded image search request', { 
      filename: req.file.originalname,
      size: req.file.size,
      limit, 
      threshold
    });

    // Get stackApiKey from active OAuth token in MongoDB
    const oauthToken = await OAuthToken.findOne({ 
      isActive: true,
      expiresAt: { $gt: new Date() }
    }).sort({ createdAt: -1 });
    
    if (!oauthToken) {
      throw new AppError('No active OAuth token found. Please reinstall the app.', 401);
    }
    
    const stackApiKey = oauthToken.stackApiKey;

    // Convert buffer to base64 for processing
    const base64Image = req.file.buffer.toString('base64');
    const dataUri = `data:${req.file.mimetype};base64,${base64Image}`;

    // Generate image embedding from uploaded file
    const queryEmbedding = await imageEmbeddingService.generateImageEmbedding(dataUri);

    // Search for similar images
    const results = await vectorSearchService.searchImages(
      queryEmbedding,
      parseInt(limit),
      filters,
      parseFloat(threshold),
      stackApiKey
    );

    // Add debugging information
    const catImages = results.filter(result => result.type === 'cat');
    const topCatImages = catImages.slice(0, 3);
    const nonCatImages = results.filter(result => result.type !== 'cat');
    const topNonCatImages = nonCatImages.slice(0, 3);

    console.log('Image search completed', {
      uploadedImage: {
        filename: req.file.originalname,
        size: req.file.size,
        mimetype: req.file.mimetype
      },
      resultsCount: results.length,
      topResults: results.slice(0, 3).map(r => ({
        id: r.id,
        score: r.score,
        type: r.type,
        contentType: r.contentType
      })),
      catImages: catImages.length,
      topCatImages: topCatImages.map(r => ({
        id: r.id,
        score: r.score,
        type: r.type,
        contentType: r.contentType
      })),
      nonCatImages: nonCatImages.length,
      topNonCatImages: topNonCatImages.map(r => ({
        id: r.id,
        score: r.score,
        type: r.type,
        contentType: r.contentType
      }))
    });

    res.json({
      success: true,
      uploadedImage: {
        filename: req.file.originalname,
        size: req.file.size,
        mimetype: req.file.mimetype
      },
      results,
      count: results.length,
      searchType: 'uploaded_image'
    });
  });

  /**
   * Multer middleware for image uploads
   */
  get uploadMiddleware() {
    return upload.single('image');
  }
}

module.exports = new ImageSearchController();
