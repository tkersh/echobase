#!/usr/bin/env node
/**
 * Wait for AWS Secrets Manager to be available before starting the application
 * This handles the race condition where LocalStack starts but secrets aren't created yet
 */

const { SecretsManagerClient, GetSecretValueCommand } = require('@aws-sdk/client-secrets-manager');

const MAX_RETRIES = 30;
const INITIAL_RETRY_DELAY = 1000; // 1 second
const MAX_RETRY_DELAY = 10000; // 10 seconds

async function waitForSecret() {
  const secretName = process.env.DB_SECRET_NAME;

  if (!secretName) {
    console.error('ERROR: DB_SECRET_NAME environment variable is not set');
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

  const client = new SecretsManagerClient(awsConfig);

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const command = new GetSecretValueCommand({ SecretId: secretName });
      await client.send(command);
      console.log(`[${new Date().toLocaleString()}] ✓ Secret '${secretName}' is available`);
      return; // Success!
    } catch (error) {
      if (error.name === 'ResourceNotFoundException') {
        const delay = Math.min(INITIAL_RETRY_DELAY * Math.pow(1.5, attempt - 1), MAX_RETRY_DELAY);
        console.log(`[${new Date().toLocaleString()}] Waiting for secret '${secretName}' (attempt ${attempt}/${MAX_RETRIES}, retry in ${Math.round(delay/1000)}s)...`);

        if (attempt < MAX_RETRIES) {
          await new Promise(resolve => setTimeout(resolve, delay));
        } else {
          console.error(`\n[${new Date().toLocaleString()}] ERROR: Secret '${secretName}' not found after ${MAX_RETRIES} attempts`);
          console.error('Make sure Terraform has been applied to create the secrets in LocalStack.');
          process.exit(1);
        }
      } else {
        // Different error - fail immediately
        console.error(`[${new Date().toLocaleString()}] ERROR: Unexpected error accessing Secrets Manager:`, error.message);
        process.exit(1);
      }
    }
  }
}

// Run and exit
waitForSecret()
  .then(() => {
    console.log(`[${new Date().toLocaleString()}] Starting application...`);
    process.exit(0);
  })
  .catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
