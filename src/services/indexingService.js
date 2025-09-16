const { AppError } = require('../shared/middleware/errorHandler');
const embeddingsService = require('./embeddingsService');
const imageEmbeddingService = require('./imageEmbeddingService');
const vectorSearchService = require('./vectorSearchService');
const { extractTitleAndRTE, extractStructuredMetadata } = require('../utils/textCleaner');
const imageExtractor = require('../utils/imageExtractor');

class IndexingService {
  constructor() {
    this.batchSize = 50;
    this.maxRetries = 3;
    this.retryDelay = 1000;
  }

  prepareEntryForIndexing(entry, contentType) {
    if (!entry || !entry.uid) {
      throw new AppError('Entry must have a UID', 400);
    }

    try {
      const enrichedText = extractTitleAndRTE(entry, contentType);
      
      if (!enrichedText || enrichedText.trim().length === 0) {
        console.log(`Entry ${entry.uid} has no text content, skipping indexing`);
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
      console.error(`Failed to prepare entry ${entry.uid} for indexing`, {
        error: error.message,
        contentType,
      });
      throw new AppError(`Failed to prepare entry for indexing: ${error.message}`, 500);
    }
  }

  /**
   * Prepare images from entry for indexing
   * @param {object} entry - Contentstack entry
   * @param {string} contentType - Content type UID
   * @returns {Array} Array of image objects ready for indexing
   */
  prepareImagesForIndexing(entry, contentType) {
    if (!entry || !entry.uid) {
      return [];
    }

    try {
      const images = imageExtractor.getEmbeddableImages(entry, {
        maxImages: 3 // Limit to avoid excessive API calls
      });

      if (images.length === 0) {
        console.log(`Entry ${entry.uid} has no embeddable images`);
        return [];
      }

      const preparedImages = images.map((imageObj, index) => ({
        id: `${entry.uid}_img_${index}`, // Unique ID for each image
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

      console.log(`Prepared ${preparedImages.length} images for indexing from entry ${entry.uid}`);
      return preparedImages;
    } catch (error) {
      console.error(`Failed to prepare images from entry ${entry.uid}`, {
        error: error.message,
        contentType,
      });
      return []; // Don't fail the entire indexing process for image issues
    }
  }

  async indexAllEntries(stackApiKey, environment, options = {}) {
    try {
      console.log('Starting full indexing process', {
        stackApiKey,
        environment,
        options,
      });

      const contentstackService = require('./contentstackService');
      const tokenService = require('./tokenService');
      
      const accessToken = await tokenService.getValidAccessToken(stackApiKey);
      if (!accessToken) {
        throw new AppError('No valid access token found for stack', 401);
      }

      const allEntries = await contentstackService.fetchAllEntries(
        stackApiKey,
        environment,
        accessToken
      );

      if (!allEntries || allEntries.length === 0) {
        console.log('No entries found to index', { stackApiKey, environment });
        return {
          success: true,
          indexed: 0,
          skipped: 0,
          errors: 0,
          imagesIndexed: 0,
          message: 'No entries found to index',
        };
      }

      let indexed = 0;
      let skipped = 0;
      let errors = 0;
      let imagesIndexed = 0;
      const errorsList = [];

      for (let i = 0; i < allEntries.length; i += this.batchSize) {
        const batch = allEntries.slice(i, i + this.batchSize);
        
        console.log(`Processing batch ${Math.floor(i / this.batchSize) + 1}/${Math.ceil(allEntries.length / this.batchSize)}`, {
          batchSize: batch.length,
          totalEntries: allEntries.length,
        });

        for (const contentTypeData of batch) {
          const { contentType, entries } = contentTypeData;
          
          for (const entry of entries) {
            try {
              const result = await this.indexEntryWithImages(entry, contentType, stackApiKey);
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
              console.error(`Failed to index entry ${entry.uid}`, {
                error: error.message,
                contentType: contentType,
              });
            }
          }
        }

        if (i + this.batchSize < allEntries.length) {
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

      console.log('Indexing process completed', result);
      return result;

    } catch (error) {
      console.error('Failed to index all entries', {
        stackApiKey,
        environment,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Index both text and images from an entry
   * @param {object} entry - Contentstack entry
   * @param {string} contentType - Content type UID
   * @param {string} stackApiKey - Stack API key
   * @returns {Promise<object>} Result object with indexing stats
   */
  async indexEntryWithImages(entry, contentType, stackApiKey = null) {
    try {
      let textIndexed = false;
      let imagesIndexed = 0;

      // Set the correct index for the stack if provided
      if (stackApiKey) {
        await vectorSearchService.setStackIndex(stackApiKey);
      }

      // Index text content
      const preparedEntry = this.prepareEntryForIndexing(entry, contentType);
      if (preparedEntry) {
        const vector = await embeddingsService.generateTextEmbedding(
          preparedEntry.text,
          'search_document'
        );

        if (vector) {
          await vectorSearchService.indexEntry(
            preparedEntry.uid,
            preparedEntry.text,
            vector,
            preparedEntry.metadata,
            stackApiKey
          );
          textIndexed = true;
          console.log(`Indexed entry: ${preparedEntry.uid}`);
        }
      }

      // Process images if any
      const preparedImages = this.prepareImagesForIndexing(entry, contentType);
      if (preparedImages.length > 0) {
        const imageResults = await imageEmbeddingService.generateBatchImageEmbeddings(
          preparedImages.map(img => img.url)
        );

        for (const imageResult of imageResults.results) {
          const imageData = preparedImages.find(img => img.url === imageResult.url);
          
          if (imageData && imageResult.embedding) {
            await vectorSearchService.indexImage(
              imageData.id,
              imageData.url,
              imageResult.embedding,
              imageData.metadata,
              stackApiKey
            );
            imagesIndexed++;
            console.log(`Indexed image: ${imageData.id}`);
          }
        }
      }

      console.log(`Indexed entry: ${entry.uid} (text: ${textIndexed}, images: ${imagesIndexed})`);
      
      return { textIndexed, imagesIndexed };
    } catch (error) {
      console.error(`Failed to index entry with images ${entry.uid}`, {
        error: error.message,
        contentType,
        stackApiKey,
      });
      throw error;
    }
  }

  async indexEntry(entry, contentType, stackApiKey = null) {
    const result = await this.indexEntryWithImages(entry, contentType, stackApiKey);
    return result.textIndexed;
  }

  async removeEntry(entryUid, stackApiKey = null) {
    try {
      if (stackApiKey) {
        await vectorSearchService.setStackIndex(stackApiKey);
      }
      await vectorSearchService.deleteEntry(entryUid, stackApiKey);
      console.log(`🗑️ Removed entry from index: ${entryUid}`);
      return true;
    } catch (error) {
      console.error(`Failed to remove entry ${entryUid} from index`, {
        error: error.message,
      });
      throw error;
    }
  }

  async updateEntry(entry, contentType) {
    try {
      await this.removeEntry(entry.uid);
      return await this.indexEntry(entry, contentType);
    } catch (error) {
      console.error(`Failed to update entry ${entry.uid} in index`, {
        error: error.message,
        contentType,
      });
      throw error;
    }
  }

  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

const indexingService = new IndexingService();
module.exports = indexingService;