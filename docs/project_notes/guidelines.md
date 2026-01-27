# Development Guidelines

Lessons learned from past bugs - check these before modifying related code.

---

## Endpoint URLs and Networking

- **Verify the full request path through nginx**: nginx has different `location` blocks that route differently. `/api/*` preserves the path; `/health` rewrites it. Trace the full path: URL → nginx location → proxy_pass → backend endpoint.
- **Check network context**: Code may run on host (dev-local) or inside containers (CI). Use `FRONTEND_URL`/`API_URL` variables, not hardcoded hosts. When `USE_INTERNAL_NETWORK=true`, requests go through docker exec.
- **Test both network modes**: If modifying request logic, verify it works both when localhost is reachable (dev) and when it's not (CI containers).
- **Match Origin headers to CORS_ORIGIN**: When making API requests, the `Origin` header must match one of the allowed origins in `CORS_ORIGIN`. Docker-specific hostnames like `host.docker.internal` are typically not in allowed origins - use `https://localhost:1443` instead for internal requests.

---

## Shell Commands and Escaping

- **Single-quote arguments passed through `sh -c`**: When building commands for `docker exec ... sh -c "cmd $args"`, single-quote each argument to prevent shell interpretation of special characters like `\n`, `$`, backticks.
- **Use `"$@"` not `$*`**: `"$@"` preserves argument boundaries; `$*` joins them with spaces, losing structure.
- **Test escape sequences end-to-end**: If using curl's `-w "\n%{http_code}"` or similar, verify the newline actually appears in output when run through the full command pipeline.

---

## Docker Compose and Environment Variables

- **`source .env` puts ALL vars into shell**: Shell environment variables have HIGHEST precedence for Docker Compose variable substitution. If you `source .env` and then run docker-compose, shell vars will override values in docker-compose.yml and override files.
- **Unset vars that need per-environment values**: After sourcing .env, unset variables like `CORS_ORIGIN` that have different values in docker-compose.blue.yml vs docker-compose.green.yml. Let the compose file define them.
- **Explicit values in compose files override `${VAR}` syntax**: docker-compose.green.yml's `CORS_ORIGIN=...` is an explicit value. docker-compose.yml's `CORS_ORIGIN=${CORS_ORIGIN}` uses variable substitution. Shell env takes precedence for substitution.
- **Debug with `docker compose config`**: Run `docker compose -f docker-compose.yml -f docker-compose.green.yml config` to see the final merged config and verify environment variable values.

---

## Test Suite Consistency

- **Apply fixes across all test suites**: When fixing an issue in one test suite (smoke tests, E2E tests, API Gateway unit tests), check if the same issue could affect the others. Common patterns that need cross-suite fixes:
  - Origin/CORS header handling
  - Network mode differences (host vs container)
  - URL construction and endpoint paths
  - Environment variable usage
- **Test suites share infrastructure**: All test suites run against the same deployed environment. A CORS fix needed for smoke tests likely affects E2E tests too.
- **Check all test files when modifying shared utilities**: Changes to `scripts/smoke-tests.sh`, `e2e-tests/utils/`, or `backend/api-gateway/middleware/` can affect multiple test types.

---

## Logging and Diagnostics

- **Always add logging for failure diagnostics**: When adding anything to core code or supporting infrastructure (scripts, CI jobs, services), include appropriate logging that will help diagnose failures. This includes: input values, intermediate states, error messages with context, and exit codes.
- **Log before and after critical operations**: For operations that can fail (API calls, database operations, file operations), log what you're about to do and whether it succeeded or failed.
- **Include context in error messages**: Don't just log "failed" - include what was being attempted, what values were involved, and any error details returned.
