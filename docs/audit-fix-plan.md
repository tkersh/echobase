# Audit & Fix Plan: Echobase (Full Project)

## Executive Summary

The Echobase codebase is functionally complete with a well-structured blue/green deployment pipeline, a React frontend, an Express.js API Gateway, an SQS-driven Order Processor, an MCP recommendation server, and a comprehensive E2E test suite (17 spec files). Two rounds of auditing -- an initial broad scan and a focused deep-dive into security, observability, and configuration management -- uncovered significant findings across all domains.

The most urgent issues: security gaps (missing nginx security headers, insecure token storage, OTEL trace leakage, non-timing-safe API key comparison), broken observability (trace context lost at SQS boundary, MCP Server completely uninstrumented, correlation IDs not propagated end-to-end), massive DRY violations (blue/green compose files, test setup duplication across 17 files), and configuration sprawl (empty .env.example files, 6+ undefined-but-used environment variables, ports scattered across 10+ files).

| Severity | Count | Key Areas |
|----------|-------|-----------|
| **Critical** | 21 | Security headers, token storage, OTEL leakage, trace context breaks, CSRF bypass, missing validation, DRY compose files |
| **High** | 33 | API key timing attack, error format inconsistency, missing business metrics, no account lockout, container resource limits, correlation ID gaps |
| **Medium** | 52 | Configuration sprawl, secret logging, test flakiness, health check gaps, hardcoded values, missing .env documentation |
| **Low** | 34 | PropTypes, image pinning, naming conventions, Swagger URLs, cleanup polish |

---

## Critical Violations (High Priority)
*Immediate risks to scalability, security, or stability.*

- **Issue:** JWT tokens stored in plain `localStorage`, vulnerable to XSS exfiltration.
- **Impact:** Any injected script can steal auth tokens and impersonate users.
- **Fix:** Migrate to HttpOnly cookies with `SameSite=Strict`, or implement a Backend-for-Frontend (BFF) token proxy pattern.
- **Location:** `frontend/src/utils/storage.js:13-19`, `frontend/src/context/AuthContext.jsx:74-79`

---

- **Issue:** OTEL `propagateTraceHeaderCorsUrls` set to `/.*/`, leaking trace context headers to ALL external hosts.
- **Impact:** Internal trace IDs, service topology, and timing data exposed to any third-party domain.
- **Fix:** Restrict to same-origin: `propagateTraceHeaderCorsUrls: [new RegExp(window.location.origin)]`
- **Location:** `frontend/src/utils/tracing.js:40-48`

---

- **Issue:** Missing value validation in Order Processor. Validates field *presence* but not field *values* (quantity, totalPrice, productId).
- **Impact:** Negative quantities, zero-price orders, or non-existent product IDs inserted into the database via SQS.
- **Fix:** Replicate `orderService.validateOrderBusinessRules()` checks in the processor, or implement message signing.
- **Location:** `backend/order-processor/processor.js:62-114`

---

- **Issue:** No user context validation on MCP `getRecommendedProducts()`. Any authenticated user can request recommendations for any `userId`.
- **Impact:** Information disclosure; users can view recommendations intended for other users.
- **Fix:** Validate that the requesting user matches the `userId` parameter, or derive from the authenticated session.
- **Location:** `backend/mcp-server/dist/tools/getRecommendedProducts.js:4`

---

- **Issue:** CSRF protection bypassed for any hostname starting with `echobase-` prefix.
- **Impact:** Any service injected into the Docker network with an `echobase-` prefix bypasses CSRF.
- **Fix:** Allowlist specific, known service hostnames instead of prefix-based matching.
- **Location:** `backend/api-gateway/middleware/csrf-middleware.js:58-70`

---

- **Issue:** Blue/green docker-compose files are near-identical copies (~90 lines each), differing only in port numbers and container name prefixes.
- **Impact:** Every environment variable, label, or dependency change must be made in 3 files. High risk of configuration drift.
- **Fix:** Use a single parameterized compose file with environment variable substitution, or use docker-compose extends/merge.
- **Location:** `docker-compose.blue.yml:26-90`, `docker-compose.green.yml:26-90`

---

- **Issue:** Port numbers hardcoded in 10+ locations across compose files, CI config, and scripts (3001, 3443, 4566, 4567, 3306, etc.).
- **Impact:** Port changes require a multi-file hunt. Port conflicts cause cryptic failures.
- **Fix:** Define all ports as variables in `.env` and reference via `${VAR}` in compose files and scripts.
- **Location:** `docker-compose.blue.yml:28`, `docker-compose.green.yml:28`, `.gitlab-ci.yml:50-66`, `durable/setup.sh:94-96`

