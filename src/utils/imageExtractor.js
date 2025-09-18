const imageEmbeddingService = require('../services/imageEmbeddingService');

const getEmbeddableImages = (entry, options = {}) => {
  const { maxImages = 5 } = options;
  const images = [];

  const extractFromField = (value, fieldPath = '') => {
    if (!value) return;

    if (typeof value === 'string') {
      if (isImageUrl(value)) {
        images.push({
          url: value,
          fieldPath,
          type: 'url',
          metadata: {
            source: 'string_field'
          }
        });
      }
    } else if (Array.isArray(value)) {
      value.forEach((item, index) => {
        extractFromField(item, `${fieldPath}[${index}]`);
      });
    } else if (typeof value === 'object' && value !== null) {
      if (value.url && isImageUrl(value.url)) {
        images.push({
          url: value.url,
          fieldPath,
          type: 'asset',
          metadata: {
            source: 'asset_object',
            filename: value.filename,
            title: value.title,
            description: value.description,
            content_type: value.content_type,
            file_size: value.file_size,
            dimension: value.dimension
          }
        });
      } else {
        Object.keys(value).forEach(key => {
          extractFromField(value[key], fieldPath ? `${fieldPath}.${key}` : key);
        });
      }
    }
  };

  if (!entry || typeof entry !== 'object') {
    return [];
  }

  Object.keys(entry).forEach(key => {
    if (shouldSkipField(key)) {
      return;
    }
    extractFromField(entry[key], key);
  });

  const uniqueImages = images.filter((image, index, self) => 
    index === self.findIndex(img => img.url === image.url)
  );

  return uniqueImages.slice(0, maxImages);
};

const isImageUrl = (url) => {
  if (!url || typeof url !== 'string') {
    return false;
  }

  const imageExtensions = /\.(jpg|jpeg|png|gif|webp|svg|bmp|tiff|avif|heic)(\?.*)?$/i;
  if (imageExtensions.test(url)) {
    return true;
  }

  const imagePatterns = [
    /images\.contentstack\.(com|io)/i,
    /cloudinary\.com/i,
    /amazonaws\.com.*\.(jpg|jpeg|png|gif|webp)/i,
    /googleusercontent\.com/i,
  ];

  return imagePatterns.some(pattern => pattern.test(url));
};

const shouldSkipField = (fieldName) => {
  const skipFields = [
    'uid', '_version', 'created_at', 'updated_at', 'created_by', 'updated_by',
    'tags', 'publish_details', '_metadata', 'ACL', '_in_progress'
  ];
  return skipFields.includes(fieldName);
};

const extractImageMetadata = (imageObject) => {
  if (!imageObject || typeof imageObject !== 'object') {
    return {};
  }

  return {
    filename: imageObject.filename,
    title: imageObject.title,
    description: imageObject.description,
    content_type: imageObject.content_type,
    file_size: imageObject.file_size,
    dimension: imageObject.dimension,
    alt: imageObject.alt || imageObject.title,
    caption: imageObject.caption
  };
};

const validateImageDimensions = (imageObject, minWidth = 100, minHeight = 100) => {
  if (!imageObject.dimension) {
    return true;
  }

  const { width, height } = imageObject.dimension;
  return width >= minWidth && height >= minHeight;
};

const containsHtmlImages = (str) => {
  return /<img[^>]+src=/i.test(str);
};

const extractImagesFromHtml = (htmlContent) => {
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
        if (isImageUrl(url)) {
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
};

const isContentstackAsset = (obj) => {
  return obj && 
         typeof obj === 'object' && 
         obj.uid && 
         obj.url && 
         obj.content_type && 
         obj.content_type.startsWith('image/');
};

const extractAssetUrl = (asset) => {
  if (!asset || !asset.url) {
    return null;
  }

  // Return the full URL
  return asset.url;
};

const deduplicateImages = (imageUrls) => {
  const seen = new Set();
  return imageUrls.filter(imageObj => {
    if (seen.has(imageObj.url)) {
      return false;
    }
    seen.add(imageObj.url);
    return true;
  });
};

const filterImages = (imageUrls, filters = {}) => {
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
};

const extractImageUrls = (entry) => {
  if (!entry || typeof entry !== 'object') {
    return [];
  }

  const imageUrls = [];
  
  // Recursively search for image URLs in the entry
  const searchForImages = (obj, imageUrls, path) => {
    if (typeof obj === 'string') {
      // Check if string contains HTML with img tags
      if (containsHtmlImages(obj)) {
        const htmlImages = extractImagesFromHtml(obj);
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
      else if (isImageUrl(obj)) {
        imageUrls.push({
          url: obj,
          fieldPath: path,
          type: 'direct_url'
        });
      }
    } else if (Array.isArray(obj)) {
      obj.forEach((item, index) => {
        searchForImages(item, imageUrls, `${path}[${index}]`);
      });
    } else if (typeof obj === 'object' && obj !== null) {
      // Check for Contentstack asset structure
      if (isContentstackAsset(obj)) {
        const imageUrl = extractAssetUrl(obj);
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
          searchForImages(obj[key], imageUrls, newPath);
        });
      }
    }
  };
  
  searchForImages(entry, imageUrls, '');
  
  // Deduplicate URLs
  const uniqueUrls = deduplicateImages(imageUrls);
  
  console.log('Extracted image URLs from entry', {
    entryUid: entry.uid,
    totalFound: imageUrls.length,
    uniqueUrls: uniqueUrls.length,
  });

  return uniqueUrls;
};

module.exports = {
  getEmbeddableImages,
  isImageUrl,
  extractImageMetadata,
  validateImageDimensions,
  extractImageUrls,
  containsHtmlImages,
  extractImagesFromHtml,
  isContentstackAsset,
  extractAssetUrl,
  deduplicateImages,
  filterImages,
};
