const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');

// OAuth routes
router.get('/oauth/authorize', authController.initiateOAuth);
router.post('/oauth/callback', authController.handleOAuthCallback);
router.post('/oauth/refresh', authController.refreshToken);

// Token management
router.get('/tokens', authController.getActiveTokens);
router.delete('/tokens/:stackApiKey', authController.revokeToken);

module.exports = router;
