/**
 * Shared Logging utility with local timestamps
 * Provides consistent timestamp formatting across all backend services
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

function log(...args) {
  console.log(`[${getLocalTimestamp()}]`, ...args);
}

function logError(...args) {
  console.error(`[${getLocalTimestamp()}]`, ...args);
}

module.exports = {
  log,
  logError,
  getLocalTimestamp,
};
