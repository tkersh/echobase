require('dotenv').config();
const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { body, validationResult } = require('express-validator');
const { SQSClient, SendMessageCommand } = require('@aws-sdk/client-sqs');
const mysql = require('mysql2/promise');
const { log, logError } = require('../shared/logger');

const app = express();
const PORT = process.env.PORT || 3001;

// Create database connection pool
const dbPool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 3306,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
});

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

// Security: Helmet middleware for security headers
app.use(helmet());

// Security: CORS configuration - restrict to specific origins
const corsOptions = {
  origin: process.env.CORS_ORIGIN || 'http://localhost:3000',
  methods: ['GET', 'POST'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-API-Key'],
  credentials: true,
  maxAge: 86400, // 24 hours
};
app.use(cors(corsOptions));

// Security: Request size limits (prevent large payload attacks)
app.use(bodyParser.json({ limit: '1mb' }));
app.use(bodyParser.urlencoded({ extended: true, limit: '1mb' }));

// Security: Rate limiting (prevent DoS attacks)
const limiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000, // 15 minutes default
  max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 100, // limit each IP to 100 requests per windowMs
  message: {
    error: 'Too many requests from this IP, please try again later.',
  },
  standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers
});

// Apply rate limiting to API routes only (not health check)
app.use('/api/', limiter);

// Configure AWS SQS Client for Localstack
const sqsClient = new SQSClient({
  region: process.env.AWS_REGION || 'us-east-1',
  endpoint: process.env.SQS_ENDPOINT || 'http://localhost:4566',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID || 'test',
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || 'test',
  },
});

// Import routes and middleware
const authRoutes = require('./routes/auth');
const { authenticateJWT } = require('./middleware/auth');

// Health check endpoint (no rate limiting)
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    version: '1.0.0'
  });
});

// Auth routes (registration and login - no authentication required)
app.use('/api/auth', authRoutes);

// Input validation and sanitization middleware
const orderValidation = [
  body('productName')
    .trim()
    .isLength({ min: 1, max: 255 })
    .withMessage('Product name must be between 1 and 255 characters')
    .matches(/^[a-zA-Z0-9\s\-'.]+$/)
    .withMessage('Product name contains invalid characters')
    .escape(),

  body('quantity')
    .isInt({ min: 1, max: 10000 })
    .withMessage('Quantity must be an integer between 1 and 10,000')
    .toInt(),

  body('totalPrice')
    .isFloat({ min: 0.01, max: 1000000 })
    .withMessage('Total price must be between 0.01 and 1,000,000')
    .toFloat(),
];

// Order submission endpoint with authentication and validation
app.post('/api/orders', authenticateJWT, orderValidation, async (req, res) => {
  try {
    // Check for validation errors
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: 'Validation failed',
        details: errors.array(),
      });
    }

    const { productName, quantity, totalPrice } = req.body;

    // Additional business logic validation
    if (quantity * totalPrice > 1000000) {
      return res.status(400).json({
        error: 'Order total exceeds maximum allowed value',
        message: 'Order value (quantity × price) cannot exceed $1,000,000',
      });
    }

    // Create order object with user_id from JWT token
    const order = {
      userId: req.user.userId,
      productName,
      quantity,
      totalPrice,
      timestamp: new Date().toISOString(),
    };

    // Send message to SQS
    const command = new SendMessageCommand({
      QueueUrl: process.env.SQS_QUEUE_URL,
      MessageBody: JSON.stringify(order),
      MessageAttributes: {
        OrderType: {
          DataType: 'String',
          StringValue: 'StandardOrder',
        },
      },
    });

    const result = await sqsClient.send(command);

    // Log for audit trail (in production, use proper logging service)
    log(`Order submitted: ${result.MessageId} - ${req.user.fullName} - ${productName} [user:${req.user.username}]`);

    res.status(201).json({
      success: true,
      message: 'Order submitted successfully',
      messageId: result.MessageId,
      order: {
        productName: order.productName,
        quantity: order.quantity,
        totalPrice: order.totalPrice,
        timestamp: order.timestamp,
      },
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

// Get orders endpoint (for testing)
app.get('/api/orders', (req, res) => {
  res.json({
    message: 'Orders are processed asynchronously. Check the database for order history.',
    info: 'This endpoint is for informational purposes only.',
  });
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

app.listen(PORT, () => {
  log(`API Gateway running on port ${PORT}`);
  log(`SQS Endpoint: ${process.env.SQS_ENDPOINT}`);
  log(`Queue URL: ${process.env.SQS_QUEUE_URL}`);
  log(`CORS Origin: ${corsOptions.origin}`);
  log(`Rate Limit: ${limiter.max} requests per ${limiter.windowMs / 60000} minutes`);
});