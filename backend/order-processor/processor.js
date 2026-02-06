require('../shared/tracing');
require('dotenv').config();
const { SQSClient, ReceiveMessageCommand, DeleteMessageCommand } = require('@aws-sdk/client-sqs');
const { log, logError } = require('../shared/logger');
const { getAwsConfig } = require('../shared/aws-config');
const { initDatabase } = require('../shared/database');
const { validateRequiredEnv, ORDER_PROCESSOR_REQUIRED_VARS } = require('../shared/env-validator');
const { logBuildMetadata } = require('../shared/build-metadata');

// OTEL metrics (optional — no-op if OTEL SDK not available)
let messagesReceived, messagesProcessed, messagesFailed, circuitBreakerGauge;
try {
  const { metrics } = require('@opentelemetry/api');
  const meter = metrics.getMeter('order-processor');
  messagesReceived = meter.createCounter('sqs.messages.received', { description: 'SQS messages received' });
  messagesProcessed = meter.createCounter('sqs.messages.processed', { description: 'SQS messages successfully processed' });
  messagesFailed = meter.createCounter('sqs.messages.failed', { description: 'SQS messages that failed processing' });
  circuitBreakerGauge = meter.createObservableGauge('circuit_breaker.state', { description: '0=closed, 1=open' });
} catch (_) {
  // OTEL not available — metrics disabled
}

// Validate environment variables at startup
validateRequiredEnv(ORDER_PROCESSOR_REQUIRED_VARS, 'Order Processor');

// Log build metadata on startup
logBuildMetadata();

// Configure AWS clients
const awsConfig = getAwsConfig();
const sqsClient = new SQSClient(awsConfig);

let dbPool;
let pollIntervalId;

// Circuit breaker state
const CIRCUIT_BREAKER_THRESHOLD = 5;
const CIRCUIT_BREAKER_BASE_DELAY_MS = 5000;
const CIRCUIT_BREAKER_MAX_DELAY_MS = 120000;
let consecutiveFailures = 0;
let circuitOpen = false;

// Register circuit breaker observable gauge callback
if (circuitBreakerGauge) {
  circuitBreakerGauge.addCallback((result) => {
    result.observe(circuitOpen ? 1 : 0);
  });
}

// Healthcheck state — written to file so Docker can check freshness
const HEALTHCHECK_FILE = '/tmp/last-successful-poll';
const HEALTHCHECK_STALE_SECONDS = 120;

function touchHealthcheck() {
  try {
    require('fs').writeFileSync(HEALTHCHECK_FILE, new Date().toISOString());
  } catch (err) {
    logError('Failed to write healthcheck file:', err);
  }
}

async function insertOrder(order) {
  try {
    // Validate required fields - all must be defined (not undefined)
    if (order.userId === undefined ||
        order.productName === undefined ||
        order.quantity === undefined ||
        order.totalPrice === undefined) {
      const missingFields = [];
      if (order.userId === undefined) missingFields.push('userId');
      if (order.productName === undefined) missingFields.push('productName');
      if (order.quantity === undefined) missingFields.push('quantity');
      if (order.totalPrice === undefined) missingFields.push('totalPrice');

      throw new Error(`Order missing required fields: ${missingFields.join(', ')}. Order data: ${JSON.stringify(order)}`);
    }

    // Verify user exists before inserting order (prevent foreign key constraint violation)
    const [users] = await dbPool.execute(
      'SELECT id, username FROM users WHERE id = ?',
      [order.userId]
    );

    if (users.length === 0) {
      throw new Error(`User with ID ${order.userId} does not exist. Cannot create order for non-existent user.`);
    }

    const user = users[0];
    log(`Verified user exists: ${user.username} (ID: ${user.id})`);

    // All orders must have a user_id from JWT authentication
    // productId and sku are nullable for backward compatibility with in-flight messages
    const query = `
      INSERT INTO orders (user_id, product_id, product_name, sku, quantity, total_price, order_status)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `;

    const [result] = await dbPool.execute(query, [
      order.userId,
      order.productId || null,
      order.productName,
      order.sku || null,
      order.quantity,
      order.totalPrice,
      'completed',
    ]);

    log(`Order inserted with ID: ${result.insertId} for user: ${user.username} (user_id: ${order.userId})`);
    return result.insertId;
  } catch (error) {
    logError('Error inserting order:', error);
    throw error;
  }
}

