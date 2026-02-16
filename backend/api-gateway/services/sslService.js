const https = require('https');
const path = require('path');
const fs = require('fs');
const { SecretsManagerClient, GetSecretValueCommand } = require('@aws-sdk/client-secrets-manager');
const { log, warn, debug, logError } = require('../../shared/logger');
const { getAwsConfig } = require('../../shared/aws-config');

const sslKeyPath = path.join(__dirname, '..' , 'ssl', 'api-gateway.key');
const sslCertPath = path.join(__dirname, '..', 'ssl', 'api-gateway.crt');

/**
 * Initializes SSL options from Secrets Manager.
 * @returns {Promise<{key: string|Buffer, cert: string|Buffer}|null>}
 */
async function initSSL() {
  log('Initializing SSL configuration...');

  // Try Secrets Manager (Preferred & Enforced)
  if (process.env.AWS_REGION) {
    try {
      const secretsClient = new SecretsManagerClient(getAwsConfig('secrets'));
      const command = new GetSecretValueCommand({ SecretId: 'echobase/api-gateway/ssl' });
      const response = await secretsClient.send(command);

      if (response.SecretString) {
        const { key, cert } = JSON.parse(response.SecretString);
        if (key && cert) {
          log('SSL certificates retrieved from Secrets Manager');
          return { key, cert };
        }
      }
    } catch (error) {
      // Ignore resource not found, log others
      if (error.name !== 'ResourceNotFoundException') {
        warn(`Failed to fetch SSL secrets: ${error.message}`);
      } else {
        debug('SSL secret not found in Secrets Manager.');
      }
    }
  }

  // Fallback to local files (development only)
  if (!process.env.NODE_ENV || process.env.NODE_ENV === 'development') {
    try {
      const key = fs.readFileSync(sslKeyPath);
      const cert = fs.readFileSync(sslCertPath);
      log('SSL certificates loaded from local filesystem (development mode)');
      return { key, cert };
    } catch (fileError) {
      debug(`Local SSL files not found: ${fileError.message}`);
    }
  }

  return null;
}

/**
 * Creates an HTTPS server if SSL options are provided, otherwise returns the app directly (for HTTP).
 * @param {express.Application} app - The Express application instance.
 * @param {object|null} sslOptions - SSL key and certificate, or null if not available.
 * @returns {https.Server|express.Application}
 */
function createHttpsServer(app, sslOptions) {
  if (sslOptions) {
    log('HTTPS/TLS enabled - MITM protection active');
    return https.createServer(sslOptions, app);
  } else {
    const isProduction = process.env.NODE_ENV === 'production';
    if (isProduction) {
      logError('FATAL: SSL certificates not found in Secrets Manager or filesystem');
      logError('Production deployment requires HTTPS. Exiting...');
      process.exit(1);
    } else {
      warn('WARNING: SSL certificates not found - running in HTTP mode (DEVELOPMENT ONLY)');
      return app; // Fallback to HTTP in development
    }
  }
}

module.exports = { initSSL, createHttpsServer };
