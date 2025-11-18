require('dotenv').config();
const express = require('express');
const https = require('https');
const fs = require('fs');
const path = require('path');
const cors = require('cors');
const bodyParser = require('body-parser');
const compression = require('compression');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { body, validationResult } = require('express-validator');
const swaggerUi = require('swagger-ui-express');
const swaggerSpec = require('./config/swagger');
const { SQSClient } = require('@aws-sdk/client-sqs');
const { log, logError } = require('../shared/logger');
const { getAwsConfig } = require('../shared/aws-config');
const { initDatabase } = require('../shared/database');
const { validateEnvVars, API_GATEWAY_REQUIRED_VARS } = require('../shared/env-validator');
const {
  ORDER_MAX_QUANTITY,
  ORDER_MIN_PRICE,
  ORDER_MAX_PRICE,
  PRODUCT_NAME_MIN_LENGTH,
  PRODUCT_NAME_MAX_LENGTH,
  PRODUCT_NAME_PATTERN,
} = require('../shared/constants');
const OrderService = require('./services/orderService');

// Validate environment variables at startup
if (!validateEnvVars(API_GATEWAY_REQUIRED_VARS)) {
  process.exit(1);
}

const app = express();
const PORT = process.env.PORT;

// Trust proxy - required for rate limiting to work correctly behind nginx
// Set to 1 to trust only the first proxy (nginx), not beyond that
app.set('trust proxy', 1);

let dbPool;

// AWS configuration
const awsConfig = getAwsConfig();

// Middleware to attach database connection to requests
app.use((req, res, next) => {
  req.db = dbPool;
  next();
});

/**
 * Security Features Enabled:
 *   ✓ Helmet - Security headers (XSS, clickjacking, MIME sniffing protection)
 *   ✓ CORS restrictions - Limited to specific origin(s)
 *   ✓ Rate limiting - Prevents DoS attacks (configurable per IP)
 *   ✓ Request size limits - 1MB maximum payload
 *   ✓ Input validation - Comprehensive field validation (express-validator)
 *   ✓ Input sanitization - HTML escaping, trimming, type conversion
 *   ✓ Business logic validation - Order total limits and range checks
 *   ✓ Error handling - Generic errors, no information disclosure
 *   ✓ JWT authentication - User authentication with JSON Web Tokens
 *   ✓ API key authentication - Service-to-service authentication
 */

// Performance: Compression middleware for response compression
app.use(compression());

// Security: Helmet middleware for security headers
app.use(helmet());

// Security: CORS configuration - restrict to specific origins
const corsOptions = {
  origin: process.env.CORS_ORIGIN,
  methods: ['GET', 'POST'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-API-Key'],
  credentials: true,
  maxAge: 86400, // 24 hours
};
app.use(cors(corsOptions));

// Security: CSRF Protection Middleware
// Validates Origin header for state-changing requests
// Note: JWT in Authorization header already provides some CSRF protection
// as attackers cannot set custom headers cross-origin
const csrfProtection = (req, res, next) => {
  // Skip CSRF check in test environment or when CSRF is explicitly disabled
  if (process.env.NODE_ENV === 'test' || process.env.CSRF_PROTECTION === 'false') {
    return next();
  }

  // Skip CSRF check for safe methods and health check
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method) || req.path === '/health') {
    return next();
  }

  // For state-changing requests (POST, PUT, DELETE), verify origin
  const origin = req.get('origin') || req.get('referer');
  const allowedOrigin = process.env.CORS_ORIGIN;

  // Allow requests without origin header from localhost (for testing and local tools)
  // In production, you may want to remove this and enforce origin headers strictly
  if (!origin) {
    const host = req.get('host');
    const isLocalhost = host && (host.startsWith('localhost') || host.startsWith('127.0.0.1'));

    if (isLocalhost) {
      // Allow localhost requests without origin (useful for testing and curl)
      return next();
    }

    log('CSRF: Rejected request without origin/referer header');
    return res.status(403).json({
      error: 'Forbidden',
      message: 'Origin validation failed',
    });
  }

  // Extract hostname from origin URL
  try {
    const originUrl = new URL(origin);
    const allowedUrl = new URL(allowedOrigin);

    if (originUrl.origin !== allowedUrl.origin) {
      log(`CSRF: Rejected request from unauthorized origin: ${origin}`);
      return res.status(403).json({
        error: 'Forbidden',
        message: 'Origin validation failed',
      });
    }
  } catch (error) {
    logError('CSRF: Error parsing origin URL:', error);
    return res.status(403).json({
      error: 'Forbidden',
      message: 'Origin validation failed',
    });
  }

  next();
};

