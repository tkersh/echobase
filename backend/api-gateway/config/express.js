const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const bodyParser = require('body-parser');
const compression = require('compression');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const csrfProtection = require('../middleware/csrf-middleware');
const correlationId = require('../middleware/correlation-id');
const { log, debug, warn } = require('../../shared/logger');
const { parseAllowedOrigins } = require('../../shared/cors-utils');

/**
 * Configures the Express application with middleware and security settings.
 * @param {express.Application} app - The Express application instance.
 * @param {object} dbPool - The database connection pool.
 */
function configureExpressApp(app, dbPool) {
  // Trust proxy - required for rate limiting to work correctly behind nginx
  // Set to 1 to trust only the first proxy (nginx), not beyond that
  app.set('trust proxy', 1);

  // Middleware to attach database connection to requests
  app.use((req, res, next) => {
    req.db = dbPool;
    next();
  });

  // Correlation ID for request tracing across services
  app.use(correlationId);

  // Performance: Compression middleware for response compression
  app.use(compression());

  // Security: Helmet middleware for security headers
  app.use(helmet());

  // Security: CORS configuration - restrict to specific origins
  const allowedOrigins = parseAllowedOrigins(process.env.CORS_ORIGIN, { exitOnError: true });

  const corsOptions = {
    // CORS_ORIGIN can be a comma-separated list of allowed origins
    origin: allowedOrigins,
    methods: ['GET', 'POST'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-API-Key'],
    credentials: true,
    maxAge: 86400, // 24 hours
  };
  app.use(cors(corsOptions));

  // Security: CSRF Protection Middleware
  // Extracted to middleware/csrf-middleware.js for better code organization
  app.use(csrfProtection);

  // Security: Request size limits (prevent large payload attacks)
  app.use(bodyParser.json({ limit: '1mb' }));
  app.use(bodyParser.urlencoded({ extended: true, limit: '1mb' }));

  // Cookie parser for HttpOnly cookie-based authentication
  app.use(cookieParser());

  // Debug logging for POST requests (only when LOG_LEVEL=DEBUG)
  app.use((req, res, next) => {
    if (req.method === 'POST' && req.path.includes('/orders')) {
      debug('POST request to:', req.path);
      debug('Content-Type:', req.get('content-type'));
      debug('Body after parsing:', JSON.stringify(req.body));
    }
    next();
  });

  // Security: Rate limiting (prevent DoS attacks)
  // Enabled by default for security. Set RATE_LIMIT_ENABLED=false to disable (not recommended)
  const rateLimitEnabled = process.env.RATE_LIMIT_ENABLED !== 'false';

  if (rateLimitEnabled) {
    const limiter = rateLimit({
      windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 900000, // Default: 15 minutes
      max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 100, // Default: 100 requests per window
      message: {
        error: 'Too many requests from this IP, please try again later.',
      },
      standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
      legacyHeaders: false, // Disable the `X-RateLimit-*` headers
      // Trust proxy - use leftmost IP from X-Forwarded-For header
      trustProxy: true,
    });

    // Apply rate limiting to API routes only (not health check)
    app.use('/api/v1/', limiter);
    log('Rate limiting enabled');
  } else {
    warn('WARNING: Rate limiting disabled (not recommended for production)');
  }
}

module.exports = configureExpressApp;
