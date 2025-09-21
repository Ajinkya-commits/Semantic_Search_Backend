const { AppError } = require('../middleware/errorHandler');
const embeddingsService = require('./embeddingsService');
const vectorSearchService = require('./vectorSearchService');
const { extractTitleAndRTE, extractStructuredMetadata } = require('../utils/textCleaner');


const batchSize = 50;
const indexEntryWithImages = async (entry, contentType, stackApiKey = null) => {
  try {
    let textIndexed = false;
    let imagesIndexed = 0;

    if (stackApiKey) {
      await vectorSearchService.setStackIndex(stackApiKey);
    }

    const cleanedText = extractTitleAndRTE(entry, contentType);
    if (cleanedText && cleanedText.trim().length > 0) {
      const embedding = await embeddingsService.generateTextEmbedding(cleanedText);
      const metadata = extractStructuredMetadata(entry, contentType);
      
      await vectorSearchService.indexEntry(
        entry.uid,
        cleanedText,
        embedding,
        metadata,
        stackApiKey
      );
      textIndexed = true;
    }
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