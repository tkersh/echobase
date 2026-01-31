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
- **Root Cause**: Base `docker-compose.yml` had `CORS_ORIGIN=${CORS_ORIGIN}` which Docker Compose substitutes from .env file. The .env file only had localhost origins, not internal container names like `https://echobase-green-frontend`. Even though `docker-compose.green.yml` defined explicit CORS_ORIGIN, the variable substitution from .env was taking precedence.
- **Solution**: Removed `CORS_ORIGIN=${CORS_ORIGIN}` from base `docker-compose.yml`. Each environment file now explicitly defines CORS_ORIGIN: `override.yml` (devlocal), `blue.yml`, and `green.yml` each have their own allowed origins.
- **Prevention**: Don't use `${VAR}` substitution in base docker-compose.yml for values that differ per environment. Define them explicitly in each environment-specific file instead.
- **Files**: `docker-compose.yml`, `docker-compose.override.yml`

### 2026-01-31 - Recommended Products Missing in CI
- **Issue**: "Recommended for you" section not appearing on the order form in CI green environment
- **Root Cause**: Each CI pipeline generates a new `MCP_API_KEY` in `generate-credentials.sh`. The durable MCP server retains the key from the first pipeline that created it. When `durable/setup.sh` finds durable infrastructure already running, it exits early without updating the MCP server. The API gateway gets the new key, the MCP server still has the old one, authentication fails silently, and `getRecommendedProducts` returns an empty array.
- **Solution**: Added `docker compose up -d mcp-server` in the "already running" path of `durable/setup.sh` to sync the MCP server's API key with the current `.env`. This is idempotent — Docker Compose only recreates the container if config changed. Also added diagnostic logging in `mcpClient.js` (key prefix, auth failure hint).
- **Prevention**: Durable services that receive credentials from per-pipeline `.env` files must be refreshed during durable setup, even when the rest of the infrastructure is already running. Don't assume durable containers have current credentials just because they're healthy.
- **Files**: `durable/setup.sh` (lines 298-316), `backend/api-gateway/services/mcpClient.js`
- **See also**: `docs/Troubleshooting.md` "Recommended Products Not Showing"

### 2026-01-31 - Teardown Script Not Removing All Containers
- **Issue**: `./scripts/teardown-all.sh --volumes --include-ci` left 6 containers running (MCP server, devlocal ephemeral services)
- **Root Cause**: Two bugs: (1) `teardown_durable()` service list was missing `mcp-server`, (2) no teardown path existed for devlocal ephemeral containers which use hardcoded container names without a `-p` flag
- **Solution**: Added `mcp-server` to the durable service list. Added `teardown_devlocal_ephemeral()` function that runs `docker compose down` from the project root and cleans up remaining `echobase-devlocal-*` containers.
- **Prevention**: When adding new durable services, update both `durable/docker-compose.yml` and the teardown script's service list.
- **File**: `scripts/teardown-all.sh`

<!-- Example entry format:

### 2026-01-23 - Container Failing to Start
- **Issue**: MariaDB container failing with "keyfile not found" error
- **Root Cause**: Secrets Manager not accessible from container network
- **Solution**: Added proper network configuration to durable docker-compose.yml
- **Prevention**: Always verify LocalStack is healthy before starting dependent services

-->