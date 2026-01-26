# Claude AI Development Guide for Echobase

This document provides critical context for AI assistants working on this codebase. It documents architectural patterns, conventions, common pitfalls, and decision-making guidelines to ensure changes work correctly on the first attempt.

## Table of Contents
- [Build and Development Commands](#build-and-development-commands)
- [Core Architecture Principles](#core-architecture-principles)
- [Environment Variable Conventions](#environment-variable-conventions)
- [CI/CD Environment Constraints](#cicd-environment-constraints)
- [Blue/Green Deployment Architecture](#bluegreen-deployment-architecture)
- [Testing and Validation Patterns](#testing-and-validation-patterns)
- [Common Pitfalls](#common-pitfalls)
- [Decision-Making Guidelines](#decision-making-guidelines)
- [Testing Your Changes](#testing-your-changes)
- [Quick Reference](#quick-reference)
- [Project Memory System](#project-memory-system)
- [Document Maintenance](#document-maintenance)

---

## Build and Development Commands

### Quick Start
```bash
./setup.sh                    # One-command setup (credentials, deps, durable infra, containers)
./start.sh                    # Start application services (assumes durable infra exists)
```

### Testing
```bash
# API Gateway tests (Jest)
cd backend/api-gateway && npm test              # All tests
cd backend/api-gateway && npm run test:security # Security tests only
cd backend/api-gateway && npm run test:watch    # Watch mode

# E2E tests (Playwright)
cd e2e-tests && npm test                        # All E2E tests
cd e2e-tests && npm run test:api                # API tests only
cd e2e-tests && npm run test:frontend           # Frontend tests only
cd e2e-tests && npm run test:security           # Security tests only
cd e2e-tests && npm run test:headed             # Run with browser visible
cd e2e-tests && npm run test:debug              # Debug mode
```

### Infrastructure Management
```bash
# Durable infrastructure (database, secrets, nginx)
./durable/setup.sh devlocal           # Setup for local dev
./durable/setup.sh ci                 # Setup for CI
./durable/teardown.sh devlocal        # Teardown (keeps data)
./durable/teardown.sh devlocal --volumes  # Teardown + delete data

# Application services
docker compose up -d                  # Start ephemeral services
docker compose down                   # Stop ephemeral services
docker compose up -d --build          # Rebuild and start
docker compose logs -f api-gateway    # Follow specific service logs

# Terraform (SQS queues in ephemeral LocalStack)
cd terraform && terraform init && terraform apply -auto-approve
```

### Blue/Green Deployment Scripts
```bash
./scripts/detect-target-environment.sh    # Which env to deploy to (queries nginx)
./scripts/get-active-environment.sh       # Current production env
./scripts/switch-traffic.sh [blue|green]  # Switch production traffic
```

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

✅ **DO**:
- Store state in durable layer (database, durable LocalStack)
- Create resources in correct LocalStack instance:
  - **Durable resources** (credentials, state) → `echobase-ci-durable-localstack`
  - **Ephemeral resources** (SQS queues) → `echobase-{blue|green}-localstack`
- Make services degrade gracefully when dependencies are missing
- Use transactional credential setup: Secrets Manager FIRST, then database

❌ **DON'T**:
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
  - If Terraform fails: No database created, nothing to clean up ✓
  - If database fails: Credentials in Secrets Manager, retry will use same credentials ✓

**Implementation** (`durable/setup.sh` lines 90-194):
```bash
# Step 1: Ensure LocalStack running
# Step 2: Check Secrets Manager for credentials
# Step 3: If no credentials → Generate → Store in Secrets Manager → THEN create DB
# Step 4: If credentials exist → Use them to create/verify DB
```

**Error Handling:**
- If Terraform fails: Script exits, database not created
- If database fails: Credentials remain in Secrets Manager for retry
- No orphaned credentials possible

---

## Environment Variable Conventions

### Naming Patterns

Environment variables follow strict naming conventions:

```bash
# Pattern: {ENV}_{SERVICE}_{PROPERTY}
DEV_LOCAL_API_PORT="3001"
GREEN_FRONTEND_PORT="3543"
BLUE_LOCALSTACK_PORT="4667"
```

### Environment-Specific Variables

**When passing to containers**, use the **exact environment name**:

```yaml
# CORRECT - Environment name matches deployment
- GREEN_FRONTEND_PORT=${GREEN_FRONTEND_PORT}

# WRONG - Generic name won't work
- TARGET_FRONTEND_PORT=${GREEN_FRONTEND_PORT}
```

**Why**: Containers may have hardcoded references to specific environment variables (e.g., `process.env.GREEN_FRONTEND_PORT` in tests).

### Port Allocation Map

| Service | Dev-Local | CI Blue | CI Green |
|---------|-----------|---------|----------|
| API Gateway | 3001 | 3102 | 3101 |
| Frontend HTTPS | 3443 | 3544 | 3543 |
| Frontend HTTP | 3000 | 3200 | 3100 |
| LocalStack | 4566 | 4667 | 4666 |
| MariaDB | 3306 (durable) | 3307 (durable) | 3307 (shared) |

**Note**: Blue and Green share the **same durable database** in CI (port 3307).

---

## CI/CD Environment Constraints

### What's Available in GitLab CI

✅ **Available**:
- Docker, Docker Compose
- Bash, standard Unix utilities
- Alpine Linux packages (via `apk add`)
- Node.js, npm
- Python, git

❌ **NOT Available by Default**:
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

---

## Common Pitfalls

### 1. **Querying Wrong State Source**

❌ **WRONG**:
```bash
PRODUCTION_ENV="blue"  # Hardcoded guess
```

✅ **CORRECT**:
```bash
PRODUCTION_ENV=$(./scripts/get-active-environment.sh)
```

### 2. **Hardcoded Environment Names**

❌ **WRONG**:
```yaml
script:
  - docker compose -p echobase-green ps  # Only works for green
```

✅ **CORRECT**:
```yaml
script:
  - DEPLOY_TARGET=$(scripts/detect-target-environment.sh)
  - docker compose -p echobase-$DEPLOY_TARGET ps
```

### 3. **nginx on Host vs Container**

❌ **WRONG**:
```bash
nginx -s reload  # Fails - nginx runs in container, not on host
```

✅ **CORRECT**:
```bash
docker exec "$NGINX_CONTAINER" nginx -s reload
```

### 4. **Wrong LocalStack Instance**

❌ **WRONG**: Creating durable resources in ephemeral LocalStack
✅ **CORRECT**:
- Durable resources → `echobase-ci-durable-localstack`
- Ephemeral resources → `echobase-{blue|green}-localstack`

### 5. **Non-Transactional Credential Setup**

❌ **WRONG**: Generate creds → Create database → Store in Secrets Manager
✅ **CORRECT**: Generate creds → Store in Secrets Manager → THEN create database

### 6. **Relying on Artifacts for State**

❌ **WRONG**:
```yaml
- DEPLOY_TARGET=$(cat .deploy-target)  # What if artifact missing?
```

✅ **CORRECT**:
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
- Add general guidelines to `docs/project_notes/guidelines.md` that capture the broader lessons

### When Modifying CI Pipeline

**Safety checklist**:

- [ ] Does job handle missing artifacts? (use `|| echo` fallbacks)
- [ ] Does after_script handle failures?
- [ ] Are environment names parameterized? (use `$DEPLOY_TARGET`)
- [ ] Does it work without optional services?
- [ ] Are new jobs added to correct stage?
- [ ] Do dependencies chain correctly?

---

## Testing Your Changes

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

## Quick Reference

### Critical Files

```
.gitlab-ci.yml              # CI pipeline definition
docker-compose.yml          # Base ephemeral services
docker-compose.blue.yml     # Blue environment overrides
docker-compose.green.yml    # Green environment overrides
durable/docker-compose.yml  # Durable infrastructure

scripts/
├── detect-target-environment.sh   # Which env to deploy to (queries nginx)
├── get-active-environment.sh      # Read current production from nginx
├── switch-traffic.sh              # Orchestrate traffic switch (updates nginx)
└── generate-nginx-config.sh       # Generate nginx config
```

### Common Commands

```bash
# Detect target
./scripts/detect-target-environment.sh

# Get active production environment (from nginx)
./scripts/get-active-environment.sh

# Switch production
./scripts/switch-traffic.sh [blue|green]

# Deploy environment
docker compose -f docker-compose.yml -f docker-compose.[blue|green].yml \
  -p echobase-[blue|green] up -d

# Teardown (with safety check)
PROD=$(./scripts/get-active-environment.sh)
if [ "$PROD" != "blue" ]; then
  docker compose -p echobase-blue down
fi
```

---

## ADRs and Documentation

- `docs/project_notes/ADR-001-encryption-key-secrets-manager.md` - Encryption key architecture
- `docs/BLUE-GREEN-DEPLOYMENT.md` - Deployment architecture
- `docs/SECURITY.md` - Security overview
- `TrustBoundaries.md` - Attack surface analysis

---

## Project Memory System

This project maintains institutional knowledge in `docs/project_notes/` for consistency across sessions.

### Memory Files

- **bugs.md** - Bug log with dates, solutions, and prevention notes
- **guidelines.md** - General development guidelines learned from past bugs (READ THIS FILE)
- **decisions.md** - Index of Architectural Decision Records (ADRs)
- **key_facts.md** - Project configuration, ports, secrets paths, important URLs
- **issues.md** - Work log with ticket IDs and descriptions

### Memory-Aware Protocols

**Before proposing architectural changes:**
- Check `docs/project_notes/decisions.md` for existing decisions
- Verify the proposed approach doesn't conflict with past choices
- If it does conflict, acknowledge the existing decision and explain why a change is warranted

**Before modifying smoke tests, curl commands, nginx routing, shell scripts, or CORS/CSRF handling:**
- Read `docs/project_notes/guidelines.md` first
- These capture lessons learned about endpoint routing, network modes, shell escaping, and Origin header requirements

**When adding new code or infrastructure:**
- Always include appropriate logging for failure diagnostics
- See `docs/project_notes/guidelines.md` "Logging and Diagnostics" section

**When encountering errors or bugs:**
- Search `docs/project_notes/bugs.md` for similar issues
- Apply known solutions if found
- Document new bugs and solutions when resolved

**When fixing a bug:**
- Add the specific bug to `docs/project_notes/bugs.md`
- Add general guidelines to `docs/project_notes/guidelines.md` that capture the broader lessons

**When looking up project configuration:**
- Check `docs/project_notes/key_facts.md` for ports, secrets paths, container naming
- Prefer documented facts over assumptions

**When completing work on tickets:**
- Log completed work in `docs/project_notes/issues.md`
- Include ticket ID, date, brief description

**When user requests memory updates:**
- Update the appropriate memory file (bugs, decisions, key_facts, or issues)
- Follow the established format and style (bullet lists, dates, concise entries)

---

## Document Maintenance

**When to update this document**:

- New architectural patterns introduced
- Common bugs/pitfalls discovered
- CI environment capabilities change
- New conventions established
- Breaking changes to deployment model

**Last Updated**: 2026-01-23
**Version**: 2.3 (Added Project Memory System, Build Commands)
