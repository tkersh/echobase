const { log, logError } = require('./logger');

/**
 * Parse and validate CORS_ORIGIN environment variable.
 * Returns an array of validated origin URLs.
 *
 * @param {string} corsOriginEnv - Comma-separated list of allowed origins
 * @param {object} options
 * @param {boolean} options.exitOnError - Exit process on invalid origin (default: false)
 * @returns {string[]} Array of validated origin strings
 */
function parseAllowedOrigins(corsOriginEnv, { exitOnError = false } = {}) {
  if (!corsOriginEnv) {
    return [];
  }

  const origins = corsOriginEnv.split(',').map(o => o.trim());

  origins.forEach((origin, index) => {
    try {
      new URL(origin);
      log(`CORS origin ${index + 1}: ${origin}`);
    } catch (e) {
      logError(`Invalid CORS origin format at index ${index + 1}: ${origin}`, e);
      logError('CORS_ORIGIN must be a comma-separated list of valid URLs (e.g., https://example.com:443)');
      if (exitOnError) {
        process.exit(1);
      }
    }
  });

  return origins;
}

/**
 * Check if an origin is allowed by comparing against a list of allowed origins.
 *
 * @param {string} origin - The origin URL to check
 * @param {string[]} allowedOrigins - Array of allowed origin strings
 * @returns {boolean}
 */
function isOriginAllowed(origin, allowedOrigins) {
  try {
    const originUrl = new URL(origin);
    return allowedOrigins.some(allowed => {
      try {
        const allowedUrl = new URL(allowed);
        return originUrl.origin === allowedUrl.origin;
      } catch {
        return false;
      }
    });
  } catch {
    return false;
  }
}

module.exports = { parseAllowedOrigins, isOriginAllowed };
