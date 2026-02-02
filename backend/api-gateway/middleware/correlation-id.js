const crypto = require('crypto');

/**
 * Correlation ID middleware.
 * Generates a unique ID per request and attaches it to req, res header, and log context.
 * If the incoming request already has an X-Correlation-ID header, it is reused.
 */
function correlationId(req, res, next) {
  const id = req.get('x-correlation-id') || crypto.randomUUID();
  req.correlationId = id;
  res.setHeader('X-Correlation-ID', id);
  next();
}

module.exports = correlationId;
