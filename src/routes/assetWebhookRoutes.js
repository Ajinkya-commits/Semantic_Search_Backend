const express = require('express');

const router = express.Router();

// This file is deprecated - all webhook handling is now done in webhookRoutes.js
// The unified webhook handler already handles both /entry-sync and /asset-sync endpoints
// No need to redirect - just remove this file from app.js if needed

console.log('⚠️  assetWebhookRoutes.js is deprecated. All webhooks are handled by webhookRoutes.js');

module.exports = router;
