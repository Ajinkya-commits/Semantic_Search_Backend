const imageEmbeddingService = require('../services/imageEmbeddingService');

class ImageExtractor {
  /**
   * Extract all image URLs from a Contentstack entry
   * @param {object} entry - Contentstack entry object
   * @returns {Array} Array of image URL objects with metadata
   */
  extractImageUrls(entry) {
    if (!entry || typeof entry !== 'object') {
      return [];
    }

    const imageUrls = [];
    
    // Recursively search for image URLs in the entry
    this.searchForImages(entry, imageUrls, '');
    
    // Deduplicate URLs
    const uniqueUrls = this.deduplicateImages(imageUrls);
    
    console.log('Extracted image URLs from entry', {
      entryUid: entry.uid,
      totalFound: imageUrls.length,
      uniqueUrls: uniqueUrls.length,
    });

    return uniqueUrls;
  }

  /**
   * Recursively search for image URLs in an object
   * @param {*} obj - Object to search
   * @param {Array} imageUrls - Array to collect found URLs
   * @param {string} path - Current path in the object
   */
  searchForImages(obj, imageUrls, path) {
    if (typeof obj === 'string') {
      // Check if string contains HTML with img tags
      if (this.containsHtmlImages(obj)) {
        const htmlImages = this.extractImagesFromHtml(obj);
        htmlImages.forEach(imgData => {
          imageUrls.push({
            url: imgData.url,
            fieldPath: path,
            type: 'html_embedded',
            metadata: {
              alt: imgData.alt,
              asset_uid: imgData.asset_uid
            }
          });
        });
      }
      // Check if string is a direct image URL
      else if (imageEmbeddingService.isValidImageUrl(obj)) {
        imageUrls.push({
          url: obj,
          fieldPath: path,
          type: 'direct_url'
        });
      }
    } else if (Array.isArray(obj)) {
      obj.forEach((item, index) => {
        this.searchForImages(item, imageUrls, `${path}[${index}]`);
      });
    } else if (typeof obj === 'object' && obj !== null) {
      // Check for Contentstack asset structure
      if (this.isContentstackAsset(obj)) {
        const imageUrl = this.extractAssetUrl(obj);
        if (imageUrl) {
          imageUrls.push({
            url: imageUrl,
            fieldPath: path,
            type: 'contentstack_asset',
            metadata: {
              title: obj.title,
              filename: obj.filename,
              content_type: obj.content_type,
              file_size: obj.file_size,
              uid: obj.uid
            }
          });
        }
      } else {
        // Continue searching in nested objects
        Object.keys(obj).forEach(key => {
          const newPath = path ? `${path}.${key}` : key;
          this.searchForImages(obj[key], imageUrls, newPath);
        });
      }
    }
  }

  /**
   * Check if string contains HTML with img tags
   * @param {string} str - String to check
   * @returns {boolean} True if contains HTML img tags
   */
  containsHtmlImages(str) {
    return /<img[^>]+src=/i.test(str);
  }

  /**
   * Extract image URLs from HTML content
   * @param {string} htmlContent - HTML content string
   * @returns {Array} Array of image data objects
   */
  extractImagesFromHtml(htmlContent) {
    const images = [];
    
    // Regex to match img tags and extract src, alt, and asset_uid
    const imgRegex = /<img[^>]+>/gi;
    const matches = htmlContent.match(imgRegex);
    
    if (matches) {
      matches.forEach(imgTag => {
        // Extract src attribute
        const srcMatch = imgTag.match(/src=["']([^"']+)["']/i);
        if (srcMatch) {
          const url = srcMatch[1];
          
          // Extract alt attribute
          const altMatch = imgTag.match(/alt=["']([^"']*)["']/i);
          const alt = altMatch ? altMatch[1] : '';
          
          // Extract asset_uid attribute
          const assetUidMatch = imgTag.match(/asset_uid=["']([^"']+)["']/i);
          const asset_uid = assetUidMatch ? assetUidMatch[1] : '';
          
          // Only add if it's a valid image URL
          if (imageEmbeddingService.isValidImageUrl(url)) {
            images.push({
              url,
              alt,
              asset_uid
            });
          }
        }
      });
    }
    
    return images;
  }

