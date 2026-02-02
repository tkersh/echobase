# Codebase Cleanup Plan

Senior engineer review of the full codebase — code smells, reliability risks, and architectural improvements. Organized by priority tier.

*Created: 2026-02-02*

---

## Tier 1 — Bugs and Reliability Risks

Things that will bite you in production or make CI unreliable. Fix first.

### 1. Frontend select element type mismatch
- **File:** `frontend/src/pages/OrderForm.jsx`
- **Problem:** `selectedProductId` stored as string, but `<option value={product.id}>` renders a number. React's controlled component comparison fails on type mismatch. Works by accident today due to browser coercion.
- **Fix:** Consistent typing — store as number or render option values as strings.

### 2. Hardcoded waits in E2E tests cause CI flakiness
- **Files:** `async-processing.integration.spec.js`, `full-flow.integration.spec.js`, `login.frontend.spec.js`, `orders.frontend.spec.js`
- **Problem:** `page.waitForTimeout(2000)`, `setTimeout(resolve, 15000)`, etc. Either waste time or cause false failures depending on CI load.
- **Fix:** Replace with polling/`waitForFunction()` patterns. The `submitAndWaitForOrder` helper already does this correctly — extend the pattern.

### 3. Order processor has no circuit breaker for database failures
- **File:** `backend/order-processor/processor.js`
- **Problem:** If MariaDB goes down, processor silently polls and fails on every message forever with no backoff.
- **Fix:** Track consecutive failures. After N failures (e.g., 5), pause polling with exponential backoff. Log "circuit open." Resume on health check success.

### 4. Order processor healthcheck is just `pgrep -f node`
- **File:** `docker-compose.yml` (order-processor healthcheck)
- **Problem:** Passes as long as Node process exists, even if SQS unreachable and DB down. Orchestration thinks service is healthy when it isn't.
- **Fix:** Track timestamp of last successful poll, expose via simple HTTP endpoint or file touch, check in healthcheck.

---

## Tier 2 — Code Smells and DRY Violations

Make the codebase harder to maintain; sources of future bugs.

### 5. CORS origin parsing duplicated in two places
- **Files:** `backend/api-gateway/server.js` (~lines 79-92), `backend/api-gateway/middleware/csrf-middleware.js` (~lines 107-122)
- **Problem:** Both parse `CORS_ORIGIN` into allowed-origins list independently.
- **Fix:** Extract to `backend/shared/cors-utils.js`. Both consumers import from there.

### 6. Frontend localStorage usage scattered across 5+ files
- **Files:** `AuthContext.jsx`, `Login.jsx`, `Register.jsx`, `OrderForm.jsx`, `utils/logger.js`
- **Problem:** Direct `localStorage.getItem/setItem` calls with string key literals. `recommendedProducts` key managed in three components.
- **Fix:** Create `frontend/src/utils/storage.js` with named constants and accessor functions.

### 7. Legacy route uses private Express internals
- **File:** `backend/api-gateway/server.js` (~lines 472-482)
- **Problem:** Backward-compat route calls `app._router.handle()` — undocumented internal API that can break on Express upgrade.
- **Fix:** Remove legacy route (if no consumers) or use `res.redirect(307, '/api/v1/orders')`.

### 8. Unused `setAuthToken` / `getAuthHeaders` in APIClient
- **File:** `frontend/src/services/api.js`
- **Problem:** Methods defined but never called. Token passed manually per-request instead.
- **Fix:** Either use them (set token after login, auto-attach to requests) or delete them.

### 9. Test cleanup code duplicated across test files
- **Files:** Most E2E test files in `e2e-tests/tests/`
- **Problem:** `afterEach` cleanup pattern (delete orders, then delete user) copy-pasted rather than delegated to fixture system.
- **Fix:** Ensure all test files use the `testUsers` fixture consistently and remove manual cleanup loops.

---

## Tier 3 — Security Hardening

Not vulnerabilities per se, but deviations from best practice.

