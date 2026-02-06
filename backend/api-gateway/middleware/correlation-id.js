const crypto = require('crypto');
const { trace } = require('@opentelemetry/api');

/**
 * Correlation ID middleware.
 * Generates a unique ID per request and attaches it to req, res header, and log context.
 * If the incoming request already has an X-Correlation-ID header, it is reused.
 * Falls back to OTEL trace ID if available.
 */
function correlationId(req, res, next) {
  let id = req.get('x-correlation-id');

  if (!id) {
    // Use OTEL trace ID as fallback if an active span exists
    const span = trace.getActiveSpan();
    const traceId = span?.spanContext()?.traceId;
    id = (traceId && traceId !== '00000000000000000000000000000000') ? traceId : crypto.randomUUID();
  }

  req.correlationId = id;
  res.setHeader('X-Correlation-ID', id);
  next();
}

module.exports = correlationId;
