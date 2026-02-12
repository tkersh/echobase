require('../shared/tracing');
require('dotenv').config();
const { SQSClient, ReceiveMessageCommand, DeleteMessageCommand } = require('@aws-sdk/client-sqs');
const { log, logError } = require('../shared/logger');
const { getAwsConfig } = require('../shared/aws-config');
const { initDatabase } = require('../shared/database');
const { validateRequiredEnv, ORDER_PROCESSOR_REQUIRED_VARS } = require('../shared/env-validator');
const { ORDER_MAX_QUANTITY, ORDER_MIN_PRICE, ORDER_MAX_PRICE } = require('../shared/constants');
const { logBuildMetadata } = require('../shared/build-metadata');

// OTEL tracing + metrics (optional — no-op if OTEL SDK not available)
let otelTrace, otelContext, otelPropagation, SpanKind, SpanStatusCode;
let suppressTracing;
let messagesReceived, messagesProcessed, messagesFailed, circuitBreakerGauge;
try {
  const api = require('@opentelemetry/api');
  otelTrace = api.trace;
  otelContext = api.context;
  otelPropagation = api.propagation;
  SpanKind = api.SpanKind;
  SpanStatusCode = api.SpanStatusCode;
  suppressTracing = require('@opentelemetry/core').suppressTracing;
  const { metrics } = api;
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
let shutdownRequested = false;

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
let lastSuccessfulPoll = null;
let totalMessagesProcessed = 0;

function touchHealthcheck() {
  lastSuccessfulPoll = new Date().toISOString();
  try {
    require('fs').writeFileSync(HEALTHCHECK_FILE, lastSuccessfulPoll);
  } catch (err) {
    logError('Failed to write healthcheck file:', err);
  }
}

// HTTP health endpoint for remote monitoring and Kubernetes-style liveness probes
const HEALTH_PORT = parseInt(process.env.HEALTH_PORT) || 3003;
const http = require('http');
const healthServer = http.createServer((req, res) => {
  if (req.url === '/health' && req.method === 'GET') {
    const staleMs = HEALTHCHECK_STALE_SECONDS * 1000;
    const lastPollAge = lastSuccessfulPoll ? Date.now() - new Date(lastSuccessfulPoll).getTime() : Infinity;
    const healthy = lastPollAge < staleMs && !circuitOpen;
    const status = healthy ? 'healthy' : 'degraded';
    const code = healthy ? 200 : 503;
    res.writeHead(code, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      status,
      circuitBreaker: circuitOpen ? 'open' : 'closed',
      consecutiveFailures,
      lastSuccessfulPoll: lastSuccessfulPoll || 'never',
      totalMessagesProcessed,
    }));
  } else {
    res.writeHead(404);
    res.end();
  }
});
healthServer.listen(HEALTH_PORT, () => {
  log(`Order Processor health endpoint listening on port ${HEALTH_PORT}`);
});

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

    // Validate field values
    const qty = Number(order.quantity);
    const price = Number(order.totalPrice);
    const uid = Number(order.userId);

    if (!Number.isInteger(uid) || uid <= 0) {
      throw new Error(`Invalid userId: ${order.userId}`);
    }
    if (!Number.isInteger(qty) || qty <= 0 || qty > ORDER_MAX_QUANTITY) {
      throw new Error(`Invalid quantity: ${order.quantity} (must be 1-${ORDER_MAX_QUANTITY})`);
    }
    if (!Number.isFinite(price) || price < ORDER_MIN_PRICE || price > ORDER_MAX_PRICE) {
      throw new Error(`Invalid totalPrice: ${order.totalPrice} (must be ${ORDER_MIN_PRICE}-${ORDER_MAX_PRICE})`);
    }

    // All orders must have a user_id from JWT authentication
    // FK constraint on user_id enforces user existence at the DB level
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

    log(`Order inserted with ID: ${result.insertId} (user_id: ${order.userId})`);
    return result.insertId;
  } catch (error) {
    logError('Error inserting order:', error);
    throw error;
  }
}