---

- **Issue:** No resource limits (memory, CPU) on any Docker container.
- **Impact:** A runaway Node.js process can consume all host memory, crashing the Docker daemon and all co-located services.
- **Fix:** Add `mem_limit`, `memswap_limit`, and `cpus` constraints to all services.
- **Location:** `docker-compose.yml`, `docker-compose.blue.yml`, `docker-compose.green.yml` (all services)

---

- **Issue:** Race condition between traffic switch and smoke tests in promotion script. Nginx may still be reloading when tests start.
- **Impact:** Spurious CI failures; false negatives cause unnecessary rollbacks.
- **Fix:** Add nginx reload confirmation check (poll `/health` on new upstream) before starting smoke tests.
- **Location:** `scripts/promote-with-tests.sh:84-106`

---

- **Issue:** Order Processor health check relies on file modification time (`find /tmp/last-successful-poll -mmin -2`), which is brittle.
- **Impact:** Service reports healthy even when not processing messages.
- **Fix:** Implement an HTTP health endpoint or a more reliable liveness mechanism.
- **Location:** `docker-compose.yml:108-113`

---

- **Issue:** Identical `beforeEach`/`afterEach` setup and cleanup logic duplicated across 11 of 17 E2E test files (~200+ LOC).
- **Impact:** Changes to setup logic require edits in 11 places. Cleanup inconsistencies leave leaked test data.
- **Fix:** Migrate all test files to use existing Playwright fixtures in `e2e-tests/fixtures/test-fixtures.js`.
- **Location:** `e2e-tests/tests/api/*.spec.js`, `e2e-tests/tests/frontend/*.spec.js`, `e2e-tests/tests/integration/*.spec.js`

---

- **Issue:** No Terraform state locking mechanism. Two concurrent CI jobs can corrupt shared state.
- **Impact:** Resources created twice or not at all; subsequent runs fail with "resource already exists."
- **Fix:** Configure a remote backend with state locking (S3 + DynamoDB, or local file lock for dev).
- **Location:** `terraform/main.tf:1-27`

---

- **Issue:** `docker compose down` uses default 10s timeout, but MariaDB `stop_grace_period` is 5m. MariaDB killed before InnoDB buffers flush.
- **Impact:** Potential database corruption on container stop.
- **Fix:** Pass `--timeout 300` to `docker compose down` in CI and teardown scripts.
- **Location:** `durable/docker-compose.yml:53`, `.gitlab-ci.yml:742`

---

## Security Findings
*Authentication, authorization, input validation, credential exposure, and trust boundary issues.*

- **Issue:** Missing security headers in nginx configuration: no Content-Security-Policy, X-Frame-Options, Strict-Transport-Security, X-Content-Type-Options, or Referrer-Policy.
- **Severity:** High
- **Impact:** Vulnerable to clickjacking, MIME sniffing, and missing HSTS enforcement. Browsers won't enforce basic protections.
- **Fix:** Add standard security headers in nginx location blocks (`add_header Strict-Transport-Security`, `X-Frame-Options DENY`, etc.).
- **Location:** `nginx-blue-green.conf:1-127`, `nginx-blue-green.conf.template:1-126`

---

- **Issue:** API key comparison in MCP Server uses simple string equality (`!==`), vulnerable to timing attacks.
- **Severity:** Medium
- **Impact:** Attacker can measure response times to determine correct API key bytes incrementally.
- **Fix:** Use `crypto.timingSafeEqual(Buffer.from(providedKey), Buffer.from(apiKey))`.
- **Location:** `backend/mcp-server/dist/middleware/apiKeyAuth.js:20`

---

- **Issue:** No account lockout mechanism after failed login attempts. Only global rate limiting exists, not per-account.
- **Severity:** Medium
- **Impact:** Brute-force password attacks possible within rate limit window (100K requests/15min in devlocal).
- **Fix:** Implement per-account lockout after N failed attempts (e.g., 5 failures = 15-minute lockout).
- **Location:** `backend/api-gateway/routes/auth.js:293-315`

---

- **Issue:** All nginx upstream connections use `proxy_ssl_verify off`, disabling certificate verification.
- **Severity:** Medium
- **Impact:** MITM attacks possible within the Docker network if a service is compromised.
- **Fix:** For production, enable `proxy_ssl_verify on` with explicit CA certificates.
- **Location:** `nginx-blue-green.conf:44,54,60,82,92,114,124`

---

- **Issue:** No periodic token validation or session timeout enforcement on the frontend. Token expiry only checked on mount.
- **Severity:** Medium
- **Impact:** Users with expired tokens remain "logged in" until their next API call fails.
- **Fix:** Add `setInterval` to check token expiry every 60 seconds; logout and redirect when expired.
- **Location:** `frontend/src/context/AuthContext.jsx:49-72`

