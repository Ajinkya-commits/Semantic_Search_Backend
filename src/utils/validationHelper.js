
const isValidEmail = (email) => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
};

const isValidUrl = (url) => {
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
};


const isValidObjectId = (id) => {
  const objectIdRegex = /^[0-9a-fA-F]{24}$/;
  return objectIdRegex.test(id);
};


const isValidUUID = (uuid) => {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return uuidRegex.test(uuid);
};


const sanitizeString = (input, maxLength = 1000) => {
  if (typeof input !== 'string') {
    return '';
  }
  
  return input
    .trim()
    .substring(0, maxLength)
    .replace(/[<>]/g, '') // Remove potential HTML tags
    .replace(/[\x00-\x1F\x7F]/g, ''); // Remove control characters
};

const validateSearchQuery = (query) => {
  if (!query || typeof query !== 'string') {
    return {
      isValid: false,
      error: 'Query must be a non-empty string',
      sanitizedQuery: '',
    };
  }

  const sanitized = sanitizeString(query, 500);
  
  if (sanitized.length === 0) {
    return {
      isValid: false,
      error: 'Query cannot be empty after sanitization',
      sanitizedQuery: '',
    };
  }

  if (sanitized.length < 2) {
    return {
      isValid: false,
      error: 'Query must be at least 2 characters long',
      sanitizedQuery: sanitized,
    };
  }

  return {
    isValid: true,
    error: null,
    sanitizedQuery: sanitized,
  };
};


const validatePagination = (page, limit) => {
  const defaultPage = 1;
  const defaultLimit = 10;
  const maxLimit = 100;

  const sanitizedPage = Math.max(1, parseInt(page) || defaultPage);
  const sanitizedLimit = Math.min(maxLimit, Math.max(1, parseInt(limit) || defaultLimit));

  return {
    isValid: true,
    page: sanitizedPage,
    limit: sanitizedLimit,
    skip: (sanitizedPage - 1) * sanitizedLimit,
  };
};

const validateEnvironment = (environment) => {
  const validEnvironments = ['development', 'staging', 'production'];
  const sanitized = sanitizeString(environment, 20).toLowerCase();

  if (!validEnvironments.includes(sanitized)) {
    return {
      isValid: false,
      error: `Environment must be one of: ${validEnvironments.join(', ')}`,
      sanitizedEnvironment: 'development',
    };
  }

  return {
    isValid: true,
    error: null,
    sanitizedEnvironment: sanitized,
  };
};

/**
 * Validate content type UID
 * @param {string} contentTypeUid - Content type UID
 * @returns {object} Validation result
 */
const validateContentTypeUid = (contentTypeUid) => {
  if (!contentTypeUid || typeof contentTypeUid !== 'string') {
    return {
      isValid: false,
      error: 'Content type UID must be a non-empty string',
      sanitizedUid: '',
    };
  }

  const sanitized = sanitizeString(contentTypeUid, 100);
  
  if (sanitized.length === 0) {
    return {
      isValid: false,
      error: 'Content type UID cannot be empty after sanitization',
      sanitizedUid: '',
    };
  }

  // Check for valid characters (alphanumeric, underscore, hyphen)
  if (!/^[a-zA-Z0-9_-]+$/.test(sanitized)) {
    return {
      isValid: false,
      error: 'Content type UID can only contain alphanumeric characters, underscores, and hyphens',
      sanitizedUid: sanitized,
    };
  }

  return {
    isValid: true,
    error: null,
    sanitizedUid: sanitized,
  };
};

/**
 * Validate entry UID
 * @param {string} entryUid - Entry UID
 * @returns {object} Validation result
 */
const validateEntryUid = (entryUid) => {
  if (!entryUid || typeof entryUid !== 'string') {
    return {
      isValid: false,
      error: 'Entry UID must be a non-empty string',
      sanitizedUid: '',
    };
  }

  const sanitized = sanitizeString(entryUid, 100);
  
  if (sanitized.length === 0) {
    return {
      isValid: false,
      error: 'Entry UID cannot be empty after sanitization',
      sanitizedUid: '',
    };
  }

  return {
    isValid: true,
    error: null,
    sanitizedUid: sanitized,
  };
};

module.exports = {
  isValidEmail,
  isValidUrl,
  isValidObjectId,
  isValidUUID,
  sanitizeString,
  validateSearchQuery,
  validatePagination,
  validateEnvironment,
  validateContentTypeUid,
  validateEntryUid,
};
