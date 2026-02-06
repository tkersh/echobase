# OpenTelemetry Migration Plan — IMPLEMENTED

All phases have been implemented. This document records what was planned and what was delivered.

---

## Current State (Post-Migration)

| Aspect | Status | Details |
|--------|--------|---------|
| **Backend Logging** | OTEL Log Bridge | Dual output: console + OTEL Collector. Same API surface (`debug`, `info`, `warn`, `error`, `fatal`, `logWithContext`). JSON mode via `LOG_FORMAT=json`. |
| **Frontend Logging** | OTEL Span Events | Logger emits span events via active OTEL span alongside console output. Same API surface (`debug`, `info`, `warn`, `error`). |
| **MCP Server Logging** | Structured Logger | TypeScript logger (`logger.ts`) mirroring backend API. Supports log levels, colors, JSON format. No OTEL SDK yet (stubbed service). |
| **Distributed Tracing** | OTEL Auto-Instrumentation | Express, mysql2, AWS SDK, HTTP auto-instrumented. Correlation IDs fall back to OTEL trace IDs. Frontend fetch/XHR auto-instrumented. |
| **Metrics** | OTEL Metrics SDK | SQS counters, circuit breaker gauge, DB pool observable gauges. HTTP metrics auto-collected by Express instrumentation. |
| **Log Aggregation** | OTEL Collector → debug exporter | Logs sent to collector via OTLP, exported to stdout (debug exporter). |
| **Observability Infrastructure** | Collector + Jaeger + Prometheus | All in durable layer. Persists across deployments. |

---

## Implementation Summary

### Phase 1: Durable Infrastructure (Collector + Jaeger + Prometheus) — DONE

| Step | File | Action |
|------|------|--------|
| 1.1 | `otel/collector-config.yaml` | Created. OTLP receivers (gRPC 4317, HTTP 4318), batch processor, exporters for Jaeger (OTLP), Prometheus (remote write), logs (debug). CORS configured for browser SDK. Health check on 13133. |
| 1.2 | `otel/prometheus.yml` | Created. Self-scrape + otel-collector internal metrics on port 8888. |
| 1.3 | `durable/docker-compose.yml` | Added otel-collector, jaeger (Badger storage), prometheus (remote write receiver). Added `jaeger-badger-data` and `prometheus-data` volumes. |
| 1.4 | `durable/.env.devlocal` | Added `DURABLE_OTEL_GRPC_PORT=4317`, `DURABLE_OTEL_HTTP_PORT=4318`, `DURABLE_JAEGER_UI_PORT=16686`, `DURABLE_PROMETHEUS_PORT=9090` |
| 1.5 | `durable/.env.ci` | Added `DURABLE_OTEL_GRPC_PORT=4417`, `DURABLE_OTEL_HTTP_PORT=4418`, `DURABLE_JAEGER_UI_PORT=16786`, `DURABLE_PROMETHEUS_PORT=9190` |
| 1.6 | `.env` | Added `OTEL_COLLECTOR_ENDPOINT=http://echobase-devlocal-durable-otel-collector:4318` |
| 1.7 | `durable/setup.sh` | Added OTEL Collector, Jaeger, Prometheus info to `print_infrastructure_details()`. Added OTEL stack refresh in "already running" path. |
| 1.8 | `durable/teardown.sh` | Added `otel-collector`, `jaeger`, `prometheus` to container teardown. Added `jaeger-badger-data`, `prometheus-data` to volume removal. |
| 1.9 | `docs/project_notes/key_facts.md` | Added OTEL ports to Dev-Local and CI Durable port tables. |

### Phase 2: Backend Tracing — DONE

| Step | File | Action |
|------|------|--------|
| 2.1 | `backend/api-gateway/package.json`, `backend/order-processor/package.json` | npm installed: `@opentelemetry/api`, `@opentelemetry/sdk-node`, `@opentelemetry/exporter-trace-otlp-http`, `@opentelemetry/exporter-logs-otlp-http`, `@opentelemetry/exporter-metrics-otlp-http`, `@opentelemetry/auto-instrumentations-node`, `@opentelemetry/resources`, `@opentelemetry/semantic-conventions`, `@opentelemetry/api-logs` |
| 2.2 | `backend/shared/tracing.js` | Created. NodeSDK bootstrap with `OTEL_ENABLED=false` kill switch. OTLP HTTP exporters for traces/logs/metrics. Auto-instrumentations (Express, mysql2, AWS SDK, HTTP) with `instrumentation-fs` disabled. LoggerProvider exposed via `global.__otelLoggerProvider`. SIGTERM/SIGINT shutdown. |
| 2.3 | `backend/api-gateway/server.js` | Added `require('../shared/tracing');` as first line. |
| 2.4 | `backend/order-processor/processor.js` | Added `require('../shared/tracing');` as first line. |
| 2.5 | `backend/api-gateway/middleware/correlation-id.js` | Falls back to OTEL trace ID when no X-Correlation-ID header. Guards against invalid all-zero trace IDs. |
| 2.6 | `docker-compose.yml` | Added `OTEL_COLLECTOR_ENDPOINT` and `OTEL_SERVICE_NAME` to api-gateway and order-processor. |

