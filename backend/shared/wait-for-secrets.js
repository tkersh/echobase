#!/usr/bin/env node
/**
 * Wait for AWS Secrets Manager to be available before starting the application
 * This handles the race condition where LocalStack starts but secrets aren't created yet
 */

const { SecretsManagerClient, GetSecretValueCommand } = require('@aws-sdk/client-secrets-manager');
const { info, warn, error: logError } = require('./logger');

const MAX_RETRIES = 30;
const INITIAL_RETRY_DELAY = 1000; // 1 second
const MAX_RETRY_DELAY = 10000; // 10 seconds

async function waitForSecret() {
  const secretName = process.env.DB_SECRET_NAME;

  if (!secretName) {
    logError('DB_SECRET_NAME environment variable is not set');
    process.exit(1);
  }

  const awsConfig = {
    region: process.env.AWS_REGION,
    endpoint: process.env.SQS_ENDPOINT,
    credentials: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    },
  };

  // Use secrets-specific endpoint if available
  const { getAwsConfig } = require('./aws-config');
  const secretsConfig = getAwsConfig('secrets');
  const client = new SecretsManagerClient(secretsConfig);

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const command = new GetSecretValueCommand({ SecretId: secretName });
      await client.send(command);
      info(`✓ Secret '${secretName}' is available`);
      return; // Success!
    } catch (err) {
      if (err.name === 'ResourceNotFoundException') {
        const delay = Math.min(INITIAL_RETRY_DELAY * Math.pow(1.5, attempt - 1), MAX_RETRY_DELAY);
        info(`Waiting for secret '${secretName}' (attempt ${attempt}/${MAX_RETRIES}, retry in ${Math.round(delay/1000)}s)...`);

        if (attempt < MAX_RETRIES) {
          await new Promise(resolve => setTimeout(resolve, delay));
        } else {
          logError(`Secret '${secretName}' not found after ${MAX_RETRIES} attempts`);
          logError('Make sure Terraform has been applied to create the secrets in LocalStack.');
          process.exit(1);
        }
      } else {
        // Different error - fail immediately
        logError('Unexpected error accessing Secrets Manager:', err.message);
        process.exit(1);
      }
    }
  }
}

// Run and exit
waitForSecret()
  .then(() => {
    info('Starting application...');
    process.exit(0);
  })
  .catch((err) => {
    logError('Fatal error:', err);
    process.exit(1);
  });
