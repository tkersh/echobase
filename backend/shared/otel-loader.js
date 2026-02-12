/**
 * OTEL Optional Loader
 * Centralizes the try/catch pattern for optionally loading OTEL APIs.
 * Returns no-op stubs when OTEL is not available, avoiding repeated try/catch blocks.
 */

let trace = null;
let metrics = null;
let context = null;
let propagation = null;
let SpanKind = {};
let SpanStatusCode = {};
let available = false;

try {
  const api = require('@opentelemetry/api');
  trace = api.trace;
  metrics = api.metrics;
  context = api.context;
  propagation = api.propagation;
  SpanKind = api.SpanKind;
  SpanStatusCode = api.SpanStatusCode;
  available = true;
} catch (_) {
  // OTEL not available — all exports remain null/empty
}

/**
 * Get a meter instance (returns null if OTEL not available)
 * @param {string} name - Meter name
 * @returns {object|null}
 */
function getMeter(name) {
  return metrics ? metrics.getMeter(name) : null;
}

/**
 * Get a tracer instance (returns null if OTEL not available)
 * @param {string} name - Tracer name
 * @returns {object|null}
 */
function getTracer(name) {
  return trace ? trace.getTracer(name) : null;
}

/**
 * Record an exception on the active span (no-op if OTEL not available)
 * @param {Error} error
 */
function recordActiveSpanError(error) {
  if (!trace) return;
  const span = trace.getActiveSpan();
  if (span) {
    span.recordException(error);
    span.setStatus({ code: SpanStatusCode.ERROR, message: error.message });
  }
}

module.exports = {
  trace,
  metrics,
  context,
  propagation,
  SpanKind,
  SpanStatusCode,
  available,
  getMeter,
  getTracer,
  recordActiveSpanError,
};