// Apply CSRF protection to all routes
app.use(csrfProtection);

// Security: Request size limits (prevent large payload attacks)
app.use(bodyParser.json({ limit: '1mb' }));
app.use(bodyParser.urlencoded({ extended: true, limit: '1mb' }));

// DEBUG: Log all POST requests to see body after parsing
app.use((req, res, next) => {
  if (req.method === 'POST' && req.path.includes('/orders')) {
    console.log('[DEBUG MIDDLEWARE] POST request to:', req.path);
    console.log('[DEBUG MIDDLEWARE] Content-Type:', req.get('content-type'));
    console.log('[DEBUG MIDDLEWARE] Body after parsing:', JSON.stringify(req.body));
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
  log('WARNING: Rate limiting disabled (not recommended for production)');
}

// Configure AWS SQS Client
const sqsClient = new SQSClient(awsConfig);

// Initialize Order Service
const orderService = new OrderService(sqsClient, process.env.SQS_QUEUE_URL);

// Import routes and middleware
const authRoutes = require('./routes/auth');
const { authenticateJWT } = require('./middleware/auth');

/**
 * @swagger
 * /health:
 *   get:
 *     summary: Health check endpoint
 *     description: Returns the health status of the application and its dependencies
 *     tags: [System]
 *     responses:
 *       200:
 *         description: System is healthy
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/HealthCheck'
 *       503:
 *         description: System is degraded (one or more dependencies unhealthy)
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/HealthCheck'
 */
// Health check endpoint (no rate limiting)
// Checks application and dependency health
app.get('/health', async (req, res) => {
  const health = {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    version: '1.0.0',
    checks: {
      database: { status: 'unknown', message: '' },
      sqs: { status: 'unknown', message: '' },
    }
  };

  let allHealthy = true;

  // Check database connectivity
  try {
    if (dbPool) {
      const connection = await dbPool.getConnection();
      await connection.query('SELECT 1');
      connection.release();
      health.checks.database.status = 'healthy';
      health.checks.database.message = 'Database connection successful';
    } else {
      health.checks.database.status = 'unhealthy';
      health.checks.database.message = 'Database pool not initialized';
      allHealthy = false;
    }
  } catch (error) {
    health.checks.database.status = 'unhealthy';
    health.checks.database.message = `Database error: ${error.message}`;
    allHealthy = false;
  }

  // Check SQS connectivity
  try {
    const { SQSClient, GetQueueAttributesCommand } = require('@aws-sdk/client-sqs');
    const testCommand = new GetQueueAttributesCommand({
      QueueUrl: process.env.SQS_QUEUE_URL,
      AttributeNames: ['ApproximateNumberOfMessages']
    });
    await sqsClient.send(testCommand);
    health.checks.sqs.status = 'healthy';
    health.checks.sqs.message = 'SQS queue accessible';
  } catch (error) {
    health.checks.sqs.status = 'unhealthy';
    health.checks.sqs.message = `SQS error: ${error.message}`;
    allHealthy = false;
  }

  // Set overall status
  if (!allHealthy) {
    health.status = 'degraded';
  }

  // Return 503 if any dependency is unhealthy, 200 otherwise
  const statusCode = allHealthy ? 200 : 503;
  res.status(statusCode).json(health);
});

// API Documentation with Swagger UI
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec, {
  customCss: '.swagger-ui .topbar { display: none }',
  customSiteTitle: 'Echobase API Documentation',
}));

