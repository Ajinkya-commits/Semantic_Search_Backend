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
      const metadata = extractStructuredMetadata(entry);
      
      // Add essential metadata fields
      metadata.entryUid = entry.uid;
      metadata.contentType = contentType;
      metadata.title = entry.title || entry.name || 'Untitled';
      metadata.stackApiKey = stackApiKey;
      
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
    
    console.log('Getting access token for stack:', stackApiKey);
    const accessToken = await tokenService.getValidAccessToken(stackApiKey);
    if (!accessToken) {
      throw new AppError('No valid access token found for stack', 401);
    }

    console.log('Fetching all entries...');
    const allEntries = await contentstackService.fetchAllEntries(
      stackApiKey,
      environment,
      options
    );

    console.log(`Starting to process ${allEntries.length} content type groups...`);
    let indexed = 0;
    let skipped = 0;
    let errors = 0;
    let imagesIndexed = 0;
    const errorsList = [];

    for (let i = 0; i < allEntries.length; i += batchSize) {
      const batch = allEntries.slice(i, i + batchSize);
      console.log(`Processing batch ${Math.floor(i/batchSize) + 1}/${Math.ceil(allEntries.length/batchSize)}`);
      
      for (const { contentType, entries } of batch) {
        if (options.contentType && contentType !== options.contentType) {
          continue;
        }
        
        console.log(`Processing ${entries.length} entries for content type: ${contentType}`);
        
        for (let j = 0; j < entries.length; j++) {
          const entry = entries[j];
          try {
            console.log(`Processing entry ${j + 1}/${entries.length}: ${entry.uid}`);
            const result = await indexEntryWithImages(entry, contentType, stackApiKey);
            if (result.textIndexed) {
              indexed++;
              console.log(`Indexed entry: ${entry.uid}`);
            } else {
              skipped++;
              console.log(`Skipped entry (no text): ${entry.uid}`);
            }
            imagesIndexed += result.imagesIndexed;
          } catch (error) {
            errors++;
            console.error(`Error indexing entry ${entry.uid}:`, error.message);
            errorsList.push({
              entryUid: entry.uid,
              contentType: contentType,
              error: error.message,
            });
          }
        }
      }

      if (i + batchSize < allEntries.length) {
        console.log('Waiting 100ms before next batch...');
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }

    console.log('Indexing completed!');
    const result = {
      success: true,
      indexed,
      skipped,
      errors,
      imagesIndexed,
      totalProcessed: indexed + skipped + errors,
      errorsList: errorsList.slice(0, 10),
    };

    console.log('Final results:', result);
    return result;

  } catch (error) {
    console.error('Indexing failed with error:', error);
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