### Phase 3: Backend Logging → OTEL Log Bridge — DONE

| Step | File | Action |
|------|------|--------|
| 3.1 | `backend/shared/logger.js` | Rewrote internals. OTEL imports are optional (try/catch) for graceful degradation in tests. Emits log records to OTEL Collector via `global.__otelLoggerProvider`. Added `LOG_FORMAT=json` mode. Trace context (trace.id, span.id) attached to log records. Same exported API surface — zero call-site changes. |
| 3.2 | `backend/mcp-server/src/logger.ts` | Created TypeScript logger mirroring backend API. Supports LOG_FORMAT=json, colors, log levels. |
| 3.3 | `backend/mcp-server/src/index.ts` | Replaced `console.log`/`console.error` with `log`/`logError` from the new logger. |

### Phase 4: Backend Metrics — DONE

| Step | File | Action |
|------|------|--------|
| 4.1 | `backend/order-processor/processor.js` | Added SQS counters (`sqs.messages.received`, `sqs.messages.processed`, `sqs.messages.failed`) and circuit breaker observable gauge. OTEL import wrapped in try/catch. |
| 4.2 | `backend/shared/database.js` | Added DB pool observable gauges (`db.pool.active_connections`, `db.pool.idle_connections`, `db.pool.queued_requests`). OTEL import wrapped in try/catch. |

### Phase 5: Frontend Observability — DONE

| Step | File | Action |
|------|------|--------|
| 5.1 | `frontend/package.json` | npm installed: `@opentelemetry/api`, `@opentelemetry/sdk-trace-web`, `@opentelemetry/exporter-trace-otlp-http`, `@opentelemetry/instrumentation-fetch`, `@opentelemetry/instrumentation-xml-http-request`, `@opentelemetry/context-zone`, `@opentelemetry/resources`, `@opentelemetry/semantic-conventions`, `@opentelemetry/sdk-trace-base`, `@opentelemetry/instrumentation` |
| 5.2 | `frontend/src/utils/tracing.js` | Created. WebTracerProvider with BatchSpanProcessor, FetchInstrumentation, XMLHttpRequestInstrumentation, ZoneContextManager. Uses `resourceFromAttributes` (newer OTEL API). Collector URL defaults to `/v1/traces` (nginx proxy). |
| 5.3 | `frontend/src/index.jsx` | Added `import './utils/tracing';` as first line. |
| 5.4 | `frontend/src/utils/logger.js` | Added OTEL span event emission via `trace.getActiveSpan()` alongside existing console output. Same API surface. |
| 5.5 | `frontend/nginx.conf.template` | Added `/v1/traces` location block proxying to otel-collector:4318. Uses `$otel_host` variable for dynamic resolution. |
| 5.6 | `frontend/Dockerfile` | Updated `NGINX_ENVSUBST_FILTER` to include `OTEL_COLLECTOR_HOST`. Added `ENV OTEL_COLLECTOR_HOST=otel-collector` default. |

### Phase 6: CI/CD Integration — DONE

| Step | File | Action |
|------|------|--------|
| 6.1 | `docker-compose.blue.yml` | Added `OTEL_COLLECTOR_ENDPOINT`, `OTEL_SERVICE_NAME` to api-gateway and order-processor. Added `OTEL_COLLECTOR_HOST` to frontend. Added `LOG_FORMAT=json` to api-gateway and order-processor. |
| 6.2 | `docker-compose.green.yml` | Same as blue (green container names/ports). |
| 6.3 | `.gitlab-ci.yml` | Added CI OTEL port variables. Added OTEL health verification in deploy:target. Added OTEL diagnostics to deploy after_script and E2E failure diagnostics. Added OTEL services to deployment summary output. |

---

## Deviations from Original Plan