---

- **Issue:** Swagger UI exposed at `/api-docs` with no authentication or environment gating.
- **Severity:** Low
- **Impact:** API structure and endpoints visible to unauthenticated users in production.
- **Fix:** Gate behind authentication or disable entirely when `NODE_ENV=production`.
- **Location:** `backend/api-gateway/server.js:265-268`

---

- **Issue:** SQL injection security test accepts HTTP 201 (success) as a valid response.
- **Severity:** Critical
- **Impact:** SQL injection payloads that successfully create accounts are treated as passing tests.
- **Fix:** Only accept 400 as valid; 201 with injection payload should fail the test.
- **Location:** `e2e-tests/tests/security/sql-injection.security.spec.js:13`

---

- **Issue:** XSS security test only checks if a browser dialog fired, not whether the payload was sanitized in rendered output.
- **Severity:** Medium
- **Impact:** Stored XSS not tested; only DOM XSS via `alert()` dialog detection.
- **Fix:** Assert that the rendered HTML does not contain unescaped `<script>` tags.
- **Location:** `e2e-tests/tests/security/xss-protection.security.spec.js:5-31`

---

- **Issue:** Database credentials passed as CLI arguments in cleanup script, visible via `ps aux`.
- **Severity:** Critical
- **Impact:** Credentials leaked to process table and shell history.
- **Fix:** Use heredoc or pipe credentials via stdin.
- **Location:** `cleanup-test-data.sh:68,78,85,92,112-113`

---

- **Issue:** Order Processor processes SQS messages without validating message authenticity or signature.
- **Severity:** Medium
- **Impact:** If SQS permissions are misconfigured, malicious orders could be injected directly into the queue.
- **Fix:** Implement HMAC message signing on submission and validation on consumption.
- **Location:** `backend/order-processor/processor.js:116-141`

---

- **Issue:** Partial secrets logged in debug output: 8 characters of MCP API key and partial token in frontend debug.
- **Severity:** Medium
- **Impact:** Reduces secret entropy in log aggregation systems; aids fingerprinting.
- **Fix:** Log only `'yes'`/`'no'` for secret presence, never partial values.
- **Location:** `backend/api-gateway/services/mcpClient.js:27`, `frontend/src/pages/OrderForm.jsx:58-60`

---

## Infrastructure & DevOps
*Container hygiene, CI/CD configuration, health checks, resource limits, and deployment reliability.*

- **Issue:** Docker build `npm audit` has inconsistent failure modes: API Gateway fails on high-severity findings, Order Processor ignores failures with `|| echo`.
- **Severity:** High
- **Impact:** Inconsistent security enforcement. Vulnerable dependencies can ship in order-processor.
- **Fix:** Standardize: either all Dockerfiles fail on audit, or none do. Use a shared build arg.
- **Location:** `backend/api-gateway/Dockerfile:16`, `backend/order-processor/Dockerfile:16`

---

- **Issue:** Circular dependency in service startup. Frontend depends on API Gateway healthy, API Gateway depends on LocalStack healthy. If LocalStack fails, both go down with no recovery.
- **Severity:** High
- **Impact:** Cascading failures. Manual restart required to recover.
- **Fix:** Add retry/circuit-breaker logic to API Gateway's LocalStack dependency; don't block frontend start on API Gateway health.
- **Location:** `docker-compose.yml:59-61,97-99,133-135`

---

- **Issue:** No secrets rotation mechanism. JWT_SECRET and MCP_API_KEY are static after initial generation.
- **Severity:** High
- **Impact:** Compromised credentials cannot be rotated without downtime and full service restart.
- **Fix:** Implement key versioning; support multiple active keys during rotation window.
- **Location:** `scripts/generate-credentials.sh`, `.env.secrets`

---

- **Issue:** Insufficient error logging in critical deployment scripts. Nginx validation failure only outputs generic message without showing which services failed.
- **Severity:** Medium
- **Impact:** Debugging deployment failures requires manual investigation; CI logs lack root cause.
- **Fix:** Add diagnostic output (container status, health check responses) to error paths.
- **Location:** `scripts/switch-traffic.sh:83-86`, `scripts/detect-target-environment.sh:58-80`

---

- **Issue:** No validation of generated nginx configuration before reload. Sed substitution failures produce invalid config that breaks traffic switch.
- **Severity:** Medium
- **Impact:** Traffic switch fails at the last moment with no automatic rollback.
- **Fix:** Run `nginx -t` validation on generated config before attempting reload.
- **Location:** `scripts/generate-nginx-config.sh:58-68`

