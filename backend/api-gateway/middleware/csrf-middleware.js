/**
 * CSRF Protection Middleware
 * Validates Origin header for state-changing requests
 *
 * Note: JWT in Authorization header already provides some CSRF protection
 * as attackers cannot set custom headers cross-origin
 */

const { debug, info, warn, error: logError } = require('../../shared/logger');
const { isOriginAllowed, parseAllowedOrigins } = require('../../shared/cors-utils');

// Parse allowed origins once at load time — CORS_ORIGIN doesn't change at runtime
let cachedAllowedOrigins;

/**
 * CSRF Protection Middleware
 * Validates that requests come from allowed origins
 */
function csrfProtection(req, res, next) {
  // Skip CSRF check in test environment or when CSRF is explicitly disabled
  if (process.env.NODE_ENV === 'test' || process.env.CSRF_PROTECTION === 'false') {
    return next();
  }

  // Skip CSRF check for safe methods and health check
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method) || req.path === '/health') {
    return next();
  }

  // For state-changing requests (POST, PUT, DELETE), verify origin
  const originHeader = req.get('origin');
  const referer = req.get('referer');
  const host = req.get('host');
  const allowedOrigin = process.env.CORS_ORIGIN;

  // Logging for CSRF validation
  debug(`CSRF check - ${req.method} ${req.path}`);
  debug(`  Origin: ${originHeader || '(not set)'}, Host: ${host || '(not set)'}, Referer: ${referer ? 'set' : '(not set)'}`);

  let origin = originHeader;
  let originSource = 'origin-header';

  // If no origin header, try to extract origin from referer
  if (!origin && referer) {
    try {
      // Try to parse referer as a full URL
      const refererUrl = new URL(referer);
      origin = refererUrl.origin;
      originSource = 'referer-parsed';
      debug(`  Origin extracted from referer: ${origin}`);
    } catch (e) {
      // Referer is not a valid URL (might be a relative path)
      // Use the host header to construct the origin
      const protocol = req.secure || req.get('x-forwarded-proto') === 'https' ? 'https' : 'http';
      origin = `${protocol}://${host}`;
      originSource = 'host-constructed';
      debug(`  Origin constructed from host: ${origin}`);
    }
  }

  // Allow requests without origin header from localhost and internal Docker network
  if (!origin) {
    const isLocalhost = host && (host.startsWith('localhost') || host.startsWith('127.0.0.1'));
    // Allow only specific known internal Docker service hostnames
    const knownInternalHosts = [
      'echobase-blue-api-gateway', 'echobase-green-api-gateway',
      'echobase-blue-frontend', 'echobase-green-frontend',
      'echobase-devlocal-api-gateway', 'echobase-devlocal-frontend',
    ];
    const isInternalDocker = host && knownInternalHosts.some(h => host.startsWith(h));
    // Allow service name references within Docker network
    const isServiceName = host && (host === 'api-gateway' || host.startsWith('api-gateway:') || host === 'frontend' || host.startsWith('frontend:'));

    if (isLocalhost || isInternalDocker || isServiceName) {
      // Allow requests without origin from trusted internal sources
      debug(`  CSRF: Allowing request without origin from trusted host: ${host}`);
      return next();
    }

    warn('CSRF: Rejected request without origin/referer header');
    return res.status(403).json({
      error: 'Forbidden',
      message: 'Origin validation failed',
    });
  }

  // Validate that CORS_ORIGIN is configured
  if (!allowedOrigin) {
    logError('CSRF: CORS_ORIGIN environment variable not set');
    return res.status(500).json({
      error: 'Server configuration error',
      message: 'CORS configuration missing',
    });
  }

  // Validate that origin doesn't contain commas (which would indicate it's incorrectly set)
  if (origin.includes(',')) {
    logError(`CSRF: Origin contains comma (may be misconfigured)`);
    logError(`  Origin value: ${origin}`);
    logError(`  Origin source: ${originSource}`);
    logError(`  Origin header: ${originHeader || '(not set)'}`);
    logError(`  Referer header: ${referer || '(not set)'}`);
    logError(`  Host header: ${host || '(not set)'}`);
    return res.status(403).json({
      error: 'Forbidden',
      message: 'Invalid origin format',
    });
  }

  debug(`  Origin to validate: ${origin} (source: ${originSource})`);

  // Check against allowed origins (parsed once, cached)
  if (!cachedAllowedOrigins) {
    cachedAllowedOrigins = parseAllowedOrigins(allowedOrigin);
  }

  if (!isOriginAllowed(origin, cachedAllowedOrigins)) {
    warn(`CSRF: Rejected request from unauthorized origin: ${origin}`);
    warn(`  Allowed origins: ${cachedAllowedOrigins.join(', ')}`);
    return res.status(403).json({
      error: 'Forbidden',
      message: 'Origin validation failed',
    });
  }

  debug(`CSRF: Validation passed for origin: ${origin}`);

  next();
}

module.exports = csrfProtection;
