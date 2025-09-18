const express = require('express');
const router = express.Router();
const configController = require('../controllers/configController');
const { authenticateStack } = require('../middleware/auth');

router.get('/content-types', authenticateStack, configController.getContentTypes);
router.get('/stack', authenticateStack, configController.getStackConfig);

module.exports = router;
