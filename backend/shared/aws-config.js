/**
 * Shared AWS Configuration
 * Provides consistent AWS client configuration across all backend services
 */

/**
 * Get AWS configuration object for SDK clients
 * @param {string} service - Optional service name (defaults to 'sqs')
 * @returns {Object} AWS configuration
 */
function getAwsConfig(service = 'sqs') {
  const config = {
    region: process.env.AWS_REGION,
    credentials: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    },
  };

  // Use service-specific endpoint if available
  if (service === 'secrets' && process.env.SECRETS_MANAGER_ENDPOINT) {
    config.endpoint = process.env.SECRETS_MANAGER_ENDPOINT;
  } else if (service === 'kms' && process.env.KMS_ENDPOINT) {
    config.endpoint = process.env.KMS_ENDPOINT;
  } else {
    // Default to SQS endpoint for backwards compatibility
    config.endpoint = process.env.SQS_ENDPOINT;
  }

  return config;
}

module.exports = {
  getAwsConfig,
};