async function processMessage(message) {
  // Extract W3C trace context from SQS message attributes for linked tracing
  let parentContext = null;
  if (otelPropagation && otelContext) {
    const carrier = {};
    const tp = message.MessageAttributes?.Traceparent?.StringValue;
    const ts = message.MessageAttributes?.Tracestate?.StringValue;
    if (tp) carrier.traceparent = tp;
    if (ts) carrier.tracestate = ts;
    if (tp) parentContext = otelPropagation.extract(otelContext.active(), carrier);
  }

  const runInContext = async (ctx) => {
    const tracer = otelTrace ? otelTrace.getTracer('order-processor') : null;
    const span = tracer?.startSpan('processOrder', {
      kind: SpanKind?.CONSUMER,
    }, ctx || undefined);

    try {
      const order = JSON.parse(message.Body);
      const correlationId = message.MessageAttributes?.CorrelationId?.StringValue
        || order.correlationId || 'none';
      log(`[${correlationId}] Processing order:`, order);
      if (span) {
        span.setAttribute('correlation.id', correlationId);
        span.setAttribute('order.userId', String(order.userId));
      }

      const orderId = await insertOrder(order);
      log(`[${correlationId}] Successfully processed order ${orderId}`);
      if (span) span.setAttribute('order.id', orderId);

      // Delete message from queue after successful processing
      await sqsClient.send(
        new DeleteMessageCommand({
          QueueUrl: process.env.SQS_QUEUE_URL,
          ReceiptHandle: message.ReceiptHandle,
        })
      );

      log('Message deleted from queue');
      totalMessagesProcessed++;
      if (messagesProcessed) messagesProcessed.add(1);
    } catch (error) {
      logError('Error processing message:', error);
      if (span && SpanStatusCode) {
        span.recordException(error);
        span.setStatus({ code: SpanStatusCode.ERROR, message: error.message });
      }
      if (messagesFailed) messagesFailed.add(1);
      // Message will remain in queue and be retried
    } finally {
      if (span) span.end();
    }
  };

  if (parentContext && otelContext) {
    await otelContext.with(parentContext, () => runInContext(parentContext));
  } else {
    await runInContext(null);
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
      WaitTimeSeconds: 20,
      MessageAttributeNames: ['All'],
    });

    // Suppress auto-instrumented SQS span for the poll itself — empty polls
    // generate noise. Actual message processing is traced via processOrder spans.
    let response;
    if (suppressTracing && otelContext) {
      response = await otelContext.with(
        suppressTracing(otelContext.active()),
        () => sqsClient.send(command)
      );
    } else {
      response = await sqsClient.send(command);
    }

    if (response.Messages && response.Messages.length > 0) {
      log(`Received ${response.Messages.length} message(s)`);
      if (messagesReceived) messagesReceived.add(response.Messages.length);

      // Process messages with bounded concurrency matching the DB connection pool size
      const concurrency = parseInt(process.env.DB_CONNECTION_LIMIT) || 2;
      for (let i = 0; i < response.Messages.length; i += concurrency) {
        const batch = response.Messages.slice(i, i + concurrency);
        await Promise.all(batch.map(msg => processMessage(msg)));
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

  // Continuous long-poll loop: SQS WaitTimeSeconds=20 blocks until a message
  // arrives (or 20s elapses), so no setInterval delay is needed. This is the
  // AWS-recommended consumer pattern — effectively subscribe/deliver.
  log('Starting continuous SQS long-poll loop (WaitTimeSeconds=20)');

  shutdownRequested = false;
  while (!shutdownRequested) {
    await pollQueue();
  }
}

// Handle graceful shutdown
const shutdownHandler = async (signal) => {
  log(`\nReceived ${signal}, shutting down gracefully...`);

  // Signal the poll loop to stop after the current iteration
  shutdownRequested = true;
  log('Stopped polling for new messages');

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