/**
 * Utility for validating required environment variables
 * Enforces fail-fast principle - no silent defaults
 */

/**
 * Validates that all required environment variables are set
 * @param {string[]} requiredVars - Array of required environment variable names
 * @param {string} context - Context description for error messages (e.g., "E2E tests", "Database connection")
 * @throws {Error} If any required variable is missing
 */
export function validateRequiredEnv(requiredVars, context = 'application') {
  const missing = requiredVars.filter(varName => !process.env[varName]);

  if (missing.length > 0) {
    const varList = missing.join(', ');
    throw new Error(
      `Missing required environment variable${missing.length > 1 ? 's' : ''} for ${context}: ${varList}`
    );
  }
}

/**
 * Gets a required environment variable value
 * @param {string} name - Environment variable name
 * @param {string} context - Context description for error message
 * @returns {string} The environment variable value
 * @throws {Error} If the variable is not set
 */
export function getRequiredEnv(name, context = 'application') {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} environment variable is required for ${context}`);
  }
  return value;
}