// Redirect /docs to /api-docs for convenience
app.get('/docs', (req, res) => {
  res.redirect('/api-docs');
});

// API Version 1 Routes
// Auth routes (registration and login - no authentication required)
app.use('/api/v1/auth', authRoutes);

// Legacy routes for backward compatibility (redirect to v1)
app.use('/api/auth', (req, res, next) => {
  log('WARNING: Legacy API route accessed, redirecting to /api/v1/auth');
  req.url = '/api/v1/auth' + req.url.substring(9);
  next();
}, authRoutes);

// Input validation and sanitization middleware
const orderValidation = [
  body('productName')
    .trim()
    .isLength({ min: PRODUCT_NAME_MIN_LENGTH, max: PRODUCT_NAME_MAX_LENGTH })
    .withMessage(`Product name must be between ${PRODUCT_NAME_MIN_LENGTH} and ${PRODUCT_NAME_MAX_LENGTH} characters`)
    .matches(PRODUCT_NAME_PATTERN)
    .withMessage('Product name contains invalid characters')
    .escape(),

  body('quantity')
    .isInt({ min: 1, max: ORDER_MAX_QUANTITY })
    .withMessage(`Quantity must be an integer between 1 and ${ORDER_MAX_QUANTITY.toLocaleString()}`)
    .toInt(),

  body('totalPrice')
    .isFloat({ min: ORDER_MIN_PRICE, max: ORDER_MAX_PRICE })
    .withMessage(`Total price must be between ${ORDER_MIN_PRICE} and ${ORDER_MAX_PRICE.toLocaleString()}`)
    .toFloat(),
];

/**
 * @swagger
 * /api/v1/orders:
 *   post:
 *     summary: Submit a new order
 *     description: Submit an order to the processing queue (requires authentication)
 *     tags: [Orders]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/Order'
 *     responses:
 *       201:
 *         description: Order submitted successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: Order submitted successfully
 *                 messageId:
 *                   type: string
 *                   description: SQS message ID
 *                 order:
 *                   $ref: '#/components/schemas/Order'
 *       400:
 *         description: Validation error or business rule violation
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       401:
 *         description: Authentication required or invalid token
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       500:
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
// Order submission endpoint with authentication and validation (v1)
app.post('/api/v1/orders', authenticateJWT, orderValidation, async (req, res) => {
  try {
    // DEBUG: Log incoming request with full details
    console.log('[DEBUG] POST /api/v1/orders - Content-Type:', req.get('content-type'));
    console.log('[DEBUG] POST /api/v1/orders - Request body:', JSON.stringify(req.body));
    console.log('[DEBUG] POST /api/v1/orders - Body keys:', Object.keys(req.body));
    console.log('[DEBUG] POST /api/v1/orders - Body values:', Object.values(req.body));
    console.log('[DEBUG] User from JWT:', req.user);

    // Check for validation errors
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      console.log('[DEBUG] Validation errors:', JSON.stringify(errors.array()));
      return res.status(400).json({
        error: 'Validation failed',
        details: errors.array(),
      });
    }

    const { productName, quantity, totalPrice } = req.body;

    // Validate userId from JWT token
    if (!req.user || !req.user.userId) {
      return res.status(401).json({
        error: 'Authentication failed',
        message: 'User ID not found in token',
      });
    }

    // Use order service to handle business logic
    const result = await orderService.submitOrder(
      req.user.userId,
      { productName, quantity, totalPrice },
      { fullName: req.user.fullName, username: req.user.username }
    );

    // Check if business validation failed
    if (!result.success) {
      return res.status(400).json({
        error: result.error,
        message: result.message,
      });
    }

    // Return success response
    res.status(201).json({
      success: true,
      message: 'Order submitted successfully',
      messageId: result.messageId,
      order: result.order,
    });
  } catch (error) {
    logError('Error submitting order:', error);

    // Security: Don't expose internal error details to client
    res.status(500).json({
      error: 'Failed to submit order',
      message: 'An error occurred while processing your order. Please try again later.',
    });
  }
});

/**
 * @swagger
 * /api/v1/orders:
 *   get:
 *     summary: Get order information
 *     description: Returns information about order processing (informational endpoint)
 *     tags: [Orders]
 *     responses:
 *       200:
 *         description: Information about order processing
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                 info:
 *                   type: string
 */
