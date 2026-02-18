require('dotenv').config();
const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const compression = require('compression');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const csrfProtection = require('../middleware/csrf-middleware');
const correlationId = require('../middleware/correlation-id');
const { log, logError, debug } = require('../../shared/logger');
const { parseAllowedOrigins } = require('../../shared/cors-utils');

/**
 * Configures and sets up middleware for the Express application.
 * @param {express.Application} app - The Express application instance.
 * @param {object} options - Configuration options.
 * @param {object} options.dbPool - The database connection pool.
 * @param {object} options.sqsClient - The AWS SQS client.
 * @returns {void}
 */
function setupMiddleware(app, { dbPool, sqsClient }) {
  // Trust proxy - required for rate limiting to work correctly behind nginx
  app.set('trust proxy', 1);

  // Performance: Compression middleware for response compression
  app.use(compression());

  // Security: Helmet middleware for security headers
  app.use(helmet());

  // Security: CORS configuration - restrict to specific origins
  const allowedOrigins = parseAllowedOrigins(process.env.CORS_ORIGIN, { exitOnError: true });
  const corsOptions = {
    origin: allowedOrigins,
    methods: ['GET', 'POST'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-API-Key'],
    credentials: true,
    maxAge: 86400, // 24 hours
  };
  app.use(cors(corsOptions));
  log('CORS configured for origins:', allowedOrigins);

  // Security: CSRF Protection Middleware
  app.use(csrfProtection);

  // Security: Request size limits (prevent large payload attacks)
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: true, limit: '1mb' }));

  // Cookie parser for HttpOnly cookie-based authentication
  app.use(cookieParser());

  // Correlation ID for request tracing across services
  app.use(correlationId);

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
  const rateLimitEnabled = process.env.RATE_LIMIT_ENABLED !== 'false';
  if (rateLimitEnabled) {
    const limiter = rateLimit({
      windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 900000, // Default: 15 minutes
      max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 100, // Default: 100 requests per window
      message: {
        error: 'Too many requests from this IP, please try again later.',
      },
      standardHeaders: true,
      legacyHeaders: false,
      trustProxy: true,
    });
    // Apply rate limiting to API routes only (not health check)
    app.use('/api/v1/', limiter);
    log('Rate limiting enabled');
  } else {
    log('WARNING: Rate limiting disabled (not recommended for production)');
  }

  // Middleware to attach database connection to requests
  app.use((req, res, next) => {
    req.db = dbPool; // Assuming dbPool is available here
    req.sqsClient = sqsClient; // Assuming sqsClient is available here
    next();
  });
}

module.exports = { setupMiddleware };