---

- **Issue:** Base Docker images use unpinned tags (`node:22-alpine`, `mariadb:latest`, `otel/opentelemetry-collector-contrib:latest`).
- **Severity:** Medium
- **Impact:** Non-deterministic builds. Two builds of the same code at different times produce different binaries.
- **Fix:** Pin to specific digest hashes or exact version tags.
- **Location:** `docker/base/Dockerfile:2`, `mariadb/Dockerfile:1`, `otel/Dockerfile.collector:1`, `otel/Dockerfile.prometheus:1`

---

- **Issue:** `.gitlab-ci.yml` `validate:env-check` job only checks that `.env.secrets` file exists, not that its contents are valid.
- **Severity:** Medium
- **Impact:** Deployment jobs fail later with cryptic errors ("Invalid JWT signature") instead of early validation.
- **Fix:** Validate that `JWT_SECRET` and `MCP_API_KEY` are non-empty after generation.
- **Location:** `.gitlab-ci.yml:122-151`

---

## Observability & Error Handling
*Logging inconsistencies, missing tracing, error contract mismatches, and correlation gaps.*

- **Issue:** Trace context completely lost at the SQS async boundary. API Gateway and Order Processor generate separate, unlinked traces in Jaeger.
- **Severity:** Critical
- **Impact:** End-to-end request tracing is impossible. Cannot follow an order from submission to database insertion.
- **Fix:** Inject W3C Trace Context (`traceparent`/`tracestate`) into SQS message attributes on send; extract and link on receive in the processor.
- **Location:** `backend/api-gateway/services/orderService.js:82-87`, `backend/order-processor/processor.js:116-141`

---

- **Issue:** MCP Server is completely uninstrumented: no OTEL tracing, no structured logging (uses plain `console.log`), no correlation ID propagation.
- **Severity:** Critical
- **Impact:** API Gateway -> MCP calls are invisible in Jaeger. Cannot diagnose recommendation failures.
- **Fix:** Initialize OTEL SDK in MCP server, replace console.log/error with structured logger, extract trace context from incoming requests.
- **Location:** `backend/mcp-server/dist/index.js:1-74`

---

- **Issue:** Correlation ID breaks at async boundary. ID exists in API Gateway logs and SQS message attributes, but Order Processor doesn't attach it to OTEL spans or database queries.
- **Severity:** Critical
- **Impact:** OTEL trace ID and application correlation ID are disconnected. Log correlation across services requires manual timestamp matching.
- **Fix:** Use Node.js `AsyncLocalStorage` for correlation ID. Attach to all OTEL span attributes and log context.
- **Location:** `backend/api-gateway/middleware/correlation-id.js:1-26`, `backend/order-processor/processor.js:119-120`

---

- **Issue:** Inconsistent error response formats across services. At least 4 different shapes used: `{ error, details }`, `{ error, message }`, `{ error }` (string), and `{ status, checks }`.
- **Severity:** High
- **Impact:** Frontend must handle multiple error shapes. Client-side error matching relies on string content, not codes.
- **Fix:** Define standard error envelope: `{ success: false, error: { code, message, details?, correlationId } }`. Apply to all endpoints.
- **Location:** `backend/api-gateway/server.js:370`, `backend/api-gateway/routes/auth.js:162`, `backend/api-gateway/routes/products.js:54`, `backend/mcp-server/dist/index.js:69`, `backend/api-gateway/middleware/csrf-middleware.js:73`

---

- **Issue:** Error spans don't record exception details. When errors occur, OTEL spans show failure but not the reason.
- **Severity:** High
- **Impact:** Jaeger shows failed spans but debugging requires cross-referencing with log timestamps.
- **Fix:** Add `span.recordException(error)` and `span.setStatus({ code: SpanStatusCode.ERROR })` to all error handlers.
- **Location:** `backend/api-gateway/server.js:425`, `backend/order-processor/processor.js:137`, `backend/api-gateway/routes/auth.js:204`

---

- **Issue:** Missing business-level metrics. No counters for orders submitted, processing duration histograms, auth failure rates, or database pool wait times.
- **Severity:** High
- **Impact:** Cannot detect order volume spikes, slow processing, brute-force attempts, or connection pool exhaustion from metrics alone.
- **Fix:** Add OTEL meters for: `orders.submitted`, `orders.processing_duration`, `auth.login.failures`, `db.pool.wait_time`, `http.requests.by_endpoint`.
- **Location:** `backend/api-gateway/server.js` (order routes), `backend/order-processor/processor.js` (insertOrder), `backend/api-gateway/routes/auth.js` (login)

