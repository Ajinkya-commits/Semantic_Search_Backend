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
  
  if (!stackApiKey) {
    return res.status(400).json({ 
      error: 'Missing required field: stackApiKey (api_key)' 
    });
  }

  try {
    // Check if this is an asset webhook
    if (data.asset) {
      await handleAssetWebhook(data.asset, event, stackApiKey);
    }
    // Check if this is an entry webhook  
    else if (data.entry) {
      await handleEntryWebhook(data.entry, data.content_type, event, stackApiKey);
    }
    // Special handling for delete events that might not have full data
    else if (event && (event.includes('delete') || event.includes('unpublish'))) {
      const uid = data.uid || data.asset?.uid || data.entry?.uid;
      if (uid && event.startsWith('asset.')) {
        await removeAssetFromIndex(uid, stackApiKey);
      }
    }
    else {
      return res.status(400).json({ 
        error: 'Unknown webhook type - no recognizable data structure' 
      });
    }

    res.json({ success: true, message: 'Webhook processed successfully' });
  } catch (error) {
    console.error('Webhook processing failed:', error.message);
    res.status(500).json({ error: 'Failed to process webhook', details: error.message });
  }
}

async function handleEntryWebhook(entry, contentType, event, stackApiKey) {
  const entryUid = entry.uid;
  const contentTypeUid = contentType?.uid;
  
  if (!entryUid || !contentTypeUid) {
    throw new Error('Missing entry UID or content type UID');
  }

  if (event === 'entry.publish' || event === 'entry.update') {
    await indexingService.indexEntry(entry, contentTypeUid, stackApiKey);
  } else if (event === 'entry.delete') {
    await indexingService.removeEntry(entryUid, stackApiKey);
  }
}

async function handleAssetWebhook(asset, event, stackApiKey) {
  const assetUid = asset.uid;
  
  if (!assetUid) {
    throw new Error('Missing asset UID');
  }

  // Handle different event name formats (with or without 'asset.' prefix)
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
    // Set the correct Pinecone index for the stack
    if (stackApiKey) {
      await vectorSearchService.setStackIndex(stackApiKey);
    }

    // Check if Python service is available
    const serviceAvailable = await imageEmbeddingService.checkPythonService();
    if (!serviceAvailable) {
      throw new AppError('Image embedding service is not available', 503);
    }

    // Generate embedding for the image
    const embeddingResult = await imageEmbeddingService.embedImage(asset.url);

    // Prepare metadata for indexing
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

    // Index the image in Pinecone
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
    // Set the correct Pinecone index for the stack
    if (stackApiKey) {
      await vectorSearchService.setStackIndex(stackApiKey);
    }

    // Remove from Pinecone index
    await vectorSearchService.deleteEntry(`image_${assetUid}`, stackApiKey);
  } catch (error) {
    console.error('Failed to remove asset from index:', assetUid, error.message);
    throw error;
  }
}

module.exports = router;
