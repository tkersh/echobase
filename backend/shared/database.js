const mysql = require('mysql2/promise');
const { SecretsManagerClient, GetSecretValueCommand } = require('@aws-sdk/client-secrets-manager');
const { log, logError } = require('./logger');

/**
 * Retrieve database credentials from AWS Secrets Manager
 * @param {Object} awsConfig - AWS configuration object
 * @param {number} maxRetries - Maximum number of retry attempts (default: 30)
 * @returns {Promise<Object>} Database credentials
 */
async function getDbCredentials(awsConfig, maxRetries = 30) {
  const secretName = process.env.DB_SECRET_NAME;
  // Use secrets-specific endpoint if available
  const { getAwsConfig } = require('./aws-config');
  const secretsConfig = getAwsConfig('secrets');
  const secretsClient = new SecretsManagerClient(secretsConfig);
  const INITIAL_RETRY_DELAY = 1000; // 1 second
  const MAX_RETRY_DELAY = 10000; // 10 seconds

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      log(`Retrieving database credentials from Secrets Manager: ${secretName} (attempt ${attempt}/${maxRetries})`);

      const command = new GetSecretValueCommand({
        SecretId: secretName,
      });

      const response = await secretsClient.send(command);
      const secret = JSON.parse(response.SecretString);

      log('Successfully retrieved database credentials from Secrets Manager');
      return secret;
    } catch (error) {
      if (error.name === 'ResourceNotFoundException') {
        const delay = Math.min(INITIAL_RETRY_DELAY * Math.pow(1.5, attempt - 1), MAX_RETRY_DELAY);
        logError(`Secret '${secretName}' not found (attempt ${attempt}/${maxRetries}), retrying in ${Math.round(delay/1000)}s...`);

        if (attempt < maxRetries) {
          await new Promise(resolve => setTimeout(resolve, delay));
        } else {
          logError(`Secret '${secretName}' not found after ${maxRetries} attempts. Make sure Terraform has been applied.`);
          throw error;
        }
      } else {
        // Different error - fail immediately
        logError('Error retrieving database credentials from Secrets Manager:', error);
        throw error;
      }
    }
  }
}

/**
 * Initialize database connection pool
 * @param {Object} awsConfig - AWS configuration object
 * @returns {Promise<Object>} MySQL connection pool
 */
async function initDatabase(awsConfig) {
  try {
    const dbCredentials = await getDbCredentials(awsConfig);

    // Configure connection pool with reasonable defaults for production
    // Can be overridden via DB_CONNECTION_LIMIT environment variable
    const connectionLimit = parseInt(process.env.DB_CONNECTION_LIMIT) || 10;
    const queueLimit = parseInt(process.env.DB_QUEUE_LIMIT) || 0; // 0 = unlimited queue

    const dbPool = mysql.createPool({
      host: dbCredentials.host,
      port: dbCredentials.port,
      user: dbCredentials.username,
      password: dbCredentials.password,
      database: dbCredentials.dbname,
      waitForConnections: true,
      connectionLimit,
      queueLimit,
    });

    log(`Database connection pool configured: limit=${connectionLimit}, queueLimit=${queueLimit === 0 ? 'unlimited' : queueLimit}`);

    const connection = await dbPool.getConnection();
    log(`Connected to RDS MariaDB database at ${dbCredentials.host}:${dbCredentials.port}`);
    connection.release();

    return dbPool;
  } catch (error) {
    logError('Error initializing database:', error);
    throw error;
  }
}

/**
 * Execute a function within a database transaction
 * Automatically handles commit on success and rollback on error
 *
 * @param {Object} pool - Database connection pool
 * @param {Function} callback - Async function to execute within transaction
 * @returns {Promise<any>} - Result of the callback function
 *
 * @example
 * const result = await withTransaction(dbPool, async (connection) => {
 *   await connection.execute('INSERT INTO users ...', [values]);
 *   await connection.execute('INSERT INTO orders ...', [values]);
 *   return { success: true };
 * });
 */
async function withTransaction(pool, callback) {
  const connection = await pool.getConnection();

  try {
    // Start transaction
    await connection.beginTransaction();
    log('Transaction started');

    // Execute callback with connection
    const result = await callback(connection);

    // Commit transaction
    await connection.commit();
    log('Transaction committed successfully');

    return result;
  } catch (error) {
    // Rollback on error
    await connection.rollback();
    logError('Transaction rolled back due to error:', error.message);
    throw error;
  } finally {
    // Always release connection back to pool
    connection.release();
  }
}

/**
 * Execute multiple operations in a transaction with retry logic
 * Useful for handling transient errors
 *
 * @param {Object} pool - Database connection pool
 * @param {Function} callback - Async function to execute
 * @param {number} maxRetries - Maximum number of retry attempts (default: 3)
 * @returns {Promise<any>} - Result of the callback function
 */
async function withTransactionRetry(pool, callback, maxRetries = 3) {
  let lastError;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await withTransaction(pool, callback);
    } catch (error) {
      lastError = error;
      logError(`Transaction attempt ${attempt} failed:`, error.message);

      if (attempt < maxRetries) {
        // Exponential backoff: 100ms, 200ms, 400ms
        const delay = 100 * Math.pow(2, attempt - 1);
        log(`Retrying transaction in ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }

  logError(`Transaction failed after ${maxRetries} attempts`);
  throw lastError;
}

module.exports = {
  getDbCredentials,
  initDatabase,
  withTransaction,
  withTransactionRetry,
};
