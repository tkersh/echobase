# Key Facts

Non-sensitive project configuration, constants, and frequently-needed reference information.

## Security Warning

**NEVER store passwords, API keys, or sensitive credentials in this file.** This file is committed to version control.

**Where to store secrets:**
- Secrets Manager (durable LocalStack): `echobase/database/credentials`, `echobase/database/encryption-key`
- Environment variables in `.env` files (excluded via `.gitignore`)

---

## Build and Development Commands

### Quick Start
```bash
./start.sh                    # Single entrypoint: setup + start (idempotent)
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

## Infrastructure Architecture

**Two-Layer Model:**
- **Durable Layer**: MariaDB, Secrets Manager (LocalStack), nginx - persistent infrastructure
- **Ephemeral Layer**: API Gateway, Frontend, Order Processor, SQS (LocalStack) - blue/green deployable

**Container Naming:**
- Durable: `echobase-{devlocal|ci}-durable-{service}`
- Ephemeral Blue: `echobase-blue-{service}`
- Ephemeral Green: `echobase-green-{service}`

---

## Port Allocation

### Dev-Local Environment
| Service | Port |
|---------|------|
| API Gateway | 3001 |
| Frontend HTTPS | 3443 |
| Frontend HTTP | 3000 |
| LocalStack (ephemeral) | 4566 |
| MariaDB | 3306 |

### CI Blue Environment
| Service | Port |
|---------|------|
| API Gateway | 3102 |
| Frontend HTTPS | 3544 |
| Frontend HTTP | 3200 |
| LocalStack (ephemeral) | 4667 |
| MariaDB | 3307 (shared) |

### CI Green Environment
| Service | Port |
|---------|------|
| API Gateway | 3101 |
| Frontend HTTPS | 3543 |
| Frontend HTTP | 3100 |
| LocalStack (ephemeral) | 4666 |
| MariaDB | 3307 (shared) |

**Note**: Blue and Green share the **same durable database** in CI (port 3307).

---

## Secrets Manager Paths

All secrets stored in durable LocalStack at runtime:

- `echobase/database/credentials` - MariaDB username/password
- `echobase/database/encryption-key` - MariaDB AES-256 encryption key (see ADR-001)

---

## Critical Files

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

---

## Key Configuration Files

| File | Purpose |
|------|---------|
| `docker-compose.yml` | Base ephemeral services (no ports) |
| `docker-compose.override.yml` | Dev-local ports (auto-loaded) |
| `docker-compose.blue.yml` | CI blue environment |
| `docker-compose.green.yml` | CI green environment |
| `durable/docker-compose.yml` | Persistent infrastructure |
| `.gitlab-ci.yml` | CI pipeline definition |

---

## Environment Variable Naming

Pattern: `{ENV}_{SERVICE}_{PROPERTY}`

Examples:
- `DEV_LOCAL_API_PORT="3001"`
- `GREEN_FRONTEND_PORT="3543"`
- `BLUE_LOCALSTACK_PORT="4667"`

**Important:** Containers expect exact env-prefixed names. Don't use generic names like `FRONTEND_PORT`.

---

## LocalStack Instances

| Instance | Purpose | Persistence |
|----------|---------|-------------|
| Durable (`echobase-{env}-durable-localstack`) | Secrets Manager, KMS | Persistent |
| Ephemeral (`echobase-{blue\|green}-localstack`) | SQS queues | Per-deployment |

---

## Important URLs and Documentation

- Deployment Architecture: `docs/BLUE-GREEN-DEPLOYMENT.md`
- Security Overview: `docs/SECURITY.md`
- Trust Boundaries: `TrustBoundaries.md`
- Encryption Key ADR: `docs/project_notes/ADR-001-encryption-key-secrets-manager.md`

---

## Tips

- Keep entries current (update when things change)
- Mark deprecated items clearly with dates
- Include both production and development details
- Use consistent formatting
