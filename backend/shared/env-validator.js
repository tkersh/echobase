/**
 * Environment Variable Validator
 * Validates that all required environment variables are present at startup
 * Enforces fail-fast principle - throws error if any required variable is missing
 */

const { logError } = require('./logger');

/**
 * Validate required environment variables - throws error if any are missing
 * @param {string[]} requiredVars - Array of required environment variable names
 * @param {string} context - Context description for error messages (e.g., "API Gateway", "Order Processor")
 * @throws {Error} If any required variable is missing
 */
function validateRequiredEnv(requiredVars, context = 'application') {
  const missing = requiredVars.filter(varName => !process.env[varName]);

  if (missing.length > 0) {
    const varList = missing.join(', ');
    const error = new Error(
      `Missing required environment variable${missing.length > 1 ? 's' : ''} for ${context}: ${varList}`
    );
    logError(error.message);
    logError('Please ensure all required environment variables are set in your .env file or environment.');
    throw error;
  }
}

// Common environment variables needed by API Gateway
const API_GATEWAY_REQUIRED_VARS = [
  'PORT',
  'AWS_REGION',
  'AWS_ACCESS_KEY_ID',
  'AWS_SECRET_ACCESS_KEY',
  'SQS_ENDPOINT',
  'SQS_QUEUE_URL',
  'DB_SECRET_NAME',
  'JWT_SECRET',
  'CORS_ORIGIN',
  'OTEL_COLLECTOR_ENDPOINT',
  'OTEL_TRACE_SAMPLE_RATIO',
  'OTEL_SERVICE_NAME',
  // Note: RATE_LIMIT_WINDOW_MS and RATE_LIMIT_MAX_REQUESTS are optional
  // Only needed if RATE_LIMIT_ENABLED=true
];

// Common environment variables needed by Order Processor
const ORDER_PROCESSOR_REQUIRED_VARS = [
  'AWS_REGION',
  'AWS_ACCESS_KEY_ID',
  'AWS_SECRET_ACCESS_KEY',
  'SQS_ENDPOINT',
  'SQS_QUEUE_URL',
  'DB_SECRET_NAME',
  'DB_HOST',
  'DB_PORT',
  'DB_NAME',
  'MAX_MESSAGES',
  'HEALTH_PORT',
  'DB_CONNECTION_LIMIT',
  'OTEL_COLLECTOR_ENDPOINT',
  'OTEL_TRACE_SAMPLE_RATIO',
  'OTEL_SERVICE_NAME',
];

module.exports = {
  validateRequiredEnv,
  API_GATEWAY_REQUIRED_VARS,
  ORDER_PROCESSOR_REQUIRED_VARS,
};
