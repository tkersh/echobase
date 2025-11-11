/**
 * Environment Variable Validator
 * Validates that all required environment variables are present at startup
 */

const { logError } = require('./logger');

/**
 * Validate required environment variables
 * @param {string[]} requiredVars - Array of required environment variable names
 * @returns {boolean} True if all required vars are present, false otherwise
 */
function validateEnvVars(requiredVars) {
  const missingVars = [];

  for (const varName of requiredVars) {
    if (!process.env[varName]) {
      missingVars.push(varName);
    }
  }

  if (missingVars.length > 0) {
    logError('ERROR: Missing required environment variables:');
    missingVars.forEach(varName => {
      logError(`  - ${varName}`);
    });
    logError('Please ensure all required environment variables are set in your .env file or environment.');
    return false;
  }

  return true;
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
  'POLL_INTERVAL',
];

module.exports = {
  validateEnvVars,
  API_GATEWAY_REQUIRED_VARS,
  ORDER_PROCESSOR_REQUIRED_VARS,
};