async function processMessage(message) {
  try {
    const order = JSON.parse(message.Body);
    const correlationId = message.MessageAttributes?.CorrelationId?.StringValue
      || order.correlationId || 'none';
    log(`[${correlationId}] Processing order:`, order);

    const orderId = await insertOrder(order);
    log(`[${correlationId}] Successfully processed order ${orderId}`);

    // Delete message from queue after successful processing
    await sqsClient.send(
      new DeleteMessageCommand({
        QueueUrl: process.env.SQS_QUEUE_URL,
        ReceiptHandle: message.ReceiptHandle,
      })
    );

    log('Message deleted from queue');
    if (messagesProcessed) messagesProcessed.add(1);
  } catch (error) {
    logError('Error processing message:', error);
    if (messagesFailed) messagesFailed.add(1);
    // Message will remain in queue and be retried
  }
}

async function pollQueue() {
  // Circuit breaker: if open, wait with exponential backoff before retrying
  if (circuitOpen) {
    const backoffDelay = Math.min(
      CIRCUIT_BREAKER_BASE_DELAY_MS * Math.pow(2, consecutiveFailures - CIRCUIT_BREAKER_THRESHOLD),
      CIRCUIT_BREAKER_MAX_DELAY_MS
    );
    log(`Circuit open (${consecutiveFailures} consecutive failures). Waiting ${Math.round(backoffDelay / 1000)}s before retry...`);
    await new Promise(resolve => setTimeout(resolve, backoffDelay));
  }

  try {
    const command = new ReceiveMessageCommand({
      QueueUrl: process.env.SQS_QUEUE_URL,
      MaxNumberOfMessages: parseInt(process.env.MAX_MESSAGES),
      WaitTimeSeconds: 10,
      MessageAttributeNames: ['All'],
    });

    const response = await sqsClient.send(command);

    if (response.Messages && response.Messages.length > 0) {
      log(`Received ${response.Messages.length} message(s)`);
      if (messagesReceived) messagesReceived.add(response.Messages.length);

      // Process messages sequentially to avoid database connection pool exhaustion
      // This ensures we don't exceed the connection pool limit
      for (const message of response.Messages) {
        await processMessage(message);
      }
    }

    // Successful poll — reset circuit breaker
    if (circuitOpen) {
      log('Circuit closed — polling resumed normally');
    }
    consecutiveFailures = 0;
    circuitOpen = false;
    touchHealthcheck();
  } catch (error) {
    consecutiveFailures++;
    logError(`Error polling queue (failure ${consecutiveFailures}):`, error);

    if (consecutiveFailures >= CIRCUIT_BREAKER_THRESHOLD && !circuitOpen) {
      circuitOpen = true;
      logError(`Circuit breaker opened after ${consecutiveFailures} consecutive failures`);
    }
  }
}

async function startProcessor() {
  log('Starting Order Processor...');
  log(`SQS Queue URL: ${process.env.SQS_QUEUE_URL}`);
  log(`Database: ${process.env.DB_HOST}:${process.env.DB_PORT}/${process.env.DB_NAME}`);

  dbPool = await initDatabase(awsConfig);

  // Poll the queue continuously
  const pollInterval = parseInt(process.env.POLL_INTERVAL);

  log(`Polling queue every ${pollInterval}ms`);

  // Initial poll
  await pollQueue();

  // Set up interval polling
  pollIntervalId = setInterval(pollQueue, pollInterval);
}

// Handle graceful shutdown
const shutdownHandler = async (signal) => {
  log(`\nReceived ${signal}, shutting down gracefully...`);

  // Clear polling interval
  if (pollIntervalId) {
    clearInterval(pollIntervalId);
    log('Stopped polling for new messages');
  }

  // Close database connection pool
  if (dbPool) {
    try {
      await dbPool.end();
      log('Database connection pool closed');
    } catch (error) {
      logError('Error closing database pool:', error);
    }
  }

  log('Shutdown complete');
  process.exit(0);
};

// Register shutdown handlers for multiple signals
process.on('SIGINT', () => shutdownHandler('SIGINT'));
process.on('SIGTERM', () => shutdownHandler('SIGTERM'));

// Start the processor
startProcessor().catch((error) => {
  logError('Failed to start processor:', error);
  process.exit(1);
});