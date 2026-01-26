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

## Logging and Diagnostics

- **Always add logging for failure diagnostics**: When adding anything to core code or supporting infrastructure (scripts, CI jobs, services), include appropriate logging that will help diagnose failures. This includes: input values, intermediate states, error messages with context, and exit codes.
- **Log before and after critical operations**: For operations that can fail (API calls, database operations, file operations), log what you're about to do and whether it succeeded or failed.
- **Include context in error messages**: Don't just log "failed" - include what was being attempted, what values were involved, and any error details returned.