// Get orders endpoint (for testing) - v1
app.get('/api/v1/orders', (req, res) => {
  res.json({
    message: 'Orders are processed asynchronously. Check the database for order history.',
    info: 'This endpoint is for informational purposes only.',
  });
});

// Legacy route for backward compatibility
app.post('/api/orders', (req, res) => {
  log('WARNING: Legacy API route accessed, please update to /api/v1/orders');
  req.url = '/api/v1/orders';
  app._router.handle(req, res);
});

app.get('/api/orders', (req, res) => {
  log('WARNING: Legacy API route accessed, please update to /api/v1/orders');
  req.url = '/api/v1/orders';
  app._router.handle(req, res);
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    error: 'Not Found',
    message: 'The requested resource does not exist',
  });
});

// Error handler
app.use((err, req, res, next) => {
  logError('Unhandled error:', err);
  res.status(500).json({
    error: 'Internal Server Error',
    message: 'An unexpected error occurred',
  });
});

// SSL/TLS Configuration for HTTPS (MITM Protection)
let server;
const sslKeyPath = path.join(__dirname, 'ssl', 'api-gateway.key');
const sslCertPath = path.join(__dirname, 'ssl', 'api-gateway.crt');
const isProduction = process.env.NODE_ENV === 'production';

// Check if SSL certificates exist
if (fs.existsSync(sslKeyPath) && fs.existsSync(sslCertPath)) {
  const httpsOptions = {
    key: fs.readFileSync(sslKeyPath),
    cert: fs.readFileSync(sslCertPath),
  };

  server = https.createServer(httpsOptions, app);
  log('HTTPS/TLS enabled - MITM protection active');
} else {
  // In production, SSL certificates are required
  if (isProduction) {
    logError('FATAL: SSL certificates not found in production mode');
    logError(`Expected certificate files:`);
    logError(`  - Key: ${sslKeyPath}`);
    logError(`  - Cert: ${sslCertPath}`);
    logError('Production deployment requires HTTPS. Exiting...');
    process.exit(1);
  }

  // Fallback to HTTP only in development
  log('WARNING: SSL certificates not found - running in HTTP mode (DEVELOPMENT ONLY)');
  log('For production, ensure SSL certificates are present');
  server = app;
}

// Start server after initializing database
initDatabase(awsConfig)
  .then((pool) => {
    dbPool = pool;
    if (server === app) {
      // HTTP fallback
      app.listen(PORT, () => {
        log(`API Gateway running on HTTP port ${PORT} (INSECURE - development only)`);
        log(`SQS Endpoint: ${process.env.SQS_ENDPOINT}`);
        log(`Queue URL: ${process.env.SQS_QUEUE_URL}`);
        log(`CORS Origin: ${corsOptions.origin}`);
        log(`Rate Limit: ${process.env.RATE_LIMIT_MAX_REQUESTS} requests per ${parseInt(process.env.RATE_LIMIT_WINDOW_MS) / 60000} minutes`);
      });
    } else {
      // HTTPS
      server.listen(PORT, () => {
        log(`API Gateway running on HTTPS port ${PORT} (Secure - MITM Protected)`);
        log(`SQS Endpoint: ${process.env.SQS_ENDPOINT}`);
        log(`Queue URL: ${process.env.SQS_QUEUE_URL}`);
        log(`CORS Origin: ${corsOptions.origin}`);
        log(`Rate Limit: ${process.env.RATE_LIMIT_MAX_REQUESTS} requests per ${parseInt(process.env.RATE_LIMIT_WINDOW_MS) / 60000} minutes`);
      });
    }
  })
  .catch((error) => {
    logError('Failed to start API Gateway:', error);
    process.exit(1);
  });