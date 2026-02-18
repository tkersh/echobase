require('../shared/tracing');
require('dotenv').config();
const { SQSClient } = require('@aws-sdk/client-sqs');
const { log, logError } = require('../shared/logger');
const { getAwsConfig } = require('../shared/aws-config');
const { initDatabase } = require('../shared/database');
const { validateRequiredEnv, ORDER_PROCESSOR_REQUIRED_VARS } = require('../shared/env-validator');
const {
  ORDER_MAX_QUANTITY, ORDER_MIN_PRICE, ORDER_MAX_PRICE,
  HEALTHCHECK_STALE_SECONDS,
} = require('../shared/constants');
const { logBuildMetadata } = require('../shared/build-metadata');
const SQSConsumer = require('../shared/sqs-consumer');

// OTEL tracing + metrics
let otelTrace, otelContext, otelPropagation, SpanKind, SpanStatusCode;
let suppressTracing;
let messagesProcessed, messagesFailed, circuitBreakerGauge, messagesReceived;
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
} catch (_) { /* OTEL not available */ }

validateRequiredEnv(ORDER_PROCESSOR_REQUIRED_VARS, 'Order Processor');
logBuildMetadata();

const awsConfig = getAwsConfig();
const sqsClient = new SQSClient(awsConfig);

let dbPool;
let consumer;
let lastSuccessfulPoll = null;
let totalMessagesProcessed = 0;

const HEALTHCHECK_FILE = '/tmp/last-successful-poll';
function touchHealthcheck() {
  lastSuccessfulPoll = new Date().toISOString();
  try {
    require('fs').writeFileSync(HEALTHCHECK_FILE, lastSuccessfulPoll);
  } catch (err) {
    logError('Failed to write healthcheck file:', err);
  }
}

// Health Server
const http = require('http');
const healthServer = http.createServer((req, res) => {
  if (req.url === '/health' && req.method === 'GET') {
    const staleMs = HEALTHCHECK_STALE_SECONDS * 1000;
    const lastPollAge = lastSuccessfulPoll ? Date.now() - new Date(lastSuccessfulPoll).getTime() : Infinity;
    const circuitOpen = consumer?.circuitOpen || false;
    const healthy = lastPollAge < staleMs && !circuitOpen;
    res.writeHead(healthy ? 200 : 503, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      status: healthy ? 'healthy' : 'degraded',
      circuitBreaker: circuitOpen ? 'open' : 'closed',
      lastSuccessfulPoll: lastSuccessfulPoll || 'never',
      totalMessagesProcessed,
    }));
  } else {
    res.writeHead(404);
    res.end();
  }
});
healthServer.listen(process.env.HEALTH_PORT, () => {
  log(`Order Processor health endpoint listening on port ${process.env.HEALTH_PORT}`);
});

if (circuitBreakerGauge) {
  circuitBreakerGauge.addCallback((result) => {
    result.observe(consumer?.circuitOpen ? 1 : 0);
  });
}

async function insertOrder(order) {
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
  return result.insertId;
}

async function processMessage(message) {
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
    const tracer = otelTrace?.getTracer('order-processor');
    const span = tracer?.startSpan('processOrder', { kind: SpanKind?.CONSUMER }, ctx || undefined);

    try {
      const order = JSON.parse(message.Body);
      const correlationId = message.MessageAttributes?.CorrelationId?.StringValue || order.correlationId || 'none';
      log(`[${correlationId}] Processing order:`, order);

      const orderId = await insertOrder(order);
      log(`[${correlationId}] Successfully processed order ${orderId}`);

      await consumer.deleteMessage(message.ReceiptHandle);

      totalMessagesProcessed++;
      if (messagesProcessed) messagesProcessed.add(1);
    } catch (error) {
      logError('Error processing message:', error);
      if (span && SpanStatusCode) {
        span.recordException(error);
        span.setStatus({ code: SpanStatusCode.ERROR, message: error.message });
      }
      if (messagesFailed) messagesFailed.add(1);
    } finally {
      span?.end();
    }
  };

  if (parentContext && otelContext) {
    await otelContext.with(parentContext, () => runInContext(parentContext));
  } else {
    await runInContext(null);
  }
}

async function startProcessor() {
  log('Starting Order Processor...');
  dbPool = await initDatabase(awsConfig);

  consumer = new SQSConsumer({
    sqsClient,
    queueUrl: process.env.SQS_QUEUE_URL,
    processMessage,
    concurrency: parseInt(process.env.DB_CONNECTION_LIMIT),
    suppressTracing,
    otelContext,
  });

  consumer.onPollSuccess = touchHealthcheck;
  consumer.messagesReceivedCounter = messagesReceived;

  await consumer.start();
}

const shutdownHandler = async (signal) => {
  log(`Received ${signal}, shutting down...`);
  consumer?.stop();
  if (dbPool) await dbPool.end();
  process.exit(0);
};

process.on('SIGINT', () => shutdownHandler('SIGINT'));
process.on('SIGTERM', () => shutdownHandler('SIGTERM'));

startProcessor().catch(err => {
  logError('Fatal error:', err);
  process.exit(1);
});