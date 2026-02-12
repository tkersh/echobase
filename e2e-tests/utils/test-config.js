/**
 * Centralized Test Configuration
 * All hardcoded test values in one place with env var overrides.
 */

const TEST_CONFIG = {
  // Container names (override for CI blue/green environments)
  LOCALSTACK_CONTAINER: process.env.LOCALSTACK_CONTAINER || 'echobase-localstack-1',

  // SQS
  SQS_QUEUE_URL: process.env.SQS_QUEUE_URL
    || 'http://sqs.us-east-1.localhost.localstack.cloud:4566/000000000000/order-processing-queue',

  // Timeouts
  DB_WAIT_TIMEOUT_MS: parseInt(process.env.TEST_DB_WAIT_TIMEOUT || '15000', 10),
  SQS_PURGE_WAIT_MS: parseInt(process.env.TEST_SQS_PURGE_WAIT || '500', 10),
  DEFAULT_TEST_TIMEOUT_MS: parseInt(process.env.TEST_TIMEOUT || '30000', 10),

  // Product count (used for random product selection in order tests)
  PRODUCT_COUNT: parseInt(process.env.TEST_PRODUCT_COUNT || '11', 10),
};

export default TEST_CONFIG;
