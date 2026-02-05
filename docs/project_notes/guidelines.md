# Development Guidelines

Lessons learned from past bugs and architectural patterns - check these before modifying related code.

---

## Core Architecture Principles

### Two-Layer Infrastructure Model

**CRITICAL**: The system uses a **durable + ephemeral** architecture pattern:

1. **Durable Layer** (Persistent across deployments)
   - Location: `durable/docker-compose.yml`
   - Components: MariaDB, LocalStack (Secrets Manager, KMS), **nginx Load Balancer**
   - Managed independently with `./durable/setup.sh [devlocal|ci]`
   - **NEVER torn down during blue/green deployments**
   - Environments:
     - `devlocal`: Container prefix `echobase-devlocal-durable-`, port 3306
     - `ci`: Container prefix `echobase-ci-durable-`, port 3307
   - **nginx LB**: Routes production traffic and tracks active environment (single source of truth)
   - **nginx config/certs**: Baked into Docker image at build time (no volume mounts needed)

2. **Ephemeral Layer** (Blue/Green deployable)
   - Location: `docker-compose.yml` + environment-specific overrides
   - Components: API Gateway, Frontend, Order Processor, LocalStack (SQS only)
   - Can be deployed/destroyed without data loss
   - Multiple environments run simultaneously

### Data Flow
```
Frontend (React) → API Gateway (Express) → SQS Queue → Order Processor → MariaDB
                        ↓
              Secrets Manager (credentials)
```

### Key Architectural Rules

**DO**:
- Store state in durable layer (database, durable LocalStack)
- Create resources in correct LocalStack instance:
  - **Durable resources** (credentials, state) → `echobase-ci-durable-localstack`
  - **Ephemeral resources** (SQS queues) → `echobase-{blue|green}-localstack`
- Make services degrade gracefully when dependencies are missing
- Use transactional credential setup: Secrets Manager FIRST, then database

**DON'T**:
- Store persistent state in ephemeral containers
- Create durable resources (S3 buckets, secrets) via Terraform (ephemeral LocalStack)
- Assume services like nginx are configured in CI
- Create database before storing credentials in Secrets Manager

### Transactional Credential Setup

**CRITICAL**: Credential setup in `durable/setup.sh` follows a transactional pattern to ensure Secrets Manager (source of truth) and database credentials are ALWAYS consistent:

