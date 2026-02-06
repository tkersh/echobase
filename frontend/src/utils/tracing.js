/**
 * Frontend OTEL Tracing
 * Initializes WebTracerProvider with auto-instrumentation for fetch/XHR.
 * Traces are exported to the OTEL Collector via the nginx proxy at /v1/traces.
 */

import { WebTracerProvider } from '@opentelemetry/sdk-trace-web';
import { BatchSpanProcessor } from '@opentelemetry/sdk-trace-base';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { FetchInstrumentation } from '@opentelemetry/instrumentation-fetch';
import { XMLHttpRequestInstrumentation } from '@opentelemetry/instrumentation-xml-http-request';
import { ZoneContextManager } from '@opentelemetry/context-zone';
import { resourceFromAttributes } from '@opentelemetry/resources';
import { ATTR_SERVICE_NAME, ATTR_SERVICE_VERSION } from '@opentelemetry/semantic-conventions';
import { registerInstrumentations } from '@opentelemetry/instrumentation';

const collectorUrl = import.meta.env.VITE_OTEL_COLLECTOR_URL || '/v1/traces';

const resource = resourceFromAttributes({
  [ATTR_SERVICE_NAME]: 'frontend',
  [ATTR_SERVICE_VERSION]: '1.0.0',
});

const exporter = new OTLPTraceExporter({
  url: collectorUrl,
});

const provider = new WebTracerProvider({
  resource,
  spanProcessors: [new BatchSpanProcessor(exporter)],
});

provider.register({
  contextManager: new ZoneContextManager(),
});

registerInstrumentations({
  instrumentations: [
    new FetchInstrumentation({
      // Only trace same-origin API calls (avoid tracing CDN/third-party requests)
      ignoreUrls: [/\/v1\/traces/],
      propagateTraceHeaderCorsUrls: [/.*/],
    }),
    new XMLHttpRequestInstrumentation({
      ignoreUrls: [/\/v1\/traces/],
      propagateTraceHeaderCorsUrls: [/.*/],
    }),
  ],
});
