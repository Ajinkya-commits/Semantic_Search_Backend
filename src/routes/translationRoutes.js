const express = require('express');
const router = express.Router();
const translationController = require('../controllers/translationController');
const { authenticateStack } = require('../middleware/auth');

// Translation routes
router.post('/text', authenticateStack, translationController.translateText);
router.post('/entry', authenticateStack, translationController.translateEntry);
router.post('/entry-fields', authenticateStack, translationController.translateEntryFields);
router.get('/languages', translationController.getSupportedLanguages);

module.exports = router;
