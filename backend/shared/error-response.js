/**
 * Standardized Error Response Factory
 * Provides consistent error envelope across all services:
 *   { success: false, error: { code, message, details?, correlationId? } }
 */

/**
 * Create a standardized error response object
 * @param {string} code - Machine-readable error code (e.g., 'VALIDATION_FAILED')
 * @param {string} message - Human-readable error message
 * @param {object} [options] - Optional fields
 * @param {*} [options.details] - Additional error details (validation errors, etc.)
 * @param {string} [options.correlationId] - Request correlation ID
 * @returns {object} Standardized error envelope
 */
function createErrorResponse(code, message, options = {}) {
  const error = { code, message };
  if (options.details !== undefined) error.details = options.details;
  if (options.correlationId) error.correlationId = options.correlationId;
  return { success: false, error };
}

/**
 * Send a standardized error response via Express res object
 * @param {object} res - Express response object
 * @param {number} statusCode - HTTP status code
 * @param {string} code - Machine-readable error code
 * @param {string} message - Human-readable error message
 * @param {object} [options] - Optional fields (details, correlationId)
 */
function sendError(res, statusCode, code, message, options = {}) {
  res.status(statusCode).json(createErrorResponse(code, message, options));
}

// Common error codes
const ErrorCodes = {
  VALIDATION_FAILED: 'VALIDATION_FAILED',
  AUTHENTICATION_REQUIRED: 'AUTHENTICATION_REQUIRED',
  AUTHENTICATION_FAILED: 'AUTHENTICATION_FAILED',
  ACCOUNT_LOCKED: 'ACCOUNT_LOCKED',
  FORBIDDEN: 'FORBIDDEN',
  NOT_FOUND: 'NOT_FOUND',
  CONFLICT: 'CONFLICT',
  RATE_LIMITED: 'RATE_LIMITED',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  SERVICE_UNAVAILABLE: 'SERVICE_UNAVAILABLE',
  INVALID_ORIGIN: 'INVALID_ORIGIN',
  CONFIG_ERROR: 'CONFIG_ERROR',
};

module.exports = { createErrorResponse, sendError, ErrorCodes };
