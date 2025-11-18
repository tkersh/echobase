/**
 * Structured Logging Utility with Levels
 * Provides consistent timestamp formatting and log levels across all backend services
 *
 * Log Levels:
 * - DEBUG: Detailed information for diagnosing problems
 * - INFO: General informational messages
 * - WARN: Warning messages for potentially harmful situations
 * - ERROR: Error events that might still allow the application to continue
 * - FATAL: Very severe error events that will presumably lead the application to abort
 */

// Log level constants
const LOG_LEVELS = {
  DEBUG: 0,
  INFO: 1,
  WARN: 2,
  ERROR: 3,
  FATAL: 4,
};

// Color codes for terminal output
const COLORS = {
  DEBUG: '\x1b[36m', // Cyan
  INFO: '\x1b[32m',  // Green
  WARN: '\x1b[33m',  // Yellow
  ERROR: '\x1b[31m', // Red
  FATAL: '\x1b[35m', // Magenta
  RESET: '\x1b[0m',
};

// Current log level from environment (default: INFO)
const currentLogLevel = LOG_LEVELS[process.env.LOG_LEVEL?.toUpperCase()] ?? LOG_LEVELS.INFO;

// Enable/disable colors based on environment
const useColors = process.env.LOG_COLORS !== 'false' && process.stdout.isTTY;

/**
 * Get formatted local timestamp
 */
function getLocalTimestamp() {
  return new Date().toLocaleString('en-US', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  });
}

/**
 * Format log message with level, timestamp, and optional context
 * @param {string} level - Log level
 * @param {Array} args - Arguments to log
 * @param {Object} context - Optional context object
 */
function formatMessage(level, args, context = {}) {
  const timestamp = getLocalTimestamp();
  const color = useColors ? COLORS[level] : '';
  const reset = useColors ? COLORS.RESET : '';

  let message = `${color}[${timestamp}] [${level}]${reset}`;

  // Add context if provided
  if (Object.keys(context).length > 0) {
    message += ` [${JSON.stringify(context)}]`;
  }

  return message;
}

/**
 * Core logging function
 * @param {string} level - Log level
 * @param {Array} args - Arguments to log
 * @param {Object} context - Optional context object
 */
function logWithLevel(level, args, context = {}) {
  const levelValue = LOG_LEVELS[level];

  // Only log if current level is enabled
  if (levelValue < currentLogLevel) {
    return;
  }

  const formattedMessage = formatMessage(level, args, context);

  // Use appropriate console method
  if (level === 'ERROR' || level === 'FATAL') {
    console.error(formattedMessage, ...args);
  } else if (level === 'WARN') {
    console.warn(formattedMessage, ...args);
  } else {
    console.log(formattedMessage, ...args);
  }
}

/**
 * Debug level logging
 * Detailed information for diagnosing problems
 */
function debug(...args) {
  logWithLevel('DEBUG', args);
}

/**
 * Info level logging (default)
 * General informational messages
 */
function info(...args) {
  logWithLevel('INFO', args);
}

/**
 * Warning level logging
 * Potentially harmful situations
 */
function warn(...args) {
  logWithLevel('WARN', args);
}

/**
 * Error level logging
 * Error events that might still allow the application to continue
 */
function error(...args) {
  logWithLevel('ERROR', args);
}

/**
 * Fatal level logging
 * Very severe errors that will presumably lead to abort
 */
function fatal(...args) {
  logWithLevel('FATAL', args);
}

/**
 * Log with custom context
 * Useful for adding request IDs, user IDs, etc.
 */
function logWithContext(level, context, ...args) {
  logWithLevel(level, args, context);
}

// Backward compatibility aliases
function log(...args) {
  info(...args);
}

function logError(...args) {
  error(...args);
}

module.exports = {
  // New structured logging API
  debug,
  info,
  warn,
  error,
  fatal,
  logWithContext,

  // Backward compatibility
  log,
  logError,
  getLocalTimestamp,

  // Utilities
  LOG_LEVELS,
};
