require('../shared/tracing');
require('dotenv').config();
require('dotenv').config({ path: '.env.secrets' });
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
const csrfProtection = require('./middleware/csrf-middleware');
const correlationId = require('./middleware/correlation-id');
const swaggerUi = require('swagger-ui-express');
const swaggerSpec = require('./config/swagger');
const { SQSClient } = require('@aws-sdk/client-sqs');
const { log, logError, debug, info, warn, error } = require('../shared/logger');
const { getAwsConfig } = require('../shared/aws-config');
const { initDatabase } = require('../shared/database');
const { validateRequiredEnv, API_GATEWAY_REQUIRED_VARS } = require('../shared/env-validator');
const { logBuildMetadata } = require('../shared/build-metadata');
const {
  ORDER_MAX_QUANTITY,
} = require('../shared/constants');
const { parseAllowedOrigins } = require('../shared/cors-utils');
const OrderService = require('./services/orderService');
const { initMcpClient } = require('./services/mcpClient');

// Validate environment variables at startup
validateRequiredEnv(API_GATEWAY_REQUIRED_VARS, 'API Gateway');

const app = express();
const PORT = process.env.PORT;

// Trust proxy - required for rate limiting to work correctly behind nginx
// Set to 1 to trust only the first proxy (nginx), not beyond that
app.set('trust proxy', 1);

// Log build metadata on startup
logBuildMetadata();

// Log level is controlled by LOG_LEVEL environment variable (DEBUG, INFO, WARN, ERROR)
// Default is INFO - set LOG_LEVEL=DEBUG to enable debug logging
info('API Gateway starting with log level:', process.env.LOG_LEVEL || 'INFO');

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
  log('WARNING: Rate limiting disabled (not recommended for production)');
}

// Configure AWS SQS Client
const sqsClient = new SQSClient(awsConfig);

// Initialize Order Service
const orderService = new OrderService(sqsClient, process.env.SQS_QUEUE_URL);

/**
 * Verify SQS connectivity with retry logic
 * @param {number} maxRetries - Maximum number of retry attempts (default: 10)
 * @returns {Promise<void>}
 */
async function verifySQSConnectivity(maxRetries = 10) {
  const { GetQueueAttributesCommand } = require('@aws-sdk/client-sqs');
  const INITIAL_RETRY_DELAY = 1000; // 1 second
  const MAX_RETRY_DELAY = 5000; // 5 seconds

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      log(`Verifying SQS connectivity (attempt ${attempt}/${maxRetries})...`);
      const testCommand = new GetQueueAttributesCommand({
        QueueUrl: process.env.SQS_QUEUE_URL,
        AttributeNames: ['ApproximateNumberOfMessages']
      });
      await sqsClient.send(testCommand);
      log('SQS connectivity verified successfully');
      return;
    } catch (error) {
      const delay = Math.min(INITIAL_RETRY_DELAY * Math.pow(1.5, attempt - 1), MAX_RETRY_DELAY);
      logError(`SQS connectivity check failed (attempt ${attempt}/${maxRetries}): ${error.message}`);

      if (attempt < maxRetries) {
        log(`Retrying SQS connectivity check in ${Math.round(delay/1000)}s...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      } else {
        logError(`SQS connectivity verification failed after ${maxRetries} attempts`);
        throw error;
      }
    }
  }
}

// Import routes and middleware
const authRoutes = require('./routes/auth');
const productsRoutes = require('./routes/products');
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

// Products routes (requires authentication)
app.use('/api/v1/products', authenticateJWT, productsRoutes);

// Input validation and sanitization middleware
const orderValidation = [
  body('productId')
    .isInt({ min: 1 })
    .withMessage('Product ID must be a positive integer')
    .toInt(),

  body('quantity')
    .isInt({ min: 1, max: ORDER_MAX_QUANTITY })
    .withMessage(`Quantity must be an integer between 1 and ${ORDER_MAX_QUANTITY.toLocaleString()}`)
    .toInt(),
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
    // Debug logging for order submission (only when LOG_LEVEL=DEBUG)
    debug('POST /api/v1/orders - Content-Type:', req.get('content-type'));
    debug('POST /api/v1/orders - Request body:', JSON.stringify(req.body));
    debug('POST /api/v1/orders - Body keys:', Object.keys(req.body));
    debug('POST /api/v1/orders - Body values:', Object.values(req.body));
    debug('User from JWT:', req.user);

    // Check for validation errors
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      debug('Validation errors:', JSON.stringify(errors.array()));
      return res.status(400).json({
        error: 'Validation failed',
        details: errors.array(),
      });
    }

    const { productId, quantity } = req.body;

    // Validate userId from JWT token
    if (!req.user || !req.user.userId) {
      return res.status(401).json({
        error: 'Authentication failed',
        message: 'User ID not found in token',
      });
    }

    // Look up product by ID
    const [products] = await req.db.execute(
      'SELECT id, name, cost, sku FROM products WHERE id = ?',
      [productId]
    );

    if (products.length === 0) {
      return res.status(400).json({
        error: 'Invalid product',
        message: `Product with ID ${productId} not found`,
      });
    }

    const product = products[0];
    const totalPrice = parseFloat((product.cost * quantity).toFixed(2));

    // Use order service to handle business logic
    const result = await orderService.submitOrder(
      req.user.userId,
      { productId: product.id, productName: product.name, sku: product.sku, quantity, totalPrice },
      { fullName: req.user.fullName, username: req.user.username },
      req.correlationId
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
 *     summary: Get user's order history
 *     description: Returns all orders for the authenticated user, sorted by creation date (newest first)
 *     tags: [Orders]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: User's orders retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 orders:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: integer
 *                       productName:
 *                         type: string
 *                       sku:
 *                         type: string
 *                       quantity:
 *                         type: integer
 *                       totalPrice:
 *                         type: number
 *                       status:
 *                         type: string
 *                       createdAt:
 *                         type: string
 *                         format: date-time
 *                 count:
 *                   type: integer
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
// Get user's orders endpoint - v1
app.get('/api/v1/orders', authenticateJWT, async (req, res) => {
  try {
    // Validate userId from JWT token
    if (!req.user || !req.user.userId) {
      return res.status(401).json({
        error: 'Authentication failed',
        message: 'User ID not found in token',
      });
    }

    const [orders] = await req.db.execute(
      `SELECT id, product_name as productName, sku, quantity,
              total_price as totalPrice, order_status as status, created_at as createdAt
       FROM orders WHERE user_id = ? ORDER BY created_at DESC`,
      [req.user.userId]
    );

    res.json({
      success: true,
      orders,
      count: orders.length,
    });
  } catch (error) {
    logError('Error fetching orders:', error);

    res.status(500).json({
      error: 'Failed to fetch orders',
      message: 'An error occurred while retrieving your orders. Please try again later.',
    });
  }
});

// Legacy route for backward compatibility — use 307 to preserve method and body
app.all('/api/orders', (req, res) => {
  log('WARNING: Legacy API route accessed, please update to /api/v1/orders');
  res.redirect(307, '/api/v1/orders');
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

// Start server after initializing database and verifying SQS connectivity in parallel
log('Initializing dependencies (database and SQS) in parallel...');
Promise.all([
  initDatabase(awsConfig),
  verifySQSConnectivity(),
  initMcpClient()
])
  .then(([pool]) => {
    dbPool = pool;
    log('All dependencies initialized successfully');

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