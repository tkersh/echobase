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
const { getNodeAutoInstrumentations } = require('@opentelemetry/auto-instrumentations-node');
const { resourceFromAttributes } = require('@opentelemetry/resources');
const { ATTR_SERVICE_NAME, ATTR_SERVICE_VERSION } = require('@opentelemetry/semantic-conventions');
const { PeriodicExportingMetricReader } = require('@opentelemetry/sdk-metrics');
const { BatchLogRecordProcessor, LoggerProvider } = require('@opentelemetry/sdk-logs');

const collectorEndpoint = process.env.OTEL_COLLECTOR_ENDPOINT; // e.g. http://otel-collector:4318
const serviceName = process.env.OTEL_SERVICE_NAME || 'unknown-service';

const resource = resourceFromAttributes({
  [ATTR_SERVICE_NAME]: serviceName,
  [ATTR_SERVICE_VERSION]: process.env.npm_package_version || '1.0.0',
});

// Trace exporter
const traceExporter = new OTLPTraceExporter({
  url: collectorEndpoint ? `${collectorEndpoint}/v1/traces` : undefined,
});

// Metric exporter + reader
const metricExporter = new OTLPMetricExporter({
  url: collectorEndpoint ? `${collectorEndpoint}/v1/metrics` : undefined,
});
const metricReader = new PeriodicExportingMetricReader({
  exporter: metricExporter,
  exportIntervalMillis: 15000,
});

// Log exporter + provider (attached to global so logger.js can use it)
const logExporter = new OTLPLogExporter({
  url: collectorEndpoint ? `${collectorEndpoint}/v1/logs` : undefined,
});
const loggerProvider = new LoggerProvider({
  resource,
  processors: [new BatchLogRecordProcessor(logExporter)],
});

// Expose loggerProvider globally so shared/logger.js can emit OTEL log records
global.__otelLoggerProvider = loggerProvider;

const sdk = new NodeSDK({
  resource,
  traceExporter,
  metricReader,
  instrumentations: [
    getNodeAutoInstrumentations({
      // Disable noisy/unnecessary instrumentations that add overhead
      '@opentelemetry/instrumentation-fs': { enabled: false },
      '@opentelemetry/instrumentation-dns': { enabled: false },
      '@opentelemetry/instrumentation-net': { enabled: false },
      '@opentelemetry/instrumentation-tls': { enabled: false },
      '@opentelemetry/instrumentation-generic-pool': { enabled: false },
      '@opentelemetry/instrumentation-undici': { enabled: false },
      // Keep enabled: express, mysql2, aws-sdk, http/https (the useful ones)
    }),
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
