const { SQSClient, GetQueueAttributesCommand } = require('@aws-sdk/client-sqs');
const { log, logError } = require('../../shared/logger');
const { HEALTH_CACHE_TTL_MS } = require('../../shared/constants');

class HealthService {
  constructor(dbPool, sqsClient) {
    this.dbPool = dbPool;
    this.sqsClient = sqsClient;
    this.healthCache = null;
    this.healthCacheExpiry = 0;
  }

  /**
   * Verifies SQS connectivity with retry logic.
   * @param {number} maxRetries - Maximum number of retry attempts (default: 10).
   * @returns {Promise<void>}
   */
  async verifySQSConnectivity(maxRetries = 10) {
    const INITIAL_RETRY_DELAY = 1000; // 1 second
    const MAX_RETRY_DELAY = 5000; // 5 seconds

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        log(`Verifying SQS connectivity (attempt ${attempt}/${maxRetries})...`);
        const testCommand = new GetQueueAttributesCommand({
          QueueUrl: process.env.SQS_QUEUE_URL,
          AttributeNames: ['ApproximateNumberOfMessages']
        });
        await this.sqsClient.send(testCommand);
        log('SQS connectivity verified successfully');
        return;
      } catch (error) {
        const delay = Math.min(INITIAL_RETRY_DELAY * Math.pow(1.5, attempt - 1), MAX_RETRY_DELAY);
        logError(`SQS connectivity check failed (attempt ${attempt}/${maxRetries}): ${error.message}`);

        if (attempt < maxRetries) {
          log(`Retrying SQS connectivity check in ${Math.round(delay / 1000)}s...`);
          await new Promise(resolve => setTimeout(resolve, delay));
        } else {
          logError(`SQS connectivity verification failed after ${maxRetries} attempts`);
          throw error;
        }
      }
    }
  }

  /**
   * Gets the current health status of the application and its dependencies.
   * Results are cached to avoid hammering dependencies.
   * @returns {Promise<object>}
   */
  async getHealthStatus() {
    const now = Date.now();
    if (this.healthCache && now < this.healthCacheExpiry) {
      return this.healthCache;
    }

    const health = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      version: '1.0.0',
      checks: {
        database: { status: 'unknown', message: '' },
        sqs: { status: 'unknown', message: '' },
      }
    };

    let allHealthy = true;

    // Check database connectivity
    try {
      if (this.dbPool) {
        const connection = await this.dbPool.getConnection();
        await connection.query('SELECT 1');
        connection.release();
        health.checks.database.status = 'healthy';
        health.checks.database.message = 'Database connection successful';
      } else {
        health.checks.database.status = 'unhealthy';
        health.checks.database.message = 'Database pool not initialized';
        allHealthy = false;
      }
    } catch (error) {
      health.checks.database.status = 'unhealthy';
      health.checks.database.message = 'Database unavailable';
      logError('Health check database error:', error);
      allHealthy = false;
    }

    // Check SQS connectivity
    try {
      const testCommand = new GetQueueAttributesCommand({
        QueueUrl: process.env.SQS_QUEUE_URL,
        AttributeNames: ['ApproximateNumberOfMessages']
      });
      await this.sqsClient.send(testCommand);
      health.checks.sqs.status = 'healthy';
      health.checks.sqs.message = 'SQS queue accessible';
    } catch (error) {
      health.checks.sqs.status = 'unhealthy';
      health.checks.sqs.message = 'Queue unavailable';
      logError('Health check SQS error:', error);
      allHealthy = false;
    }

    // Set overall status
    if (!allHealthy) {
      health.status = 'degraded';
    }

    // Cache healthy results for 5s; unhealthy results for 1s to allow faster recovery detection
    const cacheTtl = allHealthy ? HEALTH_CACHE_TTL_MS : 1000;
    this.healthCache = health;
    this.healthCacheExpiry = now + cacheTtl;

    return health;
  }
}

module.exports = HealthService;