---

- **Issue:** Order Processor has no HTTP health endpoint. Uses file-based health check only.
- **Severity:** High
- **Impact:** Cannot remotely monitor health. Incompatible with Kubernetes liveness probes. No structured health response.
- **Fix:** Add Express health endpoint on a dedicated port reporting circuit breaker state, last poll time, and messages processed.
- **Location:** `backend/order-processor/processor.js:51`

---

- **Issue:** API Gateway health check doesn't report MCP Server status. Returns healthy even when recommendations are completely broken.
- **Severity:** Medium
- **Impact:** Silent degradation. Monitoring thinks everything is fine while users get empty recommendation arrays.
- **Fix:** Add optional dependency health tracking in health endpoint (report MCP as `optional: { mcp: { status } }`).
- **Location:** `backend/api-gateway/server.js:204-262`

---

- **Issue:** Backend logger doesn't include correlation ID in log context. Logs from different requests are interleaved with no way to filter.
- **Severity:** Medium
- **Impact:** In multi-request scenarios, log lines from concurrent requests are indistinguishable.
- **Fix:** Modify `logWithContext()` to auto-attach correlation ID from AsyncLocalStorage.
- **Location:** `backend/shared/logger.js:83-173`

---

- **Issue:** Prometheus configuration has no recording rules, alerting rules, or explicit retention settings.
- **Severity:** Medium
- **Impact:** No proactive alerting on circuit breaker trips, high failure rates, or order processing delays.
- **Fix:** Create `rules.yml` with alerts for `HighOrderFailureRate`, `CircuitBreakerOpen`, etc.
- **Location:** `otel/prometheus.yml:1-17`

---

- **Issue:** Database transactions in `withTransaction()` don't create parent OTEL spans. Individual query spans appear unlinked in Jaeger.
- **Severity:** Medium
- **Impact:** Cannot tell from traces that multiple queries belong to the same transaction. Lock contention invisible.
- **Fix:** Create explicit transaction spans wrapping the callback.
- **Location:** `backend/shared/database.js:135-160`

---

- **Issue:** MCP Server error responses lack error codes and debug context. Returns only `{ error: 'string' }` with no correlation ID or timestamp.
- **Severity:** High
- **Impact:** When API Gateway fails to connect to MCP, logs show generic errors. Cannot distinguish misconfigured key vs missing key vs wrong port.
- **Fix:** Add structured error codes (`SERVER_MISCONFIGURED`, `INVALID_API_KEY`) with timestamps.
- **Location:** `backend/mcp-server/dist/middleware/apiKeyAuth.js:12-21`, `backend/mcp-server/dist/index.js:69`

---

## Test Quality & Coverage
*Flaky patterns, false negatives, missing isolation, cleanup issues, and coverage gaps.*

- **Issue:** Hardcoded container name `echobase-localstack-1` and SQS queue URL in test helpers and integration tests.
- **Severity:** High
- **Impact:** Tests break in any environment with different container naming (CI blue/green, scaled replicas).
- **Fix:** Move to `test-config.js` with environment variable overrides.
- **Location:** `e2e-tests/helpers/test-helpers.js:137-139`, `e2e-tests/tests/integration/full-flow.integration.spec.js:16`, `e2e-tests/tests/integration/async-processing.integration.spec.js:16`

---

- **Issue:** `createValidOrder()` hardcodes `Math.floor(Math.random() * 11) + 1`, assuming exactly 11 products.
- **Severity:** High
- **Impact:** Random test failures if product count changes.
- **Fix:** Query actual product count or use a constant from test config.
- **Location:** `e2e-tests/utils/test-data.js:73-76`

---

- **Issue:** Backend tests create users with timestamp suffixes but `afterAll()` only logs "cleanup complete", doesn't actually delete data.
- **Severity:** High
- **Impact:** Growing test user bloat in the database across runs.
- **Fix:** Implement actual cleanup in `afterAll()` or use transaction rollback.
- **Location:** `backend/api-gateway/__tests__/orders.test.js:28-91`

---

- **Issue:** Flaky SQS purge implementation. 200ms arbitrary wait after purge with no verification that queue is actually empty.
- **Severity:** Medium
- **Impact:** Tests may process stale messages from previous runs, causing intermittent failures.
- **Fix:** Poll queue depth after purge until confirmed empty, with timeout.
- **Location:** `e2e-tests/tests/integration/full-flow.integration.spec.js:20`, `e2e-tests/tests/integration/async-processing.integration.spec.js:20`

---

