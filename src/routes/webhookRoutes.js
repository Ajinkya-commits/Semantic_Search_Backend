const express = require('express');
const indexingService = require('../services/indexingService');
const imageEmbeddingService = require('../services/imageEmbeddingService');
const vectorSearchService = require('../services/vectorSearchService');
const { AppError } = require('../middleware/errorHandler');

const router = express.Router();

router.post('/entry-sync', handleWebhook);
router.post('/asset-sync', handleWebhook);

async function handleWebhook(req, res) {
  const { data = {}, event, api_key } = req.body;
  const stackApiKey = api_key;
  
  console.log('=== WEBHOOK RECEIVED ===');
  console.log('Event:', event);
  console.log('Stack API Key:', stackApiKey);
  console.log('Data keys:', Object.keys(data));
  console.log('Full payload:', JSON.stringify(req.body, null, 2));
  console.log('========================');
  
  if (!stackApiKey) {
    return res.status(400).json({ 
      error: 'Missing required field: stackApiKey (api_key)' 
    });
  }

  try {
    if (data.asset) {
      console.log('Processing asset webhook for:', data.asset.uid);
      await handleAssetWebhook(data.asset, event, stackApiKey);
    }
    else if (data.entry) {
      console.log('Processing entry webhook for:', data.entry.uid);
      await handleEntryWebhook(data.entry, data.content_type, event, stackApiKey);
    }
    else if (event && (event.includes('delete') || event.includes('unpublish'))) {
      const uid = data.uid || data.asset?.uid || data.entry?.uid;
      console.log('Processing delete/unpublish event for UID:', uid);
      
      if (uid) {
        if (event.startsWith('asset.')) {
          await removeAssetFromIndex(uid, stackApiKey);
        } else if (event.startsWith('entry.')) {
          await indexingService.removeEntry(uid, stackApiKey);
        }
      }
    }
    else {
      console.log('Unknown webhook type - payload structure not recognized');
      return res.status(400).json({ 
        error: 'Unknown webhook type - no recognizable data structure' 
      });
    }

    console.log('Webhook processed successfully');
    res.json({ success: true, message: 'Webhook processed successfully' });
  } catch (error) {
    console.error('Webhook processing failed:', error.message);
    res.status(500).json({ error: 'Failed to process webhook', details: error.message });
  }
}

async function handleEntryWebhook(entry, contentType, event, stackApiKey) {
  const entryUid = entry.uid;
  const contentTypeUid = contentType?.uid;
  
  console.log('Entry webhook - Event:', event, 'Entry UID:', entryUid, 'Content Type:', contentTypeUid);
  
  if (!entryUid) {
    throw new Error('Missing entry UID');
  }

  if (event === 'entry.publish' || event === 'entry.update') {
    if (!contentTypeUid) {
      throw new Error('Missing content type UID for entry indexing');
    }
    console.log('Indexing entry:', entryUid, 'of type:', contentTypeUid);
    await indexingService.indexEntry(entry, contentTypeUid, stackApiKey);
  } else if (event === 'entry.delete' || event === 'entry.unpublish') {
    console.log('Removing entry from index:', entryUid);
    await indexingService.removeEntry(entryUid, stackApiKey);
  } else {
    console.log('Unhandled entry event:', event);
  }
}

async function handleAssetWebhook(asset, event, stackApiKey) {
  const assetUid = asset.uid;
  
  if (!assetUid) {
    throw new Error('Missing asset UID');
  }

  const normalizedEvent = event.startsWith('asset.') ? event : `asset.${event}`;

  if (normalizedEvent === 'asset.publish' || normalizedEvent === 'asset.create' || normalizedEvent === 'asset.update') {
    if (asset.content_type && asset.content_type.startsWith('image/')) {
      await indexSingleAsset(asset, stackApiKey);
    }
  } else if (normalizedEvent === 'asset.delete' || normalizedEvent === 'asset.unpublish') {
    await removeAssetFromIndex(assetUid, stackApiKey);
  }
}

async function indexSingleAsset(asset, stackApiKey) {
  try {
    await vectorSearchService.setStackIndex(stackApiKey);

    const serviceAvailable = await imageEmbeddingService.checkPythonService();
    if (!serviceAvailable) {
      throw new AppError('Image embedding service is not available', 503);
    }

    const embeddingResult = await imageEmbeddingService.embedImage(asset.url);

    const metadata = {
      uid: asset.uid,
      title: asset.title || asset.filename,
      url: asset.url,
      type: 'image',
      stackApiKey,
      content_type: asset.content_type,
      file_size: asset.file_size,
      width: asset.dimension?.width?.toString() || '0',
      height: asset.dimension?.height?.toString() || '0',
      created_at: asset.created_at,
      updated_at: asset.updated_at
    };

    await vectorSearchService.indexEntry(
      `image_${asset.uid}`,
      asset.title || asset.filename,
      embeddingResult.embedding,
      metadata,
      stackApiKey
    );
  } catch (error) {
    console.error('Failed to index asset:', asset.uid, error.message);
    throw error;
  }
}

async function removeAssetFromIndex(assetUid, stackApiKey) {
  try {
    await vectorSearchService.setStackIndex(stackApiKey);

    await vectorSearchService.deleteEntry(`image_${assetUid}`, stackApiKey);
  } catch (error) {
    console.error('Failed to remove asset from index:', assetUid, error.message);
    throw error;
  }
}

module.exports = router;
