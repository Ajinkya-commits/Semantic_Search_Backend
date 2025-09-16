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
 
    let parts = [];
    for (const key in val) {
      parts.push(extractTextFromField(val[key]));
    }
    return parts.join(" ").trim();
  }
  return "";
}

function shouldIncludeFieldForEmbeddings(fieldName, fieldValue, contentType = null) {
  // Skip system fields and metadata
  const systemFields = [
    '_version', '_in_progress', '_workflow', 'ACL', 'created_at', 'updated_at', 
    'created_by', 'updated_by', 'publish_details', '_metadata', 'locale',
    'uid', 'tags', 'file_size', 'filename', 'content_type', 'dimension',
    'parent_uid', '_content_type_uid', 'url', 'is_dir'
  ];
  
  if (systemFields.includes(fieldName)) {
    return false;
  }

  // Skip fields with Contentstack UID patterns (blt prefix)
  if (typeof fieldValue === 'string' && fieldValue.startsWith('blt')) {
    return false;
  }

  // Skip very short text (likely not meaningful content)
  if (typeof fieldValue === 'string' && fieldValue.trim().length < 15) {
    return false;
  }

  // Skip timestamp patterns
  if (typeof fieldValue === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(fieldValue)) {
    return false;
  }

  // Skip UUID patterns
  if (typeof fieldValue === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(fieldValue)) {
    return false;
  }

  // Skip base64 encoded data
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

function intelligentTextTruncation(text, maxLength = 2000) {
  if (!text || text.length <= maxLength) {
    return text;
  }

  // Filter out metadata patterns before truncation
  const sentences = text.split(/[.!?]+/).filter(sentence => {
    const trimmed = sentence.trim();
    
    // Skip sentences with UIDs
    if (/blt[a-zA-Z0-9]{16}/.test(trimmed)) {
      return false;
    }
    
    // Skip sentences with timestamps
    if (/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(trimmed)) {
      return false;
    }
    
    // Skip sentences with system field patterns
    if (/(created_at|updated_at|publish_details|_version|ACL)/.test(trimmed)) {
      return false;
    }
    
    // Keep meaningful sentences
    return trimmed.length > 10;
  });

  let result = '';
  for (const sentence of sentences) {
    const potential = result + sentence + '. ';
    if (potential.length > maxLength) {
      break;
    }
    result = potential;
  }

  return result.trim() || text.substring(0, maxLength);
}

module.exports = {
  cleanHtml,
  extractTextFromField,
  shouldIncludeFieldForEmbeddings,
  extractTitleAndRTE,
  intelligentTextTruncation
};
