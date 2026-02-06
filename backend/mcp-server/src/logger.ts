/**
 * Structured Logging Utility for MCP Server
 * Mirrors the backend shared/logger.js API for consistency.
 *
 * Log Levels: DEBUG, INFO, WARN, ERROR, FATAL
 */

const LOG_LEVELS: Record<string, number> = {
  DEBUG: 0,
  INFO: 1,
  WARN: 2,
  ERROR: 3,
  FATAL: 4,
};

const COLORS: Record<string, string> = {
  DEBUG: '\x1b[36m',
  INFO: '\x1b[32m',
  WARN: '\x1b[33m',
  ERROR: '\x1b[31m',
  FATAL: '\x1b[35m',
  RESET: '\x1b[0m',
};

const currentLogLevel =
  LOG_LEVELS[process.env.LOG_LEVEL?.toUpperCase() ?? ''] ?? LOG_LEVELS.INFO;
const useColors =
  process.env.LOG_COLORS !== 'false' && process.stdout.isTTY === true;
const useJsonFormat = process.env.LOG_FORMAT === 'json';

function getLocalTimestamp(): string {
  return new Date().toLocaleString('en-US', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
}

function logWithLevel(level: string, args: unknown[]): void {
  const levelValue = LOG_LEVELS[level];
  if (levelValue === undefined || levelValue < currentLogLevel) return;

  if (useJsonFormat) {
    const message = args
      .map((a) => (typeof a === 'string' ? a : JSON.stringify(a)))
      .join(' ');
    const output = JSON.stringify({
      timestamp: new Date().toISOString(),
      level,
      message,
    });
    if (level === 'ERROR' || level === 'FATAL') {
      console.error(output);
    } else {
      console.log(output);
    }
  } else {
    const timestamp = getLocalTimestamp();
    const color = useColors ? COLORS[level] : '';
    const reset = useColors ? COLORS.RESET : '';
    const prefix = `${color}[${timestamp}] [${level}]${reset}`;
    if (level === 'ERROR' || level === 'FATAL') {
      console.error(prefix, ...args);
    } else if (level === 'WARN') {
      console.warn(prefix, ...args);
    } else {
      console.log(prefix, ...args);
    }
  }
}

export function debug(...args: unknown[]): void {
  logWithLevel('DEBUG', args);
}
export function info(...args: unknown[]): void {
  logWithLevel('INFO', args);
}
export function warn(...args: unknown[]): void {
  logWithLevel('WARN', args);
}
export function error(...args: unknown[]): void {
  logWithLevel('ERROR', args);
}
export function fatal(...args: unknown[]): void {
  logWithLevel('FATAL', args);
}

// Backward-compatible aliases
export const log = info;
export const logError = error;

export { LOG_LEVELS, getLocalTimestamp };
