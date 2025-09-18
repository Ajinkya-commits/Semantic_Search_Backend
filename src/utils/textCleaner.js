const { JSDOM } = require("jsdom");

function cleanHtml(rawHtml = "") {
  const dom = new JSDOM(rawHtml);
  return dom.window.document.body.textContent || "";
}

function extractTextFromField(val) {
  if (typeof val === "string") {
  
    if (/<[a-z][\s\S]*>/i.test(val)) {
      return cleanHtml(val).trim();
    } else {
 
      return val.trim();
    }
  } else if (Array.isArray(val)) {
  
    return val.map(extractTextFromField).join(" ").trim();
  } else if (typeof val === "object" && val !== null) {
    return Object.values(val).map(extractTextFromField).join(" ").trim();
  }
  return "";
}

function shouldIncludeFieldForEmbeddings(fieldName, fieldValue) {
  const systemFields = [
    '_version', '_in_progress', '_workflow', 'ACL', 'created_at', 'updated_at', 
    'created_by', 'updated_by', 'publish_details', '_metadata', 'locale',
    'uid', 'tags', 'file_size', 'filename', 'content_type', 'dimension',
    'parent_uid', '_content_type_uid', 'url', 'is_dir'
  ];
  
  if (systemFields.includes(fieldName)) {
    return false;
  }


  if (typeof fieldValue === 'string' && fieldValue.startsWith('blt')) {
    return false;
  }

  if (typeof fieldValue === 'string' && fieldValue.trim().length < 15) {
    return false;
  }


  if (typeof fieldValue === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(fieldValue)) {
    return false;
  }

  if (typeof fieldValue === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(fieldValue)) {
    return false;
  }


  if (typeof fieldValue === 'string' && /^[A-Za-z0-9+/]+=*$/.test(fieldValue) && fieldValue.length > 100) {
    return false;
  }

  // Skip URLs, emails, phone numbers
  if (typeof fieldValue === 'string') {
    const urlPattern = /^https?:\/\//i;
    const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const phonePattern = /^[\+]?[1-9][\d]{0,15}$/;
    
    if (urlPattern.test(fieldValue) || emailPattern.test(fieldValue) || phonePattern.test(fieldValue)) {
      return false;
    }
  }

  // Skip file paths
  if (typeof fieldValue === 'string' && /^[\/\\]/.test(fieldValue)) {
    return false;
  }

  // Include meaningful text content
  if (typeof fieldValue === "string" && fieldValue.trim().length >= 15) {
    return true;
  }

  // Include rich text objects/arrays
  if (typeof fieldValue === "object" && fieldValue !== null) {
    return true;
  }

  return false;
}

function extractTitleAndRTE(entry, contentType = null) {
  const parts = [];

  const titleFields = ['title', 'name', 'heading', 'headline', 'subject'];
  for (const titleField of titleFields) {
    if (typeof entry[titleField] === "string" && entry[titleField].trim()) {
      parts.push(entry[titleField].trim());
      break; 
    }
  }

  const descriptionFields = ['description', 'content', 'body', 'text', 'summary', 'abstract'];
  for (const descField of descriptionFields) {
    if (typeof entry[descField] === "string" && entry[descField].trim()) {
      parts.push(entry[descField].trim());
      break; 
    }
  }

  for (const [fieldName, fieldValue] of Object.entries(entry)) {
    if (shouldIncludeFieldForEmbeddings(fieldName, fieldValue, contentType)) {
      const extractedText = extractTextFromField(fieldValue);
      if (extractedText && extractedText.length > 0) {
        parts.push(extractedText);
      }
    }
  }

  return parts.join(" ").trim();
}

function extractStructuredMetadata(entry, excludeFields = new Set()) {
  if (!entry || typeof entry !== 'object') {
    return {};
  }

  const metadata = {};
  
  Object.keys(entry).forEach(key => {
    if (!excludeFields.has(key) && shouldIncludeFieldForEmbeddings(key, entry[key])) {
      const value = entry[key];
      
      if (typeof value === 'string' && value.length > 0 && value.length < 200) {
        metadata[key] = value;
      } else if (typeof value === 'number') {
        metadata[key] = value;
      } else if (typeof value === 'boolean') {
        metadata[key] = value;
      }
    }
  });

  return metadata;
}


module.exports = {
  cleanHtml,
  extractTextFromField,
  shouldIncludeFieldForEmbeddings,
  extractTitleAndRTE,
  extractStructuredMetadata,
};
