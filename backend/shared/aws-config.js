/**
 * Shared AWS Configuration
 * Provides consistent AWS client configuration across all backend services
 */

/**
 * Get AWS configuration object for SDK clients
 * @returns {Object} AWS configuration
 */
function getAwsConfig() {
  return {
    region: process.env.AWS_REGION,
    endpoint: process.env.SQS_ENDPOINT,
    credentials: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    },
  };
}

module.exports = {
  getAwsConfig,
};