  /**
   * Check if object is a Contentstack asset
   * @param {object} obj - Object to check
   * @returns {boolean} True if it's a Contentstack asset
   */
  isContentstackAsset(obj) {
    return obj && 
           typeof obj === 'object' && 
           obj.uid && 
           obj.url && 
           obj.content_type && 
           obj.content_type.startsWith('image/');
  }

  /**
   * Extract URL from Contentstack asset object
   * @param {object} asset - Contentstack asset object
   * @returns {string|null} Asset URL or null
   */
  extractAssetUrl(asset) {
    if (!asset || !asset.url) {
      return null;
    }

    // Return the full URL
    return asset.url;
  }

  /**
   * Remove duplicate image URLs
   * @param {Array} imageUrls - Array of image URL objects
   * @returns {Array} Deduplicated array
   */
  deduplicateImages(imageUrls) {
    const seen = new Set();
    return imageUrls.filter(imageObj => {
      if (seen.has(imageObj.url)) {
        return false;
      }
      seen.add(imageObj.url);
      return true;
    });
  }

  /**
   * Filter images by type or other criteria
   * @param {Array} imageUrls - Array of image URL objects
   * @param {object} filters - Filter criteria
   * @returns {Array} Filtered array
   */
  filterImages(imageUrls, filters = {}) {
    let filtered = imageUrls;

    // Filter by type
    if (filters.type) {
      filtered = filtered.filter(img => img.type === filters.type);
    }

    // Filter by minimum file size (if available)
    if (filters.minSize) {
      filtered = filtered.filter(img => {
        const fileSize = img.metadata?.file_size;
        return !fileSize || fileSize >= filters.minSize;
      });
    }

    // Filter by content type
    if (filters.contentTypes) {
      filtered = filtered.filter(img => {
        const contentType = img.metadata?.content_type;
        return !contentType || filters.contentTypes.includes(contentType);
      });
    }

    // Exclude certain patterns
    if (filters.excludePatterns) {
      filtered = filtered.filter(img => {
        return !filters.excludePatterns.some(pattern => pattern.test(img.url));
      });
    }

    return filtered;
  }

  /**
   * Get image URLs suitable for embedding generation
   * @param {object} entry - Contentstack entry
   * @param {object} options - Options for filtering
   * @returns {Array} Array of image URLs ready for embedding
   */
  getEmbeddableImages(entry, options = {}) {
    const allImages = this.extractImageUrls(entry);
    
    // Default filters for embeddable images
    const defaultFilters = {
      minSize: 1024, // At least 1KB
      excludePatterns: [
        /favicon/i,
        /icon/i,
        /thumbnail/i,
        /avatar/i,
        /logo/i,
        /\.avif$/i,  // Exclude AVIF format (not supported by Cohere)
        /\.heic$/i,  // Exclude HEIC format (not supported by Cohere)
        /\.heif$/i,  // Exclude HEIF format (not supported by Cohere)
        /\.tiff$/i,  // Exclude TIFF format (not supported by Cohere)
        /\.tif$/i,   // Exclude TIF format (not supported by Cohere)
        /\.bmp$/i,   // Exclude BMP format (not supported by Cohere)
        /\.svg$/i    // Exclude SVG format (not supported by Cohere)
      ],
      contentTypes: ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif'],
      ...options
    };

    const filtered = this.filterImages(allImages, defaultFilters);
    
    // Limit number of images per entry to avoid excessive API calls
    const maxImages = options.maxImages || 5;
    
    return filtered.slice(0, maxImages);
  }
}

const imageExtractor = new ImageExtractor();
module.exports = imageExtractor;