### 10. CSP allows `unsafe-inline` and `unsafe-eval`
- **File:** `frontend/nginx.conf.template` (~line 107)
- **Problem:** `script-src 'self' 'unsafe-inline' 'unsafe-eval'` significantly weakens XSS protection.
- **Fix:** Remove `unsafe-inline` (move inline styles to CSS files, including `ErrorBoundary.jsx`). Remove `unsafe-eval` (Vite production builds don't need it). Add nonces if inline scripts unavoidable.

### 11. Rate limiting test is skipped with no explanation
- **File:** `e2e-tests/tests/security/rate-limiting.security.spec.js`
- **Problem:** Top-level `.skip()` with no comment. Rate limiting has zero automated test coverage.
- **Fix:** Fix and enable the test, or add a clear comment with tracking issue for why disabled.

### 12. CSRF rejection logged at `info` level instead of `warn`
- **File:** `backend/api-gateway/middleware/csrf-middleware.js`
- **Problem:** Rejected requests logged with `info()`. Security events hard to filter from normal traffic.
- **Fix:** Use `warn()` for rejections, `debug()` for validation details.

---

## Tier 4 — Observability and Operability

Don't cause failures but make diagnosing them harder.

### 13. No request correlation IDs across services
- **Files:** All backend services
- **Problem:** Request flows through frontend → nginx → API gateway → SQS → order processor → database with no linking ID. Debugging requires manual timestamp matching across log streams.
- **Fix:** Generate UUID in API gateway (or nginx), pass via response header and SQS message attribute, log at every hop.

### 14. No request timeouts in frontend fetch calls
- **File:** `frontend/src/services/api.js` (APIClient)
- **Problem:** Raw `fetch()` with no `AbortController` timeout. Hung backend = user stares at spinner forever.
- **Fix:** Add configurable timeout (e.g., 30s) via `AbortController.signal` in base request method.

### 15. Products endpoint has no pagination
- **File:** `backend/api-gateway/routes/products.js`
- **Problem:** `SELECT * FROM products ORDER BY name` — unbounded query. Growing catalog = performance problem.
- **Fix:** Add `?limit=` and `?offset=` query parameters with reasonable default (e.g., 50).

---

## Tier 5 — Cleanup and Consistency

Low-effort improvements that reduce cognitive load.

### 16. Brittle JSON parsing in durable/setup.sh
- **File:** `durable/setup.sh` (~line 152)
- **Problem:** Uses `grep -o` and `cut -d'"'` to parse JSON. Secret values with escaped quotes = silent garbage.
- **Fix:** Use `jq` — `jq -r '.root_password'` vs fragile grep/cut pipeline.

### 17. Hardcoded values scattered across scripts
- **Files:** Multiple scripts and Terraform files
- **Problem:** Queue name `order-processing-queue`, database name `orders_db`, fallback endpoint `http://docker:4566` appear as literals. The fallback in `scripts/export-terraform-vars.sh` (line 32) silently uses wrong endpoint if variable unset.
- **Fix:** Define in `.env.example` and reference via environment variables consistently.

### 18. AWS SDK versions are outdated
- **File:** `backend/api-gateway/package.json`
- **Problem:** `@aws-sdk/client-sqs` at `^3.621.0`, `@aws-sdk/client-secrets-manager` at `^3.921.0` — well behind current.
- **Fix:** `npm update` for both. Minor version bumps within v3 SDK, should be safe. Run tests to verify.

### 19. Connection pool oversized for order processor
- **File:** `backend/shared/database.js`
- **Problem:** Defaults to 50 connections, but order processor processes sequentially — never uses more than 1.
- **Fix:** Allow override via environment variable, default to 5 for order processor.

### 20. Documentation sprawl
- **Files:** 18+ markdown files across `docs/`, `e2e-tests/`, `frontend/`, root
- **Problem:** Overlap (e.g., `GITLAB_CI_SETUP.md` vs `GITLAB_CI_README.md`, `TrustBoundaries.md` vs `TrustBoundaries-Original.md`). Unclear which are current.
- **Fix:** Audit docs, remove/archive stale ones, consolidate duplicates. Add "Last verified" dates.

---

## Summary

| Tier | Items | Theme |
|------|-------|-------|
| 1 | #1–#4 | Bugs and reliability — things that will cause failures |
| 2 | #5–#9 | DRY violations and dead code — maintenance burden |
| 3 | #10–#12 | Security hardening — close gaps in defenses |
| 4 | #13–#15 | Observability — ability to diagnose problems |
| 5 | #16–#20 | Consistency and cleanup — reduce cognitive load |

---

## Status Tracker

| # | Item | Status |
|---|------|--------|
| 1 | Select type mismatch | Pending |
| 2 | Hardcoded test waits | Pending |
| 3 | Processor circuit breaker | Pending |
| 4 | Processor healthcheck | Pending |
| 5 | CORS parsing DRY | Pending |
| 6 | localStorage consolidation | Pending |
| 7 | Legacy route removal | Pending |
| 8 | Dead APIClient methods | Pending |
| 9 | Test cleanup dedup | Pending |
| 10 | CSP hardening | Pending |
| 11 | Rate limiting test | Pending |
| 12 | CSRF log levels | Pending |
| 13 | Correlation IDs | Pending |
| 14 | Frontend fetch timeouts | Pending |
| 15 | Products pagination | Pending |
| 16 | Shell JSON parsing | Pending |
| 17 | Hardcoded values | Pending |
| 18 | AWS SDK update | Pending |
| 19 | Connection pool sizing | Pending |
| 20 | Documentation audit | Pending |
