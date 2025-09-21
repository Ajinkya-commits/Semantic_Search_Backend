const express = require('express');
const multer = require('multer');
const imageSearchController = require('../controllers/imageSearchController');
const { autoDetectStackApiKey } = require('../middleware/auth');

const router = express.Router();

// Configure multer for image uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
  },
  fileFilter: (req, file, cb) => {
    // Check if file is an image
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed'), false);
    }
  }
});

// Apply stack validation middleware to all routes
router.use(autoDetectStackApiKey);

// Image indexing routes
router.post('/index', imageSearchController.indexImages);
router.get('/stats', imageSearchController.getImageStats);

// Image search routes
router.post('/search', imageSearchController.searchImages);
router.post('/search/upload', upload.single('image'), imageSearchController.searchImageByUpload);

module.exports = router;