| Planned | Actual | Reason |
|---------|--------|--------|
| `Resource` class from `@opentelemetry/resources` | `resourceFromAttributes()` function | `Resource` class removed from ESM exports in newer `@opentelemetry/resources` |
| Direct OTEL imports in `logger.js` | Optional try/catch imports | `backend/shared/logger.js` is required from `shared/` dir but OTEL packages live in service `node_modules/`. Try/catch ensures tests pass without OTEL SDK. |
| `LoggerProvider` from NodeSDK | `global.__otelLoggerProvider` pattern | NodeSDK doesn't expose its LoggerProvider directly. Created separate LoggerProvider and exposed it via global for the logger module to consume. |
| Prometheus scrapes otel-collector:8889 | Prometheus Remote Write from collector + self-scrape on 8888 | Remote Write is the primary metrics path. Prometheus also self-scrapes and scrapes collector's internal metrics on default port 8888. |
| OTEL Collector uses `${DURABLE_CONTAINER_PREFIX}` in config | Hardcoded `jaeger` and `prometheus` hostnames | Docker Compose service names (not container names) are used for inter-service DNS on the durable network. |
| MCP Server gets OTEL SDK integration | MCP Server gets structured logger only | MCP Server is stubbed/durable. Full OTEL SDK deferred until MCP is fully implemented. |
| SQS context propagation verification | Deferred | Auto-instrumentation handles this; manual verification requires running infrastructure. |

---

## Environment Variables

| Variable | Default | Purpose |
|----------|---------|---------|
| `OTEL_COLLECTOR_ENDPOINT` | `http://...-otel-collector:4318` | Collector OTLP HTTP endpoint |
| `OTEL_SERVICE_NAME` | (per service) | Service identity in traces |
| `OTEL_ENABLED` | `true` | Kill switch — set to `false` to disable all OTEL instrumentation |
| `OTEL_COLLECTOR_HOST` | `otel-collector` | Hostname for frontend nginx proxy to collector |
| `LOG_FORMAT` | (unset = human) | `json` for structured JSON console output |
| `LOG_LEVEL` | `INFO` | (unchanged) Log level filtering |
| `LOG_COLORS` | `true` | (unchanged) Terminal colors |

---

## Port Allocation

| Service | Dev-Local Port | CI Port |
|---------|---------------|---------|
| OTEL Collector gRPC | 4317 | 4417 |
| OTEL Collector HTTP | 4318 | 4418 |
| Jaeger UI | 16686 | 16786 |
| Prometheus UI/API | 9090 | 9190 |

---

## Files Changed (Complete List)

| Action | File |
|--------|------|
| CREATE | `otel/collector-config.yaml` |
| CREATE | `otel/prometheus.yml` |
| CREATE | `backend/shared/tracing.js` |
| CREATE | `frontend/src/utils/tracing.js` |
| CREATE | `backend/mcp-server/src/logger.ts` |
| MODIFY | `durable/docker-compose.yml` |
| MODIFY | `durable/.env.devlocal` |
| MODIFY | `durable/.env.ci` |
| MODIFY | `durable/setup.sh` |
| MODIFY | `durable/teardown.sh` |
| MODIFY | `.env` |
| MODIFY | `docker-compose.yml` |
| MODIFY | `docker-compose.blue.yml` |
| MODIFY | `docker-compose.green.yml` |
| MODIFY | `.gitlab-ci.yml` |
| MODIFY | `backend/api-gateway/server.js` |
| MODIFY | `backend/order-processor/processor.js` |
| MODIFY | `backend/api-gateway/middleware/correlation-id.js` |
| MODIFY | `backend/shared/logger.js` |
| MODIFY | `backend/shared/database.js` |
| MODIFY | `backend/mcp-server/src/index.ts` |
| MODIFY | `frontend/src/index.jsx` |
| MODIFY | `frontend/src/utils/logger.js` |
| MODIFY | `frontend/nginx.conf.template` |
| MODIFY | `frontend/Dockerfile` |
| MODIFY | `docs/project_notes/key_facts.md` |
| NPM INSTALL | `backend/api-gateway/`, `backend/order-processor/`, `frontend/` |

---

## Verification Status

- [x] All 22 previously-passing backend tests still pass (15 SQS security + 7 unit)
- [x] Pre-existing 27 ECONNREFUSED failures unchanged (integration tests requiring running server)
- [x] Frontend builds without errors
- [x] TypeScript compilation passes for MCP server
- [x] OTEL is no-op without collector (graceful degradation verified)
- [ ] End-to-end trace flow (requires running infrastructure)
- [ ] Jaeger UI shows linked traces
- [ ] Prometheus shows custom metrics
- [ ] Frontend → backend trace propagation (requires running infrastructure)
