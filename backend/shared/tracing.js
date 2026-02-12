'use strict';

// OTEL tracing bootstrap — must be required before any other module.
// Kill switch: set OTEL_ENABLED=false to disable all instrumentation.
if (process.env.OTEL_ENABLED === 'false') {
  return;
}

const { NodeSDK } = require('@opentelemetry/sdk-node');
const { OTLPTraceExporter } = require('@opentelemetry/exporter-trace-otlp-http');
const { OTLPLogExporter } = require('@opentelemetry/exporter-logs-otlp-http');
const { OTLPMetricExporter } = require('@opentelemetry/exporter-metrics-otlp-http');
const { resourceFromAttributes } = require('@opentelemetry/resources');
const { ATTR_SERVICE_NAME, ATTR_SERVICE_VERSION } = require('@opentelemetry/semantic-conventions');
const { PeriodicExportingMetricReader } = require('@opentelemetry/sdk-metrics');
const { BatchLogRecordProcessor, LoggerProvider } = require('@opentelemetry/sdk-logs');
const { BatchSpanProcessor, TraceIdRatioBasedSampler } = require('@opentelemetry/sdk-trace-base');
const { HttpInstrumentation } = require('@opentelemetry/instrumentation-http');
const { ExpressInstrumentation } = require('@opentelemetry/instrumentation-express');
const { MySQL2Instrumentation } = require('@opentelemetry/instrumentation-mysql2');
const { AwsInstrumentation } = require('@opentelemetry/instrumentation-aws-sdk');

// Fail-fast timeout for all OTLP exporters.
// Default is 10s per attempt with 5 retries — a single failed export can block 30s+.
const EXPORTER_TIMEOUT_MS = 2000;

// Trace sampling ratio: 0.0 = none, 1.0 = all. Set via OTEL_TRACE_SAMPLE_RATIO env var.
const sampleRatio = parseFloat(process.env.OTEL_TRACE_SAMPLE_RATIO);

const collectorEndpoint = process.env.OTEL_COLLECTOR_ENDPOINT; // e.g. http://otel-collector:4318
const serviceName = process.env.OTEL_SERVICE_NAME || 'unknown-service';

const resource = resourceFromAttributes({
  [ATTR_SERVICE_NAME]: serviceName,
  [ATTR_SERVICE_VERSION]: process.env.npm_package_version || '1.0.0',
});

// Trace exporter
const traceExporter = new OTLPTraceExporter({
  url: collectorEndpoint ? `${collectorEndpoint}/v1/traces` : undefined,
  timeoutMillis: EXPORTER_TIMEOUT_MS,
});

// Metric exporter + reader
const metricExporter = new OTLPMetricExporter({
  url: collectorEndpoint ? `${collectorEndpoint}/v1/metrics` : undefined,
  timeoutMillis: EXPORTER_TIMEOUT_MS,
});
const metricReader = new PeriodicExportingMetricReader({
  exporter: metricExporter,
  exportIntervalMillis: 60000,
});

// Log exporter + provider (attached to global so logger.js can use it)
const logExporter = new OTLPLogExporter({
  url: collectorEndpoint ? `${collectorEndpoint}/v1/logs` : undefined,
  timeoutMillis: EXPORTER_TIMEOUT_MS,
});
const loggerProvider = new LoggerProvider({
  resource,
  processors: [new BatchLogRecordProcessor(logExporter, {
    exportTimeoutMillis: EXPORTER_TIMEOUT_MS,
  })],
});

// Expose loggerProvider globally so shared/logger.js can emit OTEL log records
global.__otelLoggerProvider = loggerProvider;

const sdk = new NodeSDK({
  resource,
  sampler: new TraceIdRatioBasedSampler(sampleRatio),
  // Use spanProcessors instead of traceExporter to control batch settings.
  // Defaults are 30s export timeout + 5s flush interval — too slow for unreachable collectors.
  spanProcessors: [new BatchSpanProcessor(traceExporter, {
    exportTimeoutMillis: 5000,
    scheduledDelayMillis: 5000,
  })],
  metricReader,
  // Only load instrumentations actually used by this project.
  // getNodeAutoInstrumentations() loads ~35 modules; we only need 4.
  instrumentations: [
    new HttpInstrumentation(),
    new ExpressInstrumentation(),
    new MySQL2Instrumentation(),
    new AwsInstrumentation(),
  ],
});

sdk.start();

// Graceful shutdown
const shutdown = () => {
  sdk.shutdown()
    .then(() => loggerProvider.shutdown())
    .catch((err) => console.error('OTEL shutdown error:', err));
};

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
