require('../shared/tracing');
require('dotenv').config();
require('dotenv').config({ path: '.env.secrets' });
const express = require('express');
const https = require('https');
const path = require('path');
const { setupMiddleware } = require('./config/express');
const { SQSClient } = require('@aws-sdk/client-sqs');
const { trace: otelTrace, SpanStatusCode } = (() => {
  try { return require('@opentelemetry/api'); }
  catch (_) { return {}; }
})();
const { log, logError, info, warn, debug } = require('../shared/logger');
const { getAwsConfig } = require('../shared/aws-config');
const { initDatabase } = require('../shared/database');
const { validateRequiredEnv, API_GATEWAY_REQUIRED_VARS } = require('../shared/env-validator');
const { logBuildMetadata } = require('../shared/build-metadata');
const OrderService = require('./services/orderService');
const HealthService = require('./services/healthService');
const ProductService = require('./services/productService');
const { initMcpClient } = require('./services/mcpClient');

// Import routes
const authRoutes = require('./routes/auth');
const productsRoutes = require('./routes/products');
const orderRoutes = require('./routes/orders');
const healthRoutes = require('./routes/health');
const { authenticateJWT } = require('./middleware/auth');

// Validate environment variables at startup
validateRequiredEnv(API_GATEWAY_REQUIRED_VARS, 'API Gateway');

const app = express();
const PORT = process.env.PORT || 3000;

// Log build metadata on startup
logBuildMetadata();

info('API Gateway starting with log level:', process.env.LOG_LEVEL || 'INFO');

let dbPool;
const awsConfig = getAwsConfig();
const sqsClient = new SQSClient(awsConfig);

// Initialize Services
const orderService = new OrderService(sqsClient, process.env.SQS_QUEUE_URL);

/**
 * SSL/TLS Configuration for HTTPS
 */
async function initSSL() {
  log('Initializing SSL configuration...');
  if (process.env.AWS_REGION) {
    try {
      const { SecretsManagerClient, GetSecretValueCommand } = require('@aws-sdk/client-secrets-manager');
      const secretsClient = new SecretsManagerClient(getAwsConfig('secrets'));
      const command = new GetSecretValueCommand({ SecretId: 'echobase/api-gateway/ssl' });
      const response = await secretsClient.send(command);

      if (response.SecretString) {
        const { key, cert } = JSON.parse(response.SecretString);
        if (key && cert) {
          log('SSL certificates retrieved from Secrets Manager');
          return { key, cert };
        }
      }
    } catch (error) {
      if (error.name !== 'ResourceNotFoundException') {
        warn(`Failed to fetch SSL secrets: ${error.message}`);
      } else {
        debug('SSL secret not found in Secrets Manager.');
      }
    }
  }
  return null;
}

// Global server variable for shutdown
let server;

/**
 * Graceful shutdown
 */
const SHUTDOWN_TIMEOUT_MS = 10000;
function gracefulShutdown(signal) {
  log(`Received ${signal}, shutting down gracefully...`);

  if (server && typeof server.close === 'function') {
    server.close(() => {
      log('HTTP server closed');
    });
  }

  if (dbPool) {
    dbPool.end().catch((err) => logError('Error closing DB pool on shutdown:', err));
  }

  setTimeout(() => {
    logError('Shutdown timed out, forcing exit');
    process.exit(1);
  }, SHUTDOWN_TIMEOUT_MS).unref();
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Start initialization
log('Initializing dependencies (database, SQS, SSL) in parallel...');
Promise.all([
  initDatabase(awsConfig),
  initMcpClient(),
  initSSL()
])
  .then(async ([pool, _mcp, sslOptions]) => {
    dbPool = pool;
    log('Base dependencies initialized');

    const healthService = new HealthService(dbPool, sqsClient);
    const productService = new ProductService(dbPool);

    // Verify SQS connectivity
    await healthService.verifySQSConnectivity();

    // Attach services to request object for use in controllers
    app.use((req, res, next) => {
      req.services = {
        orderService,
        healthService,
        productService,
      };
      next();
    });

    // Setup middleware (Security, Performance, Parsing, etc.)
    setupMiddleware(app, { dbPool, sqsClient });

    // API Documentation (Swagger)
    const swaggerUi = require('swagger-ui-express');
    const swaggerSpec = require('./config/swagger');
    if (process.env.NODE_ENV !== 'production') {
      app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec, {
        customCss: '.swagger-ui .topbar { display: none }',
        customSiteTitle: 'Echobase API Documentation',
      }));
      app.get('/docs', (req, res) => res.redirect('/api-docs'));
    }

    // Health Check Route
    app.use('/health', healthRoutes);

    // API version 1 Routes
    app.use('/api/v1/auth', authRoutes);
    app.use('/api/v1/products', authenticateJWT, productsRoutes);
    app.use('/api/v1/orders', orderRoutes);

    // Legacy Route Redirects
    app.use('/api/auth', (req, res, next) => {
      warn('Legacy API route /api/auth accessed');
      next();
    }, authRoutes);

    app.all('/api/orders', (req, res) => {
      warn('Legacy API route /api/orders accessed');
      res.redirect(307, '/api/v1/orders');
    });

    // 404 handler
    app.use((req, res) => {
      res.status(404).json({
        error: 'Not Found',
        message: 'The requested resource does not exist',
      });
    });

    // Centralized Error Handler (Priority 3)
    app.use((err, req, res, next) => {
      logError('Unhandled error:', err);
      if (otelTrace) {
        const span = otelTrace.getActiveSpan();
        if (span) {
          span.recordException(err);
          span.setStatus({ code: SpanStatusCode.ERROR, message: err.message });
        }
      }

      const statusCode = err.status || 500;
      res.status(statusCode).json({
        error: statusCode === 400 ? 'Bad Request' : 'Internal Server Error',
        message: err.message || 'An unexpected error occurred',
      });
    });

    const isProduction = process.env.NODE_ENV === 'production';
    if (sslOptions) {
      server = https.createServer(sslOptions, app);
      server.listen(PORT, () => {
        log(`API Gateway (Secure) running on HTTPS port ${PORT}`);
      });
    } else {
      if (isProduction) {
        logError('FATAL: SSL required in production but certificates not found.');
        process.exit(1);
      }
      log('WARNING: Running in HTTP mode (DEVELOPMENT ONLY)');
      server = app.listen(PORT, () => {
        log(`API Gateway (Insecure) running on HTTP port ${PORT}`);
      });
    }
  })
  .catch((error) => {
    logError('Failed to start API Gateway:', error);
    process.exit(1);
  });