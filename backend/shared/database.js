const mysql = require('mysql2/promise');
const { SecretsManagerClient, GetSecretValueCommand } = require('@aws-sdk/client-secrets-manager');
const { log, logError } = require('./logger');

/**
 * Retrieve database credentials from AWS Secrets Manager
 * @param {Object} awsConfig - AWS configuration object
 * @returns {Promise<Object>} Database credentials
 */
async function getDbCredentials(awsConfig) {
  try {
    const secretName = process.env.DB_SECRET_NAME;
    log(`Retrieving database credentials from Secrets Manager: ${secretName}`);

    const secretsClient = new SecretsManagerClient(awsConfig);
    const command = new GetSecretValueCommand({
      SecretId: secretName,
    });

    const response = await secretsClient.send(command);
    const secret = JSON.parse(response.SecretString);

    log('Successfully retrieved database credentials from Secrets Manager');
    return secret;
  } catch (error) {
    logError('Error retrieving database credentials from Secrets Manager:', error);
    throw error;
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

    const dbPool = mysql.createPool({
      host: dbCredentials.host,
      port: dbCredentials.port,
      user: dbCredentials.username,
      password: dbCredentials.password,
      database: dbCredentials.dbname,
      waitForConnections: true,
      connectionLimit: 10,
      queueLimit: 0,
    });

    const connection = await dbPool.getConnection();
    log(`Connected to RDS MariaDB database at ${dbCredentials.host}:${dbCredentials.port}`);
    connection.release();

    return dbPool;
  } catch (error) {
    logError('Error initializing database:', error);
    throw error;
  }
}

module.exports = {
  getDbCredentials,
  initDatabase,
};
