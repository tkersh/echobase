/**
 * Frontend Logging Utility with Levels + OTEL Log Emission
 * Provides consistent log levels across the frontend application.
 * When OTEL tracing is active, log messages are also emitted as span events.
 *
 * Log Levels:
 * - DEBUG: Detailed information for diagnosing problems (default: disabled)
 * - INFO: General informational messages
 * - WARN: Warning messages for potentially harmful situations
 * - ERROR: Error events
 *
 * Usage:
 *   import { debug, info, warn, error } from './utils/logger';
 *   debug('Detailed debug info', data);
 *   info('Application started');
 *   warn('Deprecated feature used');
 *   error('Failed to load data', err);
 */

import { trace } from '@opentelemetry/api';

// Log level constants
const LOG_LEVELS = {
  DEBUG: 0,
  INFO: 1,
  WARN: 2,
  ERROR: 3,
};

// Get log level from environment or localStorage (default: INFO)
// In production builds, Vite will replace import.meta.env.* at build time
function getCurrentLogLevel() {
  // Check Vite environment variable first
  const envLevel = import.meta.env.VITE_LOG_LEVEL?.toUpperCase();
  if (envLevel && LOG_LEVELS[envLevel] !== undefined) {
    return LOG_LEVELS[envLevel];
  }

  // Check localStorage for runtime override (useful for debugging)
  // NOTE: We use raw localStorage here to avoid circular dependency with storage.js
  if (typeof window !== 'undefined' && window.localStorage) {
    const storedLevel = localStorage.getItem('LOG_LEVEL')?.toUpperCase();
    if (storedLevel && LOG_LEVELS[storedLevel] !== undefined) {
      return LOG_LEVELS[storedLevel];
    }
  }

  // Default to INFO
  return LOG_LEVELS.INFO;
}

const currentLogLevel = getCurrentLogLevel();

/**
 * Get formatted timestamp
 */
function getTimestamp() {
  return new Date().toLocaleTimeString('en-US', { hour12: false });
}

/**
 * Format log message with level and timestamp
 */
function formatMessage(level, args) {
  const timestamp = getTimestamp();
  const prefix = `[${timestamp}] [${level}]`;
  return [prefix, ...args];
}

/**
 * Emit log as OTEL span event (if an active span exists)
 */
function emitOtelLog(level, args) {
  try {
    const span = trace.getActiveSpan();
    if (!span) return;

    const message = args.map(a => (typeof a === 'string' ? a : JSON.stringify(a))).join(' ');
    span.addEvent('log', {
      'log.severity': level,
      'log.message': message,
    });
  } catch (_) {
    // Silently ignore OTEL failures
  }
}

/**
 * Core logging function
 */
function logWithLevel(level, consoleMethod, args) {
  const levelValue = LOG_LEVELS[level];

  // Only log if current level is enabled
  if (levelValue < currentLogLevel) {
    return;
  }

  // Console output (primary channel)
  const formattedArgs = formatMessage(level, args);
  consoleMethod(...formattedArgs);

  // OTEL log emission (secondary channel)
  emitOtelLog(level, args);
}

/**
 * Debug level logging
 * Detailed information for diagnosing problems
 * Only logs when LOG_LEVEL=DEBUG
 */
export function debug(...args) {
  logWithLevel('DEBUG', console.log, args);
}

/**
 * Info level logging (default)
 * General informational messages
 */
export function info(...args) {
  logWithLevel('INFO', console.log, args);
}

/**
 * Warning level logging
 * Potentially harmful situations
 */
export function warn(...args) {
  logWithLevel('WARN', console.warn, args);
}

/**
 * Error level logging
 * Error events
 */
export function error(...args) {
  logWithLevel('ERROR', console.error, args);
}

/**
 * Set log level at runtime (useful for debugging)
 * @param {string} level - Log level (DEBUG, INFO, WARN, ERROR)
 */
export function setLogLevel(level) {
  const upperLevel = level?.toUpperCase();
  if (LOG_LEVELS[upperLevel] !== undefined && typeof window !== 'undefined') {
    localStorage.setItem('LOG_LEVEL', upperLevel);
    console.log(`Log level set to ${upperLevel}. Reload page to apply.`);
  } else {
    console.error(`Invalid log level: ${level}. Valid levels: DEBUG, INFO, WARN, ERROR`);
  }
}

// Export log levels for external use
export { LOG_LEVELS };

// Log current level on import (only in development)
if (import.meta.env.DEV) {
  const levelName = Object.keys(LOG_LEVELS).find(
    key => LOG_LEVELS[key] === currentLogLevel
  );
  console.log(`[Logger] Current log level: ${levelName}`);
}