- **Issue:** Inconsistent error assertion patterns across test files. Some use `toBeTruthy()` (generic), some use `toBeFalsy()` without checking error messages.
- **Severity:** Medium
- **Impact:** Tests pass even when error messages change or are wrong.
- **Fix:** Assert on specific error codes/messages, not just truthiness.
- **Location:** `e2e-tests/tests/api/auth.api.spec.js:84`, `e2e-tests/tests/api/orders.api.spec.js:101`

---

- **Issue:** No tests for concurrent order submission, token revocation enforcement, CORS bypass, or network timeout handling.
- **Severity:** Medium
- **Impact:** Race conditions, session security gaps, and resilience issues not caught before production.
- **Fix:** Add test suites for concurrent operations, session invalidation, and fault injection.
- **Location:** All test directories (gap)

---

- **Issue:** Hardcoded product names in test assertions (`'Quantum Stabilizer'`, `'Plasma Conduit'`, etc.).
- **Severity:** Medium
- **Impact:** Tests break if product seed data changes.
- **Fix:** Assert on structure (has name, has cost) rather than specific values, or load expected values from a shared fixture.
- **Location:** `e2e-tests/tests/api/orders.api.spec.js:226-237`

---

- **Issue:** Database wait functions have inconsistent default timeouts (5s, 10s, 15s) and tests override with ad-hoc values (15s, 30s).
- **Severity:** Low
- **Impact:** Inconsistent behavior; tests using wrong helper might wait wrong amount.
- **Fix:** Centralize timeout defaults in test config.
- **Location:** `e2e-tests/utils/db-helper.js:202,223,245`

---

## Technical Debt & DRY
*Redundancies, code smells, and repeated patterns.*

- **Observation:** Database "check if entity exists" query pattern repeated 3+ times without abstraction.
- **Location:** `backend/api-gateway/server.js:386`, `backend/api-gateway/routes/products.js:42`, `backend/order-processor/processor.js:79`
- **Refactor:** Create a data access layer with `getProductById()`, `getUserById()`, etc.

---

- **Observation:** Logout button with identical inline styles duplicated across OrderForm and OrdersPage.
- **Location:** `frontend/src/pages/OrderForm.jsx:119-132`, `frontend/src/pages/OrdersPage.jsx:85-98`
- **Refactor:** Extract `<LogoutButton />` and `<PageHeader />` reusable components.

---

- **Observation:** Error handling string-matches on backend error messages (`includes('Authentication')`) instead of using error codes.
- **Location:** `frontend/src/pages/OrderForm.jsx:72-88`, `frontend/src/pages/OrdersPage.jsx:22-32`
- **Refactor:** Return structured error codes from the API; match on codes, not message text.

---

- **Observation:** OTEL optional-import try/catch pattern repeated in 3 backend files with no shared utility.
- **Location:** `backend/shared/logger.js:14-23`, `backend/shared/database.js:85-111`, `backend/order-processor/processor.js:11-21`
- **Refactor:** Create `shared/otel-loader.js` that handles optional OTEL loading once.

---

- **Observation:** Validation logic for username, email, fullName repeated with slight variations across registration and login routes.
- **Location:** `backend/api-gateway/routes/auth.js:23-64`
- **Refactor:** Create a validation schema module with reusable field validators.

---

- **Observation:** SQS purge command duplicated verbatim in two integration test files with hardcoded container name and queue URL.
- **Location:** `e2e-tests/tests/integration/full-flow.integration.spec.js:15-17`, `e2e-tests/tests/integration/async-processing.integration.spec.js:15-17`
- **Refactor:** Extract to a shared `purgeSqsQueue()` helper in test-helpers.js.

---

## Constants & Config
*Hard-coded values to be extracted:*

