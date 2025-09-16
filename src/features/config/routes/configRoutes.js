const express = require('express');
const router = express.Router();
const configController = require('../controllers/configController');
const { authenticateStack } = require('../../../shared/middleware/auth');

// System configuration routes
router.get('/system', configController.getSystemConfig);
router.post('/system', configController.updateSystemConfig);

// Content type configuration
router.get('/content-types', 
  authenticateStack, 
  configController.getContentTypes
);

// Stack configuration route
router.get('/stack', configController.getStackConfig);

module.exports = router;