**Setup Flow:**
1. **Start LocalStack FIRST** (needed for Secrets Manager)
2. **Check Secrets Manager** for existing credentials
3. **If credentials exist**: Retrieve and use them
4. **If credentials don't exist**:
   a. Generate new credentials
   b. **Store in Secrets Manager via Terraform** (if this fails → abort, don't create database)
   c. **Then create database** with those credentials
5. **Verify** database credentials match Secrets Manager

**Why This Matters:**
- **Old broken approach**: Generate creds → Create database → Store in Secrets Manager
  - Problem: If Terraform fails, database has orphaned credentials
- **New transactional approach**: Generate creds → Store in Secrets Manager → Create database
  - If Terraform fails: No database created, nothing to clean up
  - If database fails: Credentials in Secrets Manager, retry will use same credentials

**Error Handling:**
- If Terraform fails: Script exits, database not created
- If database fails: Credentials remain in Secrets Manager for retry
- No orphaned credentials possible

---

## CI/CD Environment Constraints

### What's Available in GitLab CI

**Available**:
- Docker, Docker Compose
- Bash, standard Unix utilities
- Alpine Linux packages (via `apk add`)
- Node.js, npm
- Python, git

**NOT Available by Default**:
- nginx (must be installed with `apk add nginx`)
- Full systemd/init system
- GUI tools
- Persistent filesystem between jobs (use artifacts)

### nginx in CI

**IMPORTANT**: nginx runs in BOTH devlocal and CI environments:

- **Purpose**: nginx is the single source of truth for which environment (blue/green) is active
- **How it works**: nginx config and SSL certs are baked into the Docker image at build time
- **No volume mounts**: Avoids GitLab CI's `/builds/` directory mount restrictions
- **Ports**: 443 (HTTPS), 80 (HTTP), 8080 (blue direct), 8081 (green direct)

**Updating nginx config**:
- Scripts use `docker exec` to update config inside the container
- Example: `docker exec $NGINX_CONTAINER sh -c "cat > /etc/nginx/conf.d/default.conf" < new-config.conf`
- Reload: `docker exec $NGINX_CONTAINER nginx -s reload`

**Pattern for scripts**: nginx is REQUIRED (no fallback):

```bash
NGINX_CONTAINER="${DURABLE_CONTAINER_PREFIX}-nginx"
if ! docker inspect "$NGINX_CONTAINER" >/dev/null 2>&1; then
    echo "ERROR: nginx container not found - cannot proceed"
    exit 1
fi
docker exec "$NGINX_CONTAINER" nginx -s reload
```

### GitLab Runner Requirement

**CRITICAL**: All CI jobs that access Docker must run on the **SAME runner**.

The durable infrastructure (MariaDB, LocalStack, nginx) runs as Docker containers on the runner.
If `durable:setup-ci` runs on Runner A and `deploy:target` runs on Runner B, the deployment
will fail because Runner B cannot see containers from Runner A.

**Ensure only ONE runner has the `docker-local` tag**, or use a unique tag for the runner.

Symptoms of multi-runner issues:
- `docker inspect` fails for containers that exist
- "nginx container not found" when nginx is clearly running
- Different hostnames in diagnostic output between jobs

### CI and Devlocal Parity

**PRINCIPLE**: Always make CI match devlocal as closely as possible.

When CI and devlocal behave differently, debugging becomes harder and kludges accumulate. If you find yourself writing CI-specific workarounds, step back and consider whether devlocal should work the same way.

**Specific guidance**:

1. **Environment variable precedence**: If CI uses `-e VAR=value` flags (environment variables), devlocal should use the same precedence model. Don't use `dotenv({ override: true })` which makes file values win over env vars — this forces CI to overwrite files instead of simply setting env vars.

2. **File loading order**: Both environments should load config files in the same order. If CI loads `.env` then `.env.secrets`, devlocal should too.

3. **Network and hostname resolution**: If CI uses container names (`echobase-ci-durable-mariadb`), devlocal config files should use `localhost` only as a fallback that gets overridden by env vars, not as a hardcoded default.

**Anti-pattern**: Writing CI-specific code that overwrites files, deletes configs, or patches values because "devlocal does it differently." Instead, make devlocal work the same way.

**Example (dotenv)**:
```javascript
// WRONG - file values override env vars, requires CI workarounds
dotenv.config({ path: '.env', override: true });

// CORRECT - env vars take precedence (CI's -e flags work naturally)
dotenv.config({ path: '.env' });  // No override: true
```

---

## Blue/Green Deployment Architecture

### How Deployment Detection Works

The system queries nginx to choose which environment to deploy to:

```
┌─────────────────────────────────────────────────┐
│ detect-target-environment.sh                    │
├─────────────────────────────────────────────────┤
│ 1. Query nginx for active environment           │
│ 2. Deploy to the OTHER environment:             │
│    - nginx says blue active → deploy to green   │
│    - nginx says green active → deploy to blue   │
│    - nginx says none (bootstrap) → deploy green │
│ 3. If nginx unavailable → FAIL (no fallback)    │
└─────────────────────────────────────────────────┘
```

**IMPORTANT**: nginx is REQUIRED. If the script cannot query nginx, deployment fails.
This prevents accidentally deploying to the wrong environment.

### State Management: nginx as Single Source of Truth

**CRITICAL**: Production state is stored **only in nginx config** (durable infrastructure):

1. **Single Source**: nginx config in durable container
   - File: `/etc/nginx/conf.d/default.conf`
   - Active environment determined by which upstream is proxied
   - Persists across all deployments (nginx in durable layer)

2. **Query pattern**: All jobs query nginx directly

```bash
# Get active environment
./scripts/get-active-environment.sh
# Returns: "blue", "green", or "none" (by parsing nginx config)

# Detect deployment target
./scripts/detect-target-environment.sh
# Queries nginx, deploys to OTHER environment
```

3. **No docker labels, no S3 state files needed** - nginx config is the truth

**Why nginx only**:
- Single source of truth (no synchronization issues)
- Persists in durable infrastructure
- Survives container restarts
- Can be queried anytime
- Matches what actually routes traffic

### LocalStack Instances

- **Durable** (`echobase-{env}-durable-localstack`): Secrets Manager, KMS - persistent
- **Ephemeral** (`echobase-{blue|green}-localstack`): SQS queues - per-deployment

---

## Testing and Validation Patterns

### Health Checks

Use existing patterns from `scripts/wait-for-services.sh`:

```bash
# CORRECT - Use existing utility
scripts/wait-for-services.sh echobase-$ENV api-gateway frontend

# WRONG - Custom health check logic (duplicates code)
while ! curl localhost:3001/health; do sleep 1; done
```

### Error Handling in Scripts

**Pattern**: Fail fast with clear errors, but degrade gracefully for optional features:

```bash
# Required feature - fail hard
if ! docker inspect "$CONTAINER" >/dev/null 2>&1; then
    echo "ERROR: Container $CONTAINER not found"
    exit 1
fi

# Optional feature - warn and continue
if command -v nginx >/dev/null 2>&1; then
    nginx -s reload || echo "WARNING: nginx reload failed"
else
    echo "WARNING: nginx not available (using direct ports)"
fi
```

### CI Job after_script

**Always make after_script resilient** - it runs even on failure:

```yaml
# CORRECT - Queries nginx with fallback
after_script:
  - DEPLOY_TARGET=$(scripts/detect-target-environment.sh 2>/dev/null || echo "unknown")
  - docker compose -p echobase-$DEPLOY_TARGET logs --tail=50
```

### Local Testing Before CI

```bash
# 1. Deploy both environments locally
docker compose -f docker-compose.yml -f docker-compose.blue.yml -p echobase-blue up -d
docker compose -f docker-compose.yml -f docker-compose.green.yml -p echobase-green up -d

# 2. Test detection logic
./scripts/detect-target-environment.sh

# 3. Test state management
./scripts/switch-traffic.sh blue
./scripts/get-active-environment.sh

# 4. Test traffic switching
./scripts/switch-traffic.sh green

# 5. Verify both environments accessible
curl -k https://localhost:8080  # Blue direct
curl -k https://localhost:8081  # Green direct
```

### Validation Checklist

Before pushing changes:

- [ ] All scripts are executable (`chmod +x scripts/*.sh`)
- [ ] Port conflicts checked (no overlapping ports)
- [ ] Environment variables defined in `.gitlab-ci.yml`
- [ ] Jobs have proper needs/dependencies
- [ ] Error messages are descriptive

---

## Common Pitfalls

### 1. Querying Wrong State Source

**WRONG**:
```bash
PRODUCTION_ENV="blue"  # Hardcoded guess
```

**CORRECT**:
```bash
PRODUCTION_ENV=$(./scripts/get-active-environment.sh)
```

### 2. Hardcoded Environment Names

**WRONG**:
```yaml
script:
  - docker compose -p echobase-green ps  # Only works for green
```

**CORRECT**:
```yaml
script:
  - DEPLOY_TARGET=$(scripts/detect-target-environment.sh)
  - docker compose -p echobase-$DEPLOY_TARGET ps
```

### 3. nginx on Host vs Container

**WRONG**:
```bash
nginx -s reload  # Fails - nginx runs in container, not on host
```

**CORRECT**:
```bash
docker exec "$NGINX_CONTAINER" nginx -s reload
```

### 4. Wrong LocalStack Instance

**WRONG**: Creating durable resources in ephemeral LocalStack

**CORRECT**:
- Durable resources → `echobase-ci-durable-localstack`
- Ephemeral resources → `echobase-{blue|green}-localstack`

### 5. Non-Transactional Credential Setup

**WRONG**: Generate creds → Create database → Store in Secrets Manager

**CORRECT**: Generate creds → Store in Secrets Manager → THEN create database

### 6. Relying on Artifacts for State

**WRONG**:
```yaml
- DEPLOY_TARGET=$(cat .deploy-target)  # What if artifact missing?
```

**CORRECT**:
```yaml
- DEPLOY_TARGET=$(scripts/detect-target-environment.sh)  # Queries nginx
```

---

## Decision-Making Guidelines

### When Adding New Features

**Ask these questions**:

1. **Is this state durable or ephemeral?**
   - Durable → Use nginx config, durable database, or durable LocalStack
   - Ephemeral → Use ephemeral LocalStack or container state

2. **Does this work in both blue and green?**
   - Use `$DEPLOY_TARGET` variable
   - Don't hardcode environment names

3. **What if this service isn't available?**
   - Make it optional with warnings
   - Provide fallback behavior

4. **How is this tested in CI?**
   - CI has limited services
   - Validate in CI-like conditions

### When Fixing Bugs

**Check for these patterns**:

1. Not querying nginx for state
2. Environment variable mismatch
3. Wrong LocalStack instance
4. Hardcoded assumptions
5. Database credential mismatches

**Then**:
- Add the specific bug to `docs/project_notes/bugs.md`
- Add general guidelines to this file that capture the broader lessons

### When Modifying CI Pipeline

**Safety checklist**:

- [ ] Does job handle missing artifacts? (use `|| echo` fallbacks)
- [ ] Does after_script handle failures?
- [ ] Are environment names parameterized? (use `$DEPLOY_TARGET`)
- [ ] Does it work without optional services?
- [ ] Are new jobs added to correct stage?
- [ ] Do dependencies chain correctly?

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
