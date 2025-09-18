const express = require('express');
const indexingService = require('../services/indexingService');

const router = express.Router();

router.post('/entry-sync', async (req, res) => {
  const { data = {}, event, api_key } = req.body;
  const entry = data.entry || {};
  const contentType = data.content_type?.uid;
  const entryUid = entry.uid;
  const stackApiKey = api_key;

  console.log('Webhook received:', event, 'for', contentType, entryUid);

  if (!entryUid || !contentType || !stackApiKey) {
    return res.status(400).json({ 
      error: 'Missing required fields: entryUid, contentType, or stackApiKey' 
    });
  }

  try {
    if (event === 'entry.publish' || event === 'entry.update') {
      await indexingService.indexEntry(entry, contentType, stackApiKey);
      console.log('Entry indexed:', entryUid);
    } else if (event === 'entry.delete') {
      await indexingService.removeEntry(entryUid, stackApiKey);
      console.log('Entry removed:', entryUid);
    }

    res.json({ success: true, message: 'Webhook processed successfully' });
  } catch (error) {
    console.error('Webhook processing failed:', error.message);
    res.status(500).json({ error: 'Failed to process webhook' });
  }
});

module.exports = router;
