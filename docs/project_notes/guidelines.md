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

## Docker Service Name DNS on Shared Networks

- **Service names resolve to ALL matching containers**: When multiple Docker Compose projects share an external network (e.g., `durable-network`), a service name like `api-gateway` resolves to ALL containers with that alias on the network. If both blue and green environments are running, DNS returns two IPs and nginx round-robins between them.
- **Ephemeral-to-ephemeral traffic should stay on the ephemeral network**: Conceptually, frontend→api-gateway should use the ephemeral network (where only one `api-gateway` exists). However, Docker DNS doesn't let containers choose which network to resolve on — a container sees all aliases from all its networks. So if a container is on both networks, the ambiguous service name is unavoidable.
- **Use explicit container names in CI**: In blue/green environments, always use the full container name (e.g., `echobase-green-api-gateway`) instead of the service name (`api-gateway`). This ensures requests go to the correct environment's container.
- **Parameterize hostnames**: Use environment variables (e.g., `API_GATEWAY_HOST`) to make hostnames configurable per environment. The base docker-compose.yml can default to the service name, while CI overrides specify the explicit container name.
- **Verify DNS resolution**: When debugging CI connectivity issues, always check `nslookup <service-name>` from the requesting container. Multiple IP addresses in the response indicates the shared-network DNS round-robin problem.

---

## Docker Compose and Environment Variables

- **Don't use `${VAR}` for per-environment values**: If a variable like `CORS_ORIGIN` differs between environments (devlocal, blue, green), don't use `${CORS_ORIGIN}` in the base docker-compose.yml. Docker Compose substitutes `${VAR}` from .env file BEFORE merging with override files, so the .env value wins.
- **Define environment-specific vars in environment files**: Each environment file (override.yml, blue.yml, green.yml) should explicitly define values like `CORS_ORIGIN` that differ per environment. The base file should only use `${VAR}` for truly shared values.
- **`.env` is read directly by Docker Compose**: Even if you `unset VAR` in shell, Docker Compose still reads .env file for `${VAR}` substitution. The only reliable fix is to not use `${VAR}` syntax for per-environment values.
- **Debug with `docker compose config`**: Run `docker compose -f docker-compose.yml -f docker-compose.green.yml config` to see the final merged config and verify environment variable values.

---

## Durable Infrastructure and Per-Pipeline Credentials

- **Durable services must be refreshed when credentials change**: Each CI pipeline generates a fresh `.env` with new secrets (e.g., `MCP_API_KEY`). Durable containers persist across pipelines but may hold stale credentials. The `durable/setup.sh` "already running" path must update any durable service whose config comes from `.env`, not just skip them.
- **`docker compose up -d <service>` is safe for credential sync**: It's idempotent — only recreates the container if its environment has changed. No-op if the config matches.
- **When adding new durable services**: Ensure the service is (1) started in `durable/setup.sh`'s NEEDS_START path, (2) refreshed in the "already running" path, and (3) included in `teardown-all.sh`'s service list.

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

---

## CI/CD Test Failure Diagnostics

When E2E or integration tests fail in CI, always capture these diagnostics:

### Environment State
- **Container environment variables**: `docker exec <container> printenv VAR_NAME` for critical vars like `CORS_ORIGIN`, `LOG_LEVEL`
- **Docker image timestamp**: `docker inspect <image>:latest --format='{{.Created}}'` to verify image was rebuilt
- **Running containers**: `docker ps --filter "name=<pattern>"` to check for duplicate or stale containers

### Network Diagnostics
- **Container connectivity**: `docker exec <frontend> wget -q -O - --no-check-certificate https://api-gateway:3001/health` to verify nginx can reach backend
- **DNS resolution**: `docker exec <frontend> nslookup api-gateway` or `getent hosts api-gateway` to verify service name resolution
- **Network membership**: `docker network inspect <network> --format='{{range .Containers}}{{.Name}} {{end}}'` to see all containers on network

### Log Analysis
- **Unfiltered logs**: Always capture unfiltered logs (not just grep patterns) - filtering can hide the actual problem
- **Multiple services**: Check both frontend (nginx) and backend (api-gateway) logs - requests may fail at either layer
- **Host header analysis**: Check what `Host` header appears in logs - `Host: 127.0.0.1:3001` means direct API access, `Host: echobase-*` means proxied through nginx
- **Look for missing requests**: If expected requests don't appear in logs, they may be going to wrong container or failing before reaching the service

### Request Flow Verification
- **Direct API vs proxied**: ApiHelper requests go directly to API Gateway (Host: 127.0.0.1:3001). Browser/UI requests go through nginx (Host: echobase-green-frontend or similar)
- **Identify request source**: Match timestamps and request patterns to determine which test generated which log entries

### Additional Network Diagnostics
- **Container IP addresses**: `docker inspect <container> --format='{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}'`
- **Port mappings**: `docker port <container>` to verify host-to-container port bindings
- **Full HTTP chain test**: `curl -v -k https://frontend:443/api/health` to see headers, SSL handshake, and response at each hop
- **Container health**: `docker inspect <container> --format='{{.State.Health.Status}}'` - unhealthy containers may reject connections
- **nginx upstream test**: `docker exec <frontend> curl -v -k https://api-gateway:3001/health` to test nginx's view of backend
- **SSL certificate check**: `docker exec <frontend> openssl s_client -connect api-gateway:3001 -servername api-gateway </dev/null 2>/dev/null | openssl x509 -noout -dates` to verify cert validity
- **Network driver**: `docker network inspect <network> --format='{{.Driver}}'` - should be "bridge" for local networks
- **All networks for container**: `docker inspect <container> --format='{{range $k, $v := .NetworkSettings.Networks}}{{$k}} {{end}}'` - container may be missing from expected network
