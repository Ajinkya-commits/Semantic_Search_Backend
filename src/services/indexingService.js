const { AppError } = require('../middleware/errorHandler');
const embeddingsService = require('./embeddingsService');
const imageEmbeddingService = require('./imageEmbeddingService');
const vectorSearchService = require('./vectorSearchService');
const { extractTitleAndRTE, extractStructuredMetadata } = require('../utils/textCleaner');
const imageExtractor = require('../utils/imageExtractor');

const batchSize = 50;

const prepareEntryForIndexing = (entry, contentType) => {
  if (!entry || !entry.uid) {
    throw new AppError('Entry must have a UID', 400);
  }

  try {
    const enrichedText = extractTitleAndRTE(entry, contentType);
    
    if (!enrichedText || enrichedText.trim().length === 0) {
      return null;
    }

    const metadata = extractStructuredMetadata(entry, new Set(['title']));
    
    const systemMetadata = {
      contentType,
      locale: entry.locale || 'en-us',
      createdAt: entry.created_at,
      updatedAt: entry.updated_at,
      version: entry._version || 1,
    };

    return {
      uid: entry.uid,
      text: enrichedText,
      metadata: {
        ...metadata,
        ...systemMetadata,
      },
    };
  } catch (error) {
    throw new AppError(`Failed to prepare entry for indexing: ${error.message}`, 500);
  }
};

const prepareImagesForIndexing = (entry, contentType) => {
  if (!entry || !entry.uid) {
    return [];
  }

  try {
    const images = imageExtractor.getEmbeddableImages(entry, {
      maxImages: 3
    });

    if (images.length === 0) {
      return [];
    }

    const preparedImages = images.map((imageObj, index) => ({
      id: `${entry.uid}_image_${index}`,
      url: imageObj.url,
      metadata: {
        entryUid: entry.uid,
        contentType,
        locale: entry.locale || 'en-us',
        imageIndex: index,
        fieldPath: imageObj.fieldPath,
        imageType: imageObj.type,
        ...imageObj.metadata,
      }
    }));

    return preparedImages;
  } catch (error) {
    return [];
  }
};

const indexEntryWithImages = async (entry, contentType, stackApiKey = null) => {
  try {
    let textIndexed = false;
    let imagesIndexed = 0;

    if (stackApiKey) {
      await vectorSearchService.setStackIndex(stackApiKey);
    }

    const preparedEntry = prepareEntryForIndexing(entry, contentType);
    if (preparedEntry) {
      const embedding = await embeddingsService.generateTextEmbedding(preparedEntry.text);
      
      await vectorSearchService.indexEntry(
        preparedEntry.uid,
        preparedEntry.text,
        embedding,
        preparedEntry.metadata,
        stackApiKey
      );
      textIndexed = true;
    }

    // Skip image indexing for now to avoid errors
    // const images = prepareImagesForIndexing(entry, contentType);
    // if (images.length > 0) {
    //   for (const imageData of images) {
    //     try {
    //       const imageResult = await imageEmbeddingService.generateImageEmbedding(imageData.url);
    //       
    //       if (imageResult && imageResult.embedding) {
    //         await vectorSearchService.indexImage(
    //           imageData.id,
    //           imageData.url,
    //           imageResult.embedding,
    //           imageData.metadata,
    //           stackApiKey
    //         );
    //         imagesIndexed++;
    //       }
    //     } catch (error) {
    //       console.warn('Failed to index image, skipping:', error.message);
    //     }
    //   }
    // }
    
    return { textIndexed, imagesIndexed };
  } catch (error) {
    throw error;
  }
};

const indexEntry = async (entry, contentType, stackApiKey = null) => {
  const result = await indexEntryWithImages(entry, contentType, stackApiKey);
  return result.textIndexed;
};

const removeEntry = async (entryUid, stackApiKey = null) => {
  try {
    if (stackApiKey) {
      await vectorSearchService.setStackIndex(stackApiKey);
    }
    await vectorSearchService.deleteEntry(entryUid, stackApiKey);
    return true;
  } catch (error) {
    throw error;
  }
};

const updateEntry = async (entry, contentType) => {
  try {
    await removeEntry(entry.uid);
    return await indexEntry(entry, contentType);
  } catch (error) {
    throw error;
  }
};

const indexAllEntries = async (stackApiKey, environment, options = {}) => {
  try {
    const contentstackService = require('./contentstackService');
    const tokenService = require('./tokenService');
    
    const accessToken = await tokenService.getValidAccessToken(stackApiKey);
    if (!accessToken) {
      throw new AppError('No valid access token found for stack', 401);
    }

    const allEntries = await contentstackService.fetchAllEntries(
      stackApiKey,
      environment,
      options
    );

    let indexed = 0;
    let skipped = 0;
    let errors = 0;
    let imagesIndexed = 0;
    const errorsList = [];

    for (let i = 0; i < allEntries.length; i += batchSize) {
      const batch = allEntries.slice(i, i + batchSize);
      
      for (const { contentType, entries } of batch) {
        if (options.contentType && contentType !== options.contentType) {
          continue;
        }
          
        for (const entry of entries) {
          try {
            const result = await indexEntryWithImages(entry, contentType, stackApiKey);
            if (result.textIndexed) {
              indexed++;
            } else {
              skipped++;
            }
            imagesIndexed += result.imagesIndexed;
          } catch (error) {
            errors++;
            errorsList.push({
              entryUid: entry.uid,
              contentType: contentType,
              error: error.message,
            });
          }
        }
      }

      if (i + batchSize < allEntries.length) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }

    const result = {
      success: true,
      indexed,
      skipped,
      errors,
      imagesIndexed,
      totalProcessed: indexed + skipped + errors,
      errorsList: errorsList.slice(0, 10),
    };

    return result;

  } catch (error) {
    throw error;
  }
};

module.exports = {
  indexEntryWithImages,
  indexEntry,
  removeEntry,
  updateEntry,
  indexAllEntries,
};