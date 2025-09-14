const { JSDOM } = require("jsdom");
const fieldConfigService = require('../services/fieldConfigService');


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


function shouldIncludeFieldForEmbeddings(fieldName, fieldValue) {
  
  const metadataFields = new Set([
  
    "uid", "_version", "locale", "publish_details", "created_at", "updated_at",
    "created_by", "updated_by", "user", "environment", "ACL", "time", "date",
    "id", "version", "createdAt", "updatedAt", "createdBy", "updatedBy",
    
   
    "created", "modified", "published", "unpublished", "deleted", "archived",
    "status", "state", "type", "category", "tags", "metadata", "meta",
    "system", "internal", "private", "hidden", "draft", "published_at",
    "modified_at", "deleted_at", "archived_at", "expires_at", "scheduled_at",
    
   
    "api_key", "token", "secret", "password", "hash", "signature", "checksum",
    "reference", "ref", "link", "url", "uri", "path", "file", "filename",
    "size", "length", "count", "index", "position", "order", "rank", "priority",
    
  
    "timestamp", "datetime", "date_created", "date_modified", "date_published",
    "last_modified", "last_updated", "last_accessed", "expiry_date", "start_date",
    "end_date", "due_date", "deadline", "schedule", "appointment", "meeting_time",
    
   
    "parent_id", "child_id", "related_id", "foreign_id", "external_id",
    "reference_id", "source_id", "target_id", "owner_id", "author_id",
    "editor_id", "reviewer_id", "approver_id", "assignee_id", "contact_id",
    
  
    "config", "settings", "options", "preferences", "permissions", "roles",
    "access_level", "security_level", "visibility", "public", "private",
    "internal", "external", "active", "inactive", "enabled", "disabled"
  ]);


  if (metadataFields.has(fieldName)) {
    return false;
  }

  
  const metadataPatterns = [
    /_id$/i, /_at$/i, /_date$/i, /_time$/i, /_timestamp$/i,
    /^created_/i, /^updated_/i, /^modified_/i, /^deleted_/i,
    /^last_/i, /^system_/i, /^internal_/i, /^meta_/i,
    /_created$/i, /_updated$/i, /_modified$/i, /_deleted$/i,
    /_system$/i, /_internal$/i, /_meta$/i, /_config$/i,
    /_settings$/i, /_permissions$/i, /_access$/i, /_security$/i
  ];

  if (metadataPatterns.some(pattern => pattern.test(fieldName))) {
    return false;
  }

  const textFieldPatterns = [
    /title/i, /name/i, /heading/i, /headline/i, /subject/i,
    /description/i, /content/i, /body/i, /text/i, /summary/i,
    /abstract/i, /excerpt/i, /overview/i, /details/i, /info/i,
    /message/i, /note/i, /comment/i, /caption/i, /tagline/i,
    /bio/i, /about/i, /introduction/i, /conclusion/i, /paragraph/i,
    /article/i, /post/i, /blog/i, /story/i, /narrative/i,
    /instruction/i, /guide/i, /tutorial/i, /help/i, /faq/i,
    /product/i, /item/i, /service/i, /feature/i, /benefit/i,
    /category/i, /tag/i, /keyword/i, /label/i, /brand/i
  ];

  const isTextField = textFieldPatterns.some(pattern => pattern.test(fieldName));

 
  if (isTextField) {
    return true;
  }


  if (typeof fieldValue === "string" && fieldValue.trim().length > 10) {
    return true;
  }

  if (typeof fieldValue === "object" && fieldValue !== null) {
    return true;
  }

  return false;
}


function extractTitleAndRTE(entry, contentType = null) {
 
  if (contentType) {
    const extractedText = fieldConfigService.extractTextByCategory(entry, contentType);
    return extractedText.fullText;
  }

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

 
  for (const [key, value] of Object.entries(entry)) {
    if (shouldIncludeFieldForEmbeddings(key, value)) {
      if (typeof value === "string" && value.trim().length > 10) {
        const cleaned = extractTextFromField(value);
        if (cleaned && !parts.includes(cleaned)) { 
          parts.push(cleaned);
        }
      } else if (typeof value === "object" && value !== null) {
        const extracted = extractTextFromField(value);
        if (extracted && !parts.includes(extracted)) { 
          parts.push(extracted);
        }
      }
    }
  }

  return parts.join(" ").trim();
}

function extractStructuredMetadata(entry, excludeKeys = new Set()) {
  const defaultExcludes = new Set([
    "title",
    "uid",
    "_version",
    "locale",
    "publish_details",
    "created_at",
    "updated_at",
    "created_by",
    "updated_by",
    "user",
    "environment",
    "ACL",
    "time",
    "date",
  ]);

  const finalExcludes = new Set([...defaultExcludes, ...excludeKeys]);
  const metadata = {};

  for (const key in entry) {
    if (!finalExcludes.has(key)) {
      const value = entry[key];
      if (
        typeof value === "string" ||
        typeof value === "number" ||
        typeof value === "boolean"
      ) {
        metadata[key] = value;
      }
    }
  }

  return metadata;
}

module.exports = {
  extractTitleAndRTE,
  extractStructuredMetadata,
};
