# Bug Log

This file logs bugs and their solutions for future reference. Keep entries brief and chronological.

## Format

Each bug entry should include:
- Date (YYYY-MM-DD)
- Brief description of the bug/issue
- Root cause
- Solution or fix applied
- Any prevention notes (optional)

Use bullet lists for simplicity. Older entries can be manually removed when they become irrelevant (6+ months).

See also: `guidelines.md` for general lessons learned from past bugs.

---

## Entries

### 2026-01-23 - Smoke Test Health Endpoint Returns 404
- **Issue**: CI smoke tests failing with 404 on API health check
- **Root Cause**: Test used `${API_URL}/health` which resolves to `/api/health`. nginx proxies `/api/*` to backend preserving the path, but the API's health endpoint is at `/health`, not `/api/health`
- **Solution**: Changed to `${FRONTEND_URL}/health` which uses nginx's dedicated `/health` location that proxies to the correct backend endpoint
- **Prevention**: nginx has separate locations for `/health` (proxies to `/health`) and `/api/` (preserves path). Use the right base URL for each endpoint type
- **File**: `scripts/smoke-tests.sh` line 167

### 2026-01-23 - Smoke Test HTTP Code Extraction Broken in CI
- **Issue**: HTTP status code extraction returned malformed values like `</html>n200` instead of `200`
- **Root Cause**: `do_curl` passed arguments through `sh -c "curl $curl_args"` without proper quoting. In unquoted shell context, `\n` in `-w "\n%{http_code}"` was interpreted as escaped `n`, not literal backslash-n for curl to interpret as newline
- **Solution**: Rewrote `do_curl` to single-quote each argument when building the docker exec command, preserving special characters for curl
- **Prevention**: When passing arguments through `sh -c`, always single-quote them to prevent shell interpretation. Use `"$@"` not `$*` to preserve argument boundaries
- **File**: `scripts/smoke-tests.sh` lines 133-149

### 2026-01-24 - Smoke Test Auth Returns 403 Forbidden in CI
- **Issue**: User registration returned 403 instead of 201 during smoke tests in CI
- **Root Cause**: Smoke test sent `Origin: https://host.docker.internal:1443` but CSRF middleware validates Origin against `CORS_ORIGIN` env var, which only allows `https://localhost:1443` and similar
- **Solution**: Modified `do_curl` to rewrite Origin header to `https://localhost:1443` when in internal network mode, matching the allowed origins in CORS_ORIGIN
- **Prevention**: When making requests through internal Docker networking, ensure Origin headers match what the API's CORS/CSRF configuration allows. `host.docker.internal` is a Docker-specific hostname that APIs typically don't include in allowed origins
- **File**: `scripts/smoke-tests.sh` lines 140-143

### 2026-01-26 - E2E Tests Failing with "Origin validation failed" in CI
- **Issue**: UI tests (login, registration flows) failing with 403 "Origin validation failed"
- **Root Cause**: `deploy:target` job runs `source .env` which sets `CORS_ORIGIN=https://localhost:3543` in shell. Shell environment variables take precedence in Docker Compose variable substitution, overriding the explicit `CORS_ORIGIN` in `docker-compose.green.yml` that includes internal container names like `https://echobase-green-frontend`
- **Solution**: Added `unset CORS_ORIGIN` after `source .env` in deploy:target so the docker-compose.green.yml value is used
- **Prevention**: Be aware that `source .env` puts ALL variables into shell environment, which can override values in docker-compose override files. Either unset sensitive vars after sourcing, or don't include them in .env when they need environment-specific values
- **File**: `.gitlab-ci.yml` line ~678

<!-- Example entry format:

### 2026-01-23 - Container Failing to Start
- **Issue**: MariaDB container failing with "keyfile not found" error
- **Root Cause**: Secrets Manager not accessible from container network
- **Solution**: Added proper network configuration to durable docker-compose.yml
- **Prevention**: Always verify LocalStack is healthy before starting dependent services

-->