const express = require('express');
const indexingService = require('../services/indexingService');
const { AppError } = require('../shared/middleware/errorHandler');

const router = express.Router();

router.post('/entry-sync', async (req, res) => {
  const { data = {}, event, api_key } = req.body;
  const entry = data.entry || {};
  const contentType = data.content_type?.uid;
  const entryUid = entry.uid;
  const locale = entry.locale || 'en-us';
  
  // Extract stackApiKey from webhook - Contentstack sends it as 'api_key' at root level
  const stackApiKey = api_key || 
                     req.headers['x-contentstack-stack-api-key'] || 
                     req.headers['stack-api-key'] || 
                     data.stack?.api_key ||
                     req.query.stackApiKey;

  // Debug logging to see what we're receiving
  console.log('Webhook payload debug', {
    headers: req.headers,
    query: req.query,
    apiKeyFromPayload: api_key,
    dataKeys: Object.keys(data),
    stackFromData: data.stack,
    extractedStackApiKey: stackApiKey
  });

  if (!entryUid || !contentType) {
    return res.status(400).json({ error: 'Invalid webhook payload' });
  }

  if (!stackApiKey) {
    console.log('No stackApiKey found in webhook request', { 
      headers: Object.keys(req.headers),
      query: req.query,
      apiKeyFromPayload: api_key,
      dataKeys: Object.keys(data),
      fullPayload: req.body
    });
  }

  console.log(`Webhook received: ${event} for ${contentType} → ${entryUid}`, { stackApiKey });

  res.json({ status: 'Webhook received, processing...' });

  setImmediate(async () => {
    try {
      if (event === 'delete') {
        await indexingService.removeEntry(entryUid, stackApiKey);
        console.log(`🗑️ Deleted entry ${entryUid} from index`);
        return;
      }

      // Index the entry using the new indexing service with stackApiKey
      const success = await indexingService.indexEntry(entry, contentType, stackApiKey);
      
      if (success) {
        console.log(`✅ Indexed entry ${entryUid} via webhook`);
      } else {
        console.log(`⚠️ Skipped indexing entry ${entryUid} (no content)`);
      }

      console.log(`🎉 Finished processing entry ${entryUid}`);
    } catch (err) {
      console.error('❌ Async webhook error:', {
        error: err.message,
        entryUid,
        contentType,
        event,
        stackApiKey
      });
    }
  });
});

module.exports = router;
