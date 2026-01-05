// Centralized test configuration
// This file contains all hardcoded values used across e2e tests

import { validateRequiredEnv } from '../utils/env-validator.js';

// Validate all required environment variables upfront
// Note: API_BASE_URL and BASE_URL are validated in their respective modules
// (api-helper.js and playwright.config.js)
validateRequiredEnv(
  ['DB_HOST', 'DB_PORT', 'DB_NAME', 'DB_USER', 'DB_PASSWORD'],
  'E2E test configuration'
);

export const TEST_CONFIG = {
  // AWS/LocalStack configuration
  LOCALSTACK_CONTAINER_NAME: 'echobase-localstack-1',
  SQS_QUEUE_URL: 'http://sqs.us-east-1.localhost.localstack.cloud:4566/000000000000/order-processing-queue',

  // Database configuration - required from environment
  DB_HOST: process.env.DB_HOST,
  DB_PORT: parseInt(process.env.DB_PORT),
  DB_NAME: process.env.DB_NAME,
  DB_USER: process.env.DB_USER,
  DB_PASSWORD: process.env.DB_PASSWORD,

  // Timeout configuration (in milliseconds)
  TIMEOUTS: {
    ORDER_PROCESSING: 15000,      // Time to wait for async order processing
    DEFAULT_WAIT: 10000,           // Default wait time for operations
    CHECK_INTERVAL: 500,           // Polling interval for checking status
    SHORT_WAIT: 1000,              // Short wait for quick operations
    PAGE_LOAD: 2000,               // Wait for page to load
    NETWORK_REQUEST: 5000,         // Wait for network requests
  },

  // HTTP Status codes
  HTTP_STATUS: {
    OK: 200,
    CREATED: 201,
    BAD_REQUEST: 400,
    UNAUTHORIZED: 401,
    FORBIDDEN: 403,
    NOT_FOUND: 404,
    CONFLICT: 409,
    INTERNAL_SERVER_ERROR: 500,
  },

  // Test data limits
  MAX_RETRIES: 3,
  MAX_TEST_USERS: 100,
};
