/**
 * Standardized response helper functions
 */

/**
 * Create a success response
 * @param {object} res - Express response object
 * @param {*} data - Response data
 * @param {string} message - Success message
 * @param {number} statusCode - HTTP status code
 * @param {object} metadata - Additional metadata
 */
const successResponse = (res, data = null, message = 'Success', statusCode = 200, metadata = {}) => {
  const response = {
    status: 'success',
    message,
    ...(data !== null && { data }),
    ...(Object.keys(metadata).length > 0 && { metadata }),
    timestamp: new Date().toISOString(),
  };

  return res.status(statusCode).json(response);
};

/**
 * Create an error response
 * @param {object} res - Express response object
 * @param {string} message - Error message
 * @param {number} statusCode - HTTP status code
 * @param {*} errors - Additional error details
 * @param {object} metadata - Additional metadata
 */
const errorResponse = (res, message = 'Internal Server Error', statusCode = 500, errors = null, metadata = {}) => {
  const response = {
    status: 'error',
    message,
    ...(errors !== null && { errors }),
    ...(Object.keys(metadata).length > 0 && { metadata }),
    timestamp: new Date().toISOString(),
  };

  return res.status(statusCode).json(response);
};

/**
 * Create a paginated response
 * @param {object} res - Express response object
 * @param {Array} data - Array of data items
 * @param {number} page - Current page number
 * @param {number} limit - Items per page
 * @param {number} total - Total number of items
 * @param {string} message - Success message
 * @param {object} metadata - Additional metadata
 */
const paginatedResponse = (res, data, page, limit, total, message = 'Success', metadata = {}) => {
  const totalPages = Math.ceil(total / limit);
  const hasNextPage = page < totalPages;
  const hasPrevPage = page > 1;

  const response = {
    status: 'success',
    message,
    data,
    pagination: {
      currentPage: page,
      totalPages,
      totalItems: total,
      itemsPerPage: limit,
      hasNextPage,
      hasPrevPage,
      nextPage: hasNextPage ? page + 1 : null,
      prevPage: hasPrevPage ? page - 1 : null,
    },
    ...(Object.keys(metadata).length > 0 && { metadata }),
    timestamp: new Date().toISOString(),
  };

  return res.status(200).json(response);
};

/**
 * Create a validation error response
 * @param {object} res - Express response object
 * @param {Array} errors - Validation errors
 * @param {string} message - Error message
 */
const validationErrorResponse = (res, errors, message = 'Validation failed') => {
  return errorResponse(res, message, 400, errors);
};

/**
 * Create a not found response
 * @param {object} res - Express response object
 * @param {string} message - Error message
 */
const notFoundResponse = (res, message = 'Resource not found') => {
  return errorResponse(res, message, 404);
};

/**
 * Create an unauthorized response
 * @param {object} res - Express response object
 * @param {string} message - Error message
 */
const unauthorizedResponse = (res, message = 'Unauthorized') => {
  return errorResponse(res, message, 401);
};

/**
 * Create a forbidden response
 * @param {object} res - Express response object
 * @param {string} message - Error message
 */
const forbiddenResponse = (res, message = 'Forbidden') => {
  return errorResponse(res, message, 403);
};

/**
 * Create a rate limit response
 * @param {object} res - Express response object
 * @param {string} message - Error message
 * @param {number} retryAfter - Seconds to wait before retrying
 */
const rateLimitResponse = (res, message = 'Too many requests', retryAfter = 60) => {
  return errorResponse(res, message, 429, null, { retryAfter });
};

module.exports = {
  successResponse,
  errorResponse,
  paginatedResponse,
  validationErrorResponse,
  notFoundResponse,
  unauthorizedResponse,
  forbiddenResponse,
  rateLimitResponse,
};