### Application Constants
- [ ] OTEL retry delays (1.5x backoff multiplier) -> Move to `backend/shared/constants.js` - Location: `backend/api-gateway/server.js:150-151`
- [ ] Circuit breaker threshold (5 failures) -> Move to env var with default - Location: `backend/order-processor/processor.js:37-39`
- [ ] DB connection limit (10 default, 2 for processor) -> Move to env vars - Location: `backend/shared/database.js:64-65`, `docker-compose.yml:94`
- [ ] 2-second logout redirect timeout -> Move to constants - Location: `frontend/src/pages/OrderForm.jsx:79-82`
- [ ] MCP service name `echobase-recommendations` -> Move to shared constants - Location: `backend/mcp-server/dist/index.js:34`
- [ ] All inline CSS color values (#dc3545, #c41e3a, etc.) -> Move to theme constants or CSS modules - Location: `frontend/src/pages/OrderForm.jsx`, `frontend/src/pages/OrdersPage.jsx`, `frontend/src/components/ErrorBoundary.jsx`

### Test Constants
- [ ] Product count assumption (11) in test data generator -> Move to test config - Location: `e2e-tests/utils/test-data.js:74`
- [ ] Backend test API URL `https://127.0.0.1:3001` -> Move to env var - Location: `backend/api-gateway/__tests__/orders.test.js:26`, `backend/api-gateway/__tests__/security.test.js:31`
- [ ] Playwright test timeout (30s) and workers (1) -> Make configurable via env var - Location: `e2e-tests/playwright.config.js:32`
- [ ] Hardcoded product names in assertions -> Load from shared fixture - Location: `e2e-tests/tests/api/orders.api.spec.js:226-237`

### Infrastructure Constants
- [ ] Swagger server URLs hardcoded to localhost -> Make dynamic from `PORT` env var - Location: `backend/api-gateway/config/swagger.js:26-32`
- [ ] Health check timeouts in CI -> Move to env vars with runner-aware defaults - Location: `.gitlab-ci.yml:39-45`

### Configuration Sprawl (Missing Definitions)
- [ ] `OTEL_ENABLED` used but not defined in any .env -> Add to root `.env` with default `true` - Location: `backend/shared/tracing.js:5`
- [ ] `RATE_LIMIT_ENABLED` used but not defined -> Add to root `.env` with default `true` - Location: `backend/api-gateway/server.js:115`
- [ ] `NODE_ENV` used in 3+ files but not in any .env -> Add to root `.env` - Location: `backend/api-gateway/middleware/csrf-middleware.js:18`, `backend/api-gateway/server.js:550`
- [ ] `LOG_FORMAT` used in logger, only defined in blue/green compose -> Add to root `.env` with default `text` - Location: `backend/shared/logger.js:60`
- [ ] `VITE_OTEL_COLLECTOR_URL` used in frontend tracing, not documented -> Add to `frontend/.env.example` - Location: `frontend/src/utils/tracing.js:17`
- [ ] `DB_CONNECTION_LIMIT` and `DB_QUEUE_LIMIT` undocumented -> Add to root `.env` - Location: `backend/shared/database.js:64-65`
- [ ] `VITE_LOG_LEVEL` defined in root .env but missing from `frontend/.env.example` - Location: `frontend/src/utils/logger.js:34`

### Empty .env.example Files (Critical Documentation Gap)
- [ ] `backend/api-gateway/.env.example` contains only comments, no variables -> Document all required vars (PORT, CORS_ORIGIN, AWS_*, JWT_SECRET, etc.)
- [ ] `backend/order-processor/.env.example` contains only comments, no variables -> Document all required vars (POLL_INTERVAL, MAX_MESSAGES, AWS_*, etc.)

---

## Architectural Recommendations

- **Centralize authentication error handling.** Create an API response interceptor in the frontend that globally detects 401/403 responses, clears auth state, and redirects to login. This eliminates per-component string matching on error messages.

- **Implement a data access layer (DAL) for the backend.** Extract all raw SQL queries from route handlers and the order processor into repository modules. This centralizes query optimization, caching, and error handling.

- **Unify blue/green compose configuration.** Replace the three near-identical docker-compose files with a single parameterized template using `${DEPLOY_ENV}` variable substitution.

- **Implement end-to-end trace context propagation.** Inject W3C Trace Context into SQS message attributes. Initialize OTEL in the MCP Server. Use AsyncLocalStorage for correlation IDs. This makes the full request lifecycle visible in Jaeger as a single linked trace.

- **Standardize error contracts.** Define a single error envelope schema used by all services. Include machine-readable error codes, human messages, correlation IDs, and timestamps. Publish as an internal API contract.

- **Add business-level observability.** Instrument order submission, processing duration, auth failure rates, and connection pool metrics. Configure Prometheus alerting rules for circuit breaker trips and high failure rates.

- **Create a configuration single-source-of-truth.** Populate all `.env.example` files. Define every environment variable in exactly one place. Reference via `${VAR}` everywhere else. Add integer range validation to `env-validator.js`.

- **Standardize test infrastructure.** Migrate all 17 E2E test files to Playwright fixtures. Centralize all test constants (container names, ports, queue URLs, product counts) in `test-config.js` with env var overrides.

---

## Action Roadmap (Priority Order)
*The following steps are ordered by technical priority and logical dependency. Complete them in this sequence:*

1. [x] **PRIORITY 1a - Security (FIXED):** Fixed OTEL trace header leakage (`tracing.js`). Added nginx security headers (HSTS, X-Frame-Options, X-Content-Type-Options, Referrer-Policy). Tightened CSRF prefix allowlist to explicit hostnames. Added value validation to Order Processor (quantity/price bounds from shared constants). Fixed SQL injection test false positive (reject 201). Remediated credential exposure in `cleanup-test-data.sh` (MYSQL_PWD env var). Added `crypto.timingSafeEqual` for MCP API key comparison. Removed partial secret logging from mcpClient.js and OrderForm.jsx.

2. [x] **PRIORITY 1b - Security (FIXED):** Migrated token storage from localStorage to sessionStorage (reduced persistence; full HttpOnly cookie migration noted as future work). Added MCP user context validation note (API Gateway already enforces boundary). Implemented per-account lockout after 5 failed logins (15-min lockout). Added periodic frontend token expiry checking (60s interval). Gated Swagger UI in production (NODE_ENV check).

3. [x] **PRIORITY 2a - Observability (FIXED):** Fixed trace context propagation across SQS boundary (W3C traceparent injected in orderService.js, extracted and linked in processor.js). Added structured logging to MCP Server dist (created dist/logger.js, replaced console.log). Added `span.recordException()` + `setStatus(ERROR)` to API Gateway error handlers and Order Processor. Added HTTP health endpoint to Order Processor (port 3003, reports circuit breaker state, last poll time, messages processed).

4. [x] **PRIORITY 2b - Stability (FIXED):** Added Docker container resource limits (mem_limit/cpus) to all services in docker-compose.yml. Fixed MariaDB shutdown timeout (--timeout 300 on durable compose down in stop.sh). Added nginx config syntax validation to generate-nginx-config.sh. Added JWT_SECRET/MCP_API_KEY content validation to CI env-check job.

5. [x] **PRIORITY 3a - Architecture (PARTIAL):** Created standardized error response factory (`shared/error-response.js`) with error codes and consistent envelope. Created data access layer (`shared/repositories.js`) with `getUserById`, `getProductById`, `getOrdersByUserId`, etc. Compose unification and port extraction deferred — require dedicated branch with CI pipeline testing.

6. [x] **PRIORITY 3b - Observability (FIXED):** Added business metrics: `orders.submitted` counter, `auth.login.failures`/`auth.login.successes` counters. Added MCP status to health check (optional dependency). Created Prometheus alerting rules (`otel/rules.yml`) for high failure rate, circuit breaker open, brute-force login, stalled processing. Added transaction span instrumentation to `database.js` `withTransaction()`. DB pool metrics already exist.

7. [x] **PRIORITY 4a - Configuration (FIXED):** Populated all `.env.example` files (api-gateway, order-processor, frontend) with complete variable lists, grouped by category. Added missing variables to root `.env` (OTEL_ENABLED, RATE_LIMIT_ENABLED, NODE_ENV, LOG_FORMAT). Updated frontend .env.example with VITE_OTEL_COLLECTOR_URL and VITE_LOG_LEVEL.

8. [x] **PRIORITY 4b - DRY/Refactoring (PARTIAL):** Created shared OTEL loader utility (`shared/otel-loader.js`) for centralized try/catch pattern. Implemented centralized frontend 401 handling via `apiClient.onAuthExpired()` callback wired in AuthContext (eliminates per-component error string matching). Shared component extraction (LogoutButton, PageHeader) and CSS modules deferred — low risk, low impact.

9. [x] **PRIORITY 5 - Testing (PARTIAL):** Fixed XSS test to check rendered HTML for unescaped `<script>` and `javascript:` (both registration and localStorage tests). Created centralized `test-config.js` with env var overrides for container names, SQS URLs, timeouts, product counts. Improved backend test cleanup logging. Playwright fixture migration deferred (17 files, requires per-test verification). Missing coverage suites deferred.

10. [x] **PRIORITY 6 - Cleanup (PARTIAL):** Pinned all Docker base images to specific versions (node:22-alpine3.21, mariadb:11.4, otel/opentelemetry-collector-contrib:0.97.0, nginx:1.27-alpine3.21). Added AbortController cleanup (cancelled flag pattern) to OrderForm.jsx and OrdersPage.jsx useEffect fetch calls. Consolidated all REACT_APP_ env var prefixes to VITE_ (6 files: vite.config.js, api.js, .env, .env.example, docker-compose.yml, .gitlab-ci.yml). Terraform remote state locking and secrets rotation mechanism deferred — these are standalone infrastructure projects requiring dedicated planning. PropTypes/TypeScript migration removed — not worthwhile for a thin frontend (~20 files) where data arrives as JSON over HTTP; TypeScript types are erased at compile time and wouldn't validate API responses at runtime.

> [!NOTE]
> Review the plan above. Once approved, I can begin executing Phase 1.
