const logger = require('../config/logger');

class FieldConfigService {
  constructor() {
    // Default field patterns for different content types
    this.defaultFieldPatterns = {
      // Common patterns that apply to all content types
      global: {
        title: ['title', 'name', 'heading', 'headline', 'subject', 'label'],
        description: ['description', 'content', 'body', 'text', 'summary', 'abstract', 'excerpt'],
        metadata: ['category', 'tag', 'keyword', 'brand', 'type', 'status', 'priority']
      },
      
      // Content type specific patterns
      contentTypes: {
        product: {
          title: ['title', 'name', 'product_name', 'item_name'],
          description: ['description', 'product_description', 'details', 'features', 'benefits'],
          metadata: ['brand', 'category', 'price', 'color', 'size', 'material', 'sku']
        },
        article: {
          title: ['title', 'headline', 'subject'],
          description: ['content', 'body', 'text', 'summary', 'excerpt'],
          metadata: ['author', 'category', 'tags', 'publish_date', 'status']
        },
        page: {
          title: ['title', 'page_title', 'heading'],
          description: ['content', 'body', 'description', 'text'],
          metadata: ['slug', 'template', 'status', 'seo_title']
        }
      }
    };
  }

  /**
   * Get field patterns for a specific content type
   * @param {string} contentType - The content type UID
   * @returns {object} Field patterns for the content type
   */
  getFieldPatterns(contentType) {
    const globalPatterns = this.defaultFieldPatterns.global;
    const contentTypePatterns = this.defaultFieldPatterns.contentTypes[contentType] || {};
    
    return {
      title: [...globalPatterns.title, ...(contentTypePatterns.title || [])],
      description: [...globalPatterns.description, ...(contentTypePatterns.description || [])],
      metadata: [...globalPatterns.metadata, ...(contentTypePatterns.metadata || [])]
    };
  }

  /**
   * Check if a field should be included in embeddings based on its name and content type
   * @param {string} fieldName - The field name
   * @param {string} contentType - The content type UID
   * @param {*} fieldValue - The field value
   * @returns {object} - { include: boolean, category: string, priority: number }
   */
  shouldIncludeField(fieldName, contentType, fieldValue) {
    const patterns = this.getFieldPatterns(contentType);
    
    // Check title fields (highest priority)
    if (patterns.title.some(pattern => this.matchesPattern(fieldName, pattern))) {
      return { include: true, category: 'title', priority: 1 };
    }
    
    // Check description fields (high priority)
    if (patterns.description.some(pattern => this.matchesPattern(fieldName, pattern))) {
      return { include: true, category: 'description', priority: 2 };
    }
    
    // Check metadata fields (medium priority)
    if (patterns.metadata.some(pattern => this.matchesPattern(fieldName, pattern))) {
      return { include: true, category: 'metadata', priority: 3 };
    }
    
    // Check if it's a substantial text field (low priority)
    if (typeof fieldValue === "string" && fieldValue.trim().length > 20) {
      return { include: true, category: 'text', priority: 4 };
    }
    
    // Check if it's a rich text object/array
    if (typeof fieldValue === "object" && fieldValue !== null) {
      return { include: true, category: 'rich_text', priority: 3 };
    }
    
    return { include: false, category: 'excluded', priority: 0 };
  }

  /**
   * Check if field name matches a pattern (case insensitive)
   * @param {string} fieldName - The field name to check
   * @param {string} pattern - The pattern to match against
   * @returns {boolean}
   */
  matchesPattern(fieldName, pattern) {
    const regex = new RegExp(pattern, 'i');
    return regex.test(fieldName);
  }

  /**
   * Extract and prioritize text from entry based on field configuration
   * @param {object} entry - The entry object
   * @param {string} contentType - The content type UID
   * @returns {object} - { title: string, description: string, metadata: string, fullText: string }
   */
  extractTextByCategory(entry, contentType) {
    const result = {
      title: '',
      description: '',
      metadata: '',
      fullText: ''
    };

    const textParts = {
      title: [],
      description: [],
      metadata: [],
      text: [],
      rich_text: []
    };

    // Process each field
    for (const [fieldName, fieldValue] of Object.entries(entry)) {
      const fieldConfig = this.shouldIncludeField(fieldName, contentType, fieldValue);
      
      if (fieldConfig.include) {
        const extractedText = this.extractTextFromValue(fieldValue);
        if (extractedText) {
          textParts[fieldConfig.category].push(extractedText);
        }
      }
    }

    // Build result object
    result.title = textParts.title.join(' ').trim();
    result.description = textParts.description.join(' ').trim();
    result.metadata = textParts.metadata.join(' ').trim();
    
    // Combine all text parts in priority order
    const allParts = [
      ...textParts.title,
      ...textParts.description,
      ...textParts.metadata,
      ...textParts.text,
      ...textParts.rich_text
    ];
    
    result.fullText = allParts.join(' ').trim();

    return result;
  }

  /**
   * Extract text from various field value types
   * @param {*} value - The field value
   * @returns {string} - Extracted text
   */
  extractTextFromValue(value) {
    if (typeof value === "string") {
      return value.trim();
    } else if (Array.isArray(value)) {
      return value.map(item => this.extractTextFromValue(item)).join(' ').trim();
    } else if (typeof value === "object" && value !== null) {
      const textParts = [];
      for (const [key, val] of Object.entries(value)) {
        if (typeof val === "string") {
          textParts.push(val.trim());
        } else if (typeof val === "object") {
          textParts.push(this.extractTextFromValue(val));
        }
      }
      return textParts.join(' ').trim();
    }
    return '';
  }

  /**
   * Add custom field patterns for a content type
   * @param {string} contentType - The content type UID
   * @param {object} patterns - The field patterns to add
   */
  addCustomPatterns(contentType, patterns) {
    if (!this.defaultFieldPatterns.contentTypes[contentType]) {
      this.defaultFieldPatterns.contentTypes[contentType] = {};
    }
    
    for (const [category, fieldNames] of Object.entries(patterns)) {
      if (!this.defaultFieldPatterns.contentTypes[contentType][category]) {
        this.defaultFieldPatterns.contentTypes[contentType][category] = [];
      }
      this.defaultFieldPatterns.contentTypes[contentType][category].push(...fieldNames);
    }
    
    logger.info(`Added custom field patterns for content type: ${contentType}`, { patterns });
  }
}

// Create singleton instance
const fieldConfigService = new FieldConfigService();

module.exports = fieldConfigService;
