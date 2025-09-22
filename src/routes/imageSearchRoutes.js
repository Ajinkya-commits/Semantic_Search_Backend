const express = require('express');
const multer = require('multer');
const imageSearchController = require('../controllers/imageSearchController');
const { autoDetectStackApiKey } = require('../middleware/auth');

const router = express.Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, 
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed'), false);
    }
  }
});
router.use(autoDetectStackApiKey);

router.post('/index', imageSearchController.indexImages);
router.get('/stats', imageSearchController.getImageStats);

router.post('/search', imageSearchController.searchImages);
router.post('/search/upload', upload.single('image'), imageSearchController.searchImageByUpload);

module.exports = router;